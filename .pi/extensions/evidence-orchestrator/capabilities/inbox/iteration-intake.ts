import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ensureProjectDirs } from '../../iteration/artifact-inventory';
import {
  iterationRoot,
  iterationRootRelative,
  nextIterationId,
} from '../../iteration/artifact-layout';
import { DEFAULT_STATE } from '../../iteration/default-state';
import { readState, writeState } from '../../iteration/state-repository';
import type { InboxSourceRevision, InboxStoryCandidate } from './model';
import { inboxRevisionByHash } from './repository';
import {
  inboxCandidateStatus,
  listInboxStoryCandidates,
} from './story-candidate';
import type {
  IterationIntakeSnapshot,
  KickoffCandidate,
  WorkflowState,
} from '../../iteration/state';

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

function sha256(value: unknown): string {
  return `sha256:${createHash('sha256')
    .update(canonicalJson(value))
    .digest('hex')}`;
}

function parseJson<T>(path: string, description: string): T {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    throw new Error(`${description} is invalid JSON: ${path}.`);
  }
}

function writeImmutable(path: string, value: unknown): void {
  if (existsSync(path))
    throw new Error(`Immutable Intake path exists: ${path}.`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    typeof value === 'string'
      ? value.endsWith('\n')
        ? value
        : `${value}\n`
      : `${JSON.stringify(value, null, 2)}\n`,
  );
}

function selectedCandidate(
  cwd: string,
  candidateId: string,
): InboxStoryCandidate {
  const candidate = listInboxStoryCandidates(cwd).find(
    ({ candidate_id }) => candidate_id === candidateId,
  );
  if (!candidate) {
    throw new Error(`Inbox Story candidate does not exist: ${candidateId}.`);
  }
  const status = inboxCandidateStatus(cwd, candidate);
  if (status !== 'ready') {
    throw new Error(
      `Inbox Story candidate ${candidateId} is ${status}; select a ready candidate.`,
    );
  }
  return candidate;
}

function citedRevisions(
  cwd: string,
  candidate: InboxStoryCandidate,
): InboxSourceRevision[] {
  const seen = new Set<string>();
  return candidate.citations.flatMap(({ inbox_id, revision_sha256 }) => {
    const key = `${inbox_id}\u0000${revision_sha256}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [inboxRevisionByHash(cwd, inbox_id, revision_sha256)];
  });
}

function requirementsProjection(
  candidate: InboxStoryCandidate,
  revisions: InboxSourceRevision[],
  intake: IterationIntakeSnapshot,
): string {
  const citations = candidate.citations
    .map(
      ({ inbox_id, revision_sha256, locator }) =>
        `- ${inbox_id} @ ${revision_sha256} · ${locator}`,
    )
    .join('\n');
  const sources = revisions
    .map((revision) => {
      const frozen = intake.source_revisions.find(
        ({ inbox_id, revision_sha256 }) =>
          inbox_id === revision.inbox_id &&
          revision_sha256 === revision.content_sha256,
      );
      return `### ${revision.inbox_id} · ${revision.title}\n\n- Kind: ${revision.source_kind}\n- External key: ${revision.external_key}\n- URI: ${revision.uri ?? 'none'}\n- Revision: ${revision.content_sha256}\n- Frozen snapshot: ${frozen?.snapshot_path ?? 'missing'}\n\n${revision.body}`;
    })
    .join('\n\n');
  return `<!-- 此文件由冻结的 Evidence Inbox Intake 自动生成，请勿手工维护 -->
# Iteration Intake

## Selected Story Candidate

- Candidate: ${candidate.candidate_id}
- Title: ${candidate.title}
- Problem: ${candidate.problem}
- Role: ${candidate.role}
- Goal: ${candidate.goal}
- Value: ${candidate.value}
- Cognitive Mode: ${candidate.cognitive_mode}
- Candidate Hash: ${candidate.content_sha256}

## Citations

${citations}

## Frozen Sources

${sources}
`;
}

function kickoffCandidate(
  candidate: InboxStoryCandidate,
  artifactPath: string,
): KickoffCandidate {
  return {
    version: 1,
    title: candidate.title,
    problem: candidate.problem,
    role: candidate.role,
    goal: candidate.goal,
    value: candidate.value,
    cognitive_mode: candidate.cognitive_mode,
    source_refs: candidate.citations.map(
      ({ inbox_id, revision_sha256, locator }) =>
        `${inbox_id}@${revision_sha256} · ${locator}`,
    ),
    proposed_at: candidate.proposed_at,
    artifact_path: artifactPath,
  };
}

/** Freeze one ready Inbox candidate and its exact source revisions into a new iteration. */
export function startIterationFromCandidate(
  cwd: string,
  candidateId: string,
  now = new Date().toISOString(),
): WorkflowState {
  const candidate = selectedCandidate(cwd, candidateId.trim().toUpperCase());
  const revisions = citedRevisions(cwd, candidate);
  const iterationId = nextIterationId(cwd);
  const relativeRoot = iterationRootRelative(iterationId);
  const candidateSnapshotPath = `${relativeRoot}/00-user-input/story-candidate.json`;
  const sourceSnapshots = revisions.map((revision) => {
    const hash = revision.content_sha256.slice('sha256:'.length);
    const snapshotPath = `${relativeRoot}/00-user-input/sources/${revision.inbox_id}-${hash}.json`;
    return {
      inbox_id: revision.inbox_id,
      revision_sha256: revision.content_sha256,
      snapshot_path: snapshotPath,
      snapshot_sha256: sha256(revision),
    };
  });
  const withoutHash: Omit<IterationIntakeSnapshot, 'content_sha256'> = {
    version: 1,
    candidate_id: candidate.candidate_id,
    candidate_snapshot_path: candidateSnapshotPath,
    candidate_snapshot_sha256: sha256(candidate),
    source_revisions: sourceSnapshots,
    manifest_path: `${relativeRoot}/00-user-input/intake.json`,
    projection_path: `${relativeRoot}/00-user-input/requirements.md`,
    frozen_at: now,
  };
  const intake: IterationIntakeSnapshot = {
    ...withoutHash,
    content_sha256: sha256(withoutHash),
  };
  const bootstrap = { ...DEFAULT_STATE, iteration_id: iterationId };
  ensureProjectDirs(cwd, iterationRoot(cwd, bootstrap));
  writeImmutable(join(cwd, candidateSnapshotPath), candidate);
  revisions.forEach((revision, index) =>
    writeImmutable(join(cwd, sourceSnapshots[index].snapshot_path), revision),
  );
  writeImmutable(join(cwd, intake.manifest_path), intake);
  writeImmutable(
    join(cwd, intake.projection_path),
    requirementsProjection(candidate, revisions, intake),
  );
  const kickoffPath = `${relativeRoot}/01-requirements/kickoff-candidates/CAND-001.json`;
  const kickoff = kickoffCandidate(candidate, kickoffPath);
  writeImmutable(join(cwd, kickoffPath), kickoff);
  return writeState(cwd, {
    ...bootstrap,
    loop: 'kickoff',
    intake_snapshot: intake,
    kickoff_candidate: kickoff,
  });
}

/** Validate a frozen Intake without consulting the mutable Inbox or live provider. */
export function validateIterationIntakeSnapshot(
  cwd: string,
  state: WorkflowState = readState(cwd),
): void {
  const intake = state.intake_snapshot;
  if (!intake)
    throw new Error('The active iteration has no frozen Inbox Intake.');
  const expectedRoot = `${iterationRootRelative(state.iteration_id)}/00-user-input`;
  if (
    intake.manifest_path !== `${expectedRoot}/intake.json` ||
    intake.candidate_snapshot_path !== `${expectedRoot}/story-candidate.json` ||
    intake.projection_path !== `${expectedRoot}/requirements.md` ||
    intake.source_revisions.some(
      ({ snapshot_path }) =>
        !snapshot_path.startsWith(`${expectedRoot}/sources/`),
    )
  ) {
    throw new Error(
      'Iteration Intake paths are outside the frozen input root.',
    );
  }
  const persistedIntake = parseJson<IterationIntakeSnapshot>(
    join(cwd, intake.manifest_path),
    'Iteration Intake manifest',
  );
  if (canonicalJson(persistedIntake) !== canonicalJson(intake)) {
    throw new Error('Iteration Intake manifest and state are inconsistent.');
  }
  const { content_sha256: persistedHash, ...withoutHash } = persistedIntake;
  if (sha256(withoutHash) !== persistedHash) {
    throw new Error('Iteration Intake manifest hash is inconsistent.');
  }
  const candidate = parseJson<InboxStoryCandidate>(
    join(cwd, intake.candidate_snapshot_path),
    'Frozen Inbox Story candidate',
  );
  if (
    candidate.candidate_id !== intake.candidate_id ||
    sha256(candidate) !== intake.candidate_snapshot_sha256
  ) {
    throw new Error('Frozen Inbox Story candidate is inconsistent.');
  }
  const revisions = intake.source_revisions.map((source) => {
    const revision = parseJson<InboxSourceRevision>(
      join(cwd, source.snapshot_path),
      'Frozen Inbox source revision',
    );
    if (
      revision.inbox_id !== source.inbox_id ||
      revision.content_sha256 !== source.revision_sha256 ||
      sha256(revision) !== source.snapshot_sha256
    ) {
      throw new Error(
        `Frozen Inbox source revision is inconsistent: ${source.snapshot_path}.`,
      );
    }
    return revision;
  });
  for (const { inbox_id, revision_sha256 } of candidate.citations) {
    if (
      !intake.source_revisions.some(
        (source) =>
          source.inbox_id === inbox_id &&
          source.revision_sha256 === revision_sha256,
      )
    ) {
      throw new Error('Frozen candidate cites a source outside the Intake.');
    }
  }
  const projection = readFileSync(join(cwd, intake.projection_path), 'utf8');
  if (projection !== requirementsProjection(candidate, revisions, intake)) {
    throw new Error('Iteration Intake requirement projection is stale.');
  }
  const kickoff = state.kickoff_candidate;
  if (kickoff) {
    const persistedKickoff = parseJson<KickoffCandidate>(
      join(cwd, kickoff.artifact_path),
      'Frozen Kickoff candidate',
    );
    const initialKickoffPath = `${iterationRootRelative(
      state.iteration_id,
    )}/01-requirements/kickoff-candidates/CAND-001.json`;
    if (canonicalJson(persistedKickoff) !== canonicalJson(kickoff)) {
      throw new Error('Kickoff candidate state and artifact disagree.');
    }
    if (
      kickoff.artifact_path === initialKickoffPath &&
      (kickoff.title !== candidate.title ||
        kickoff.problem !== candidate.problem ||
        kickoff.role !== candidate.role ||
        kickoff.goal !== candidate.goal ||
        kickoff.value !== candidate.value)
    ) {
      throw new Error('Kickoff candidate and frozen Inbox candidate disagree.');
    }
  }
}
