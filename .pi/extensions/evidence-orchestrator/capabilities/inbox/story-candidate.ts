import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import type {
  InboxCandidateReadiness,
  InboxCognitiveMode,
  InboxStoryCandidate,
  InboxStoryCitation,
} from './model';
import {
  INBOX_ID_PATTERN,
  inboxRevisionByHash,
  latestInboxRevision,
  readInboxState,
} from './repository';

export const INBOX_CANDIDATES_ROOT = 'artifacts/inbox/candidates';
export const INBOX_CANDIDATE_ID_PATTERN = /^CAND-\d{4,}$/;
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;
const COGNITIVE_MODES = new Set<InboxCognitiveMode>([
  'clear',
  'complicated',
  'complex',
]);

export interface InboxStoryCandidateProposal {
  title: string;
  problem: string;
  role: string;
  goal: string;
  value: string;
  cognitiveMode: InboxCognitiveMode;
  citations: Array<{
    inboxId: string;
    revisionSha256: string;
    locator: string;
  }>;
}

function text(value: unknown, name: string, singleLine = false): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Inbox Story ${name} must not be empty.`);
  }
  const normalized = value.trim();
  if (singleLine && /[\r\n]/.test(normalized)) {
    throw new Error(`Inbox Story ${name} must be a single line.`);
  }
  return normalized;
}

function canonicalJson(value: unknown): string {
  const normalize = (entry: unknown): unknown => {
    if (Array.isArray(entry)) return entry.map(normalize);
    if (entry && typeof entry === 'object') {
      return Object.fromEntries(
        Object.entries(entry)
          .filter(([, child]) => child !== undefined)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, child]) => [key, normalize(child)]),
      );
    }
    return entry;
  };
  return JSON.stringify(normalize(value));
}

function candidateHash(
  candidate: Omit<InboxStoryCandidate, 'content_sha256'>,
): string {
  return `sha256:${createHash('sha256')
    .update(canonicalJson(candidate))
    .digest('hex')}`;
}

function candidatePath(candidateId: string): string {
  return `${INBOX_CANDIDATES_ROOT}/${candidateId}.json`;
}

function nextCandidateNumber(cwd: string): number {
  const root = join(cwd, INBOX_CANDIDATES_ROOT);
  if (!existsSync(root)) return 1;
  return (
    readdirSync(root)
      .map((name) => name.match(/^CAND-(\d{4,})\.json$/)?.[1])
      .filter((value): value is string => Boolean(value))
      .map(Number)
      .reduce((highest, value) => Math.max(highest, value), 0) + 1
  );
}

function normalizeCitations(
  cwd: string,
  allowedSourceIds: Set<string>,
  citations: InboxStoryCandidateProposal['citations'],
): InboxStoryCitation[] {
  if (!Array.isArray(citations) || citations.length === 0) {
    throw new Error('An Inbox Story candidate requires source citations.');
  }
  const normalized = citations.map((citation) => {
    const inboxId = text(citation.inboxId, 'citation Inbox id', true);
    const revisionSha256 = text(
      citation.revisionSha256,
      'citation revision hash',
      true,
    );
    if (!allowedSourceIds.has(inboxId)) {
      throw new Error(`Candidate cites an unselected Inbox item: ${inboxId}.`);
    }
    if (!SHA256_PATTERN.test(revisionSha256)) {
      throw new Error(`Invalid Inbox revision hash: ${revisionSha256}.`);
    }
    const revision = inboxRevisionByHash(cwd, inboxId, revisionSha256);
    const latest = latestInboxRevision(cwd, inboxId);
    if (revision.content_sha256 !== latest.content_sha256) {
      throw new Error(
        `Candidate must cite the latest Inbox revision: ${inboxId}.`,
      );
    }
    return {
      inbox_id: inboxId,
      revision_sha256: revisionSha256,
      locator: text(citation.locator, 'citation locator', true),
    };
  });
  const keys = normalized.map(
    ({ inbox_id, revision_sha256, locator }) =>
      `${inbox_id}\u0000${revision_sha256}\u0000${locator}`,
  );
  if (new Set(keys).size !== keys.length) {
    throw new Error('Inbox Story citations must be unique.');
  }
  return normalized;
}

function parseCandidate(path: string): InboxStoryCandidate {
  let candidate: InboxStoryCandidate;
  try {
    candidate = JSON.parse(readFileSync(path, 'utf8')) as InboxStoryCandidate;
  } catch {
    throw new Error(`Inbox Story candidate JSON is invalid: ${path}.`);
  }
  if (
    candidate.version !== 1 ||
    !INBOX_CANDIDATE_ID_PATTERN.test(candidate.candidate_id) ||
    !candidate.title?.trim() ||
    !candidate.problem?.trim() ||
    !candidate.role?.trim() ||
    !candidate.goal?.trim() ||
    !candidate.value?.trim() ||
    !COGNITIVE_MODES.has(candidate.cognitive_mode) ||
    !Array.isArray(candidate.citations) ||
    candidate.citations.length === 0 ||
    candidate.citations.some(
      ({ inbox_id, revision_sha256, locator }) =>
        !INBOX_ID_PATTERN.test(inbox_id) ||
        !SHA256_PATTERN.test(revision_sha256) ||
        !locator?.trim(),
    ) ||
    candidate.proposed_by !== 'inbox-analyst' ||
    !candidate.proposed_at?.trim() ||
    candidate.artifact_path !== candidatePath(candidate.candidate_id) ||
    !SHA256_PATTERN.test(candidate.content_sha256)
  ) {
    throw new Error(`Inbox Story candidate is invalid: ${path}.`);
  }
  const { content_sha256: persistedHash, ...withoutHash } = candidate;
  if (candidateHash(withoutHash) !== persistedHash) {
    throw new Error(`Inbox Story candidate hash is inconsistent: ${path}.`);
  }
  return candidate;
}

export function listInboxStoryCandidates(cwd: string): InboxStoryCandidate[] {
  const root = join(cwd, INBOX_CANDIDATES_ROOT);
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((name) => /^CAND-\d{4,}\.json$/.test(name))
    .sort()
    .map((name) => parseCandidate(join(root, name)));
}

export function inboxCandidateReadiness(
  cwd: string,
  candidate: InboxStoryCandidate,
): InboxCandidateReadiness {
  return candidate.citations.every(({ inbox_id, revision_sha256 }) => {
    try {
      return (
        latestInboxRevision(cwd, inbox_id).content_sha256 === revision_sha256
      );
    } catch {
      return false;
    }
  })
    ? 'ready'
    : 'stale';
}

/** Persist one to five AI-authored candidates without assigning a US-xxx id. */
export function proposeInboxStoryCandidates(
  cwd: string,
  sourceIds: string[],
  proposals: InboxStoryCandidateProposal[],
  now = new Date().toISOString(),
): InboxStoryCandidate[] {
  if (
    !Array.isArray(sourceIds) ||
    sourceIds.length === 0 ||
    sourceIds.length > 5 ||
    new Set(sourceIds).size !== sourceIds.length ||
    sourceIds.some((id) => !INBOX_ID_PATTERN.test(id))
  ) {
    throw new Error('Story extraction requires one to five unique Inbox ids.');
  }
  if (
    !Array.isArray(proposals) ||
    proposals.length === 0 ||
    proposals.length > 5
  ) {
    throw new Error('Story extraction must propose one to five candidates.');
  }
  const state = readInboxState(cwd);
  for (const sourceId of sourceIds) {
    const item = state.items.find(({ inbox_id }) => inbox_id === sourceId);
    if (!item || item.status !== 'active') {
      throw new Error(`Inbox source is not active: ${sourceId}.`);
    }
  }
  const allowedSourceIds = new Set(sourceIds);
  const firstNumber = nextCandidateNumber(cwd);
  const candidates = proposals.map((proposal, index) => {
    if (!COGNITIVE_MODES.has(proposal.cognitiveMode)) {
      throw new Error(`Unsupported cognitive mode: ${proposal.cognitiveMode}.`);
    }
    const candidateId = `CAND-${String(firstNumber + index).padStart(4, '0')}`;
    const withoutHash: Omit<InboxStoryCandidate, 'content_sha256'> = {
      version: 1,
      candidate_id: candidateId,
      title: text(proposal.title, 'title', true),
      problem: text(proposal.problem, 'problem'),
      role: text(proposal.role, 'role', true),
      goal: text(proposal.goal, 'goal', true),
      value: text(proposal.value, 'value', true),
      cognitive_mode: proposal.cognitiveMode,
      citations: normalizeCitations(cwd, allowedSourceIds, proposal.citations),
      proposed_by: 'inbox-analyst',
      proposed_at: now,
      artifact_path: candidatePath(candidateId),
    };
    return { ...withoutHash, content_sha256: candidateHash(withoutHash) };
  });
  const citedSourceIds = new Set(
    candidates.flatMap(({ citations }) =>
      citations.map(({ inbox_id }) => inbox_id),
    ),
  );
  const omitted = sourceIds.filter((sourceId) => !citedSourceIds.has(sourceId));
  if (omitted.length) {
    throw new Error(
      `Story extraction did not cite selected Inbox sources: ${omitted.join(', ')}.`,
    );
  }
  for (const candidate of candidates) {
    const path = join(cwd, candidate.artifact_path);
    mkdirSync(dirname(path), { recursive: true });
    if (existsSync(path)) {
      throw new Error(
        `Inbox Story candidate already exists: ${candidate.candidate_id}.`,
      );
    }
    writeFileSync(path, `${JSON.stringify(candidate, null, 2)}\n`);
  }
  return candidates;
}

export function validateInboxStoryCandidates(cwd: string): void {
  for (const candidate of listInboxStoryCandidates(cwd)) {
    for (const { inbox_id, revision_sha256 } of candidate.citations) {
      inboxRevisionByHash(cwd, inbox_id, revision_sha256);
    }
  }
}
