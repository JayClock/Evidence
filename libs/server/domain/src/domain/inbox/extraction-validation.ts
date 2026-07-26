import { DomainError } from '../error';
import type {
  CreateInboxExtractionInput,
  InboxCandidateCognitiveMode,
  InboxCandidateDecisionAction,
  InboxCandidateStatus,
  InboxStoryCandidateInput,
} from './extraction';

const MIN_EXTRACTION_SOURCES = 1;
const MAX_EXTRACTION_SOURCES = 5;
const MIN_CANDIDATES = 1;
const MAX_CANDIDATES = 5;
const MAX_TITLE_LENGTH = 200;
const MAX_ROLE_LENGTH = 200;
const MAX_STATEMENT_LENGTH = 2_000;
const MAX_LOCATOR_LENGTH = 500;
const MAX_CITATIONS = 20;
const MAX_DECISION_REASON_LENGTH = 2_000;
const CONTENT_SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;

export function normalizeCreateInboxExtractionInput(
  input: CreateInboxExtractionInput,
): CreateInboxExtractionInput {
  if (!input || !Array.isArray(input.inboxItemIds)) {
    throw DomainError.validation('Inbox Extraction sources are required');
  }
  if (
    input.inboxItemIds.length < MIN_EXTRACTION_SOURCES ||
    input.inboxItemIds.length > MAX_EXTRACTION_SOURCES
  ) {
    throw DomainError.validation('Inbox Extraction must select 1 to 5 sources');
  }
  const inboxItemIds = input.inboxItemIds.map((id) =>
    singleLine(id, 'Inbox Item id'),
  );
  if (new Set(inboxItemIds).size !== inboxItemIds.length) {
    throw DomainError.validation(
      'Inbox Extraction must not select duplicate sources',
    );
  }
  return { inboxItemIds };
}

export function normalizeInboxCandidateSet(
  candidates: InboxStoryCandidateInput[],
  selectedInboxItemIds: string[],
): InboxStoryCandidateInput[] {
  if (!Array.isArray(candidates)) {
    throw DomainError.validation('Inbox Candidate set is required');
  }
  if (
    candidates.length < MIN_CANDIDATES ||
    candidates.length > MAX_CANDIDATES
  ) {
    throw DomainError.validation(
      'Inbox Analyst must propose 1 to 5 Candidates',
    );
  }

  const normalized = candidates.map(normalizeInboxStoryCandidateInput);
  const selected = new Set(selectedInboxItemIds);
  const covered = new Set(
    normalized.flatMap((candidate) =>
      candidate.citations.map((citation) => citation.inboxItemId),
    ),
  );
  for (const inboxItemId of covered) {
    if (!selected.has(inboxItemId)) {
      throw DomainError.validation(
        `Inbox Candidate citation references unselected source ${inboxItemId}`,
      );
    }
  }
  for (const inboxItemId of selected) {
    if (!covered.has(inboxItemId)) {
      throw DomainError.validation(
        `Inbox Candidate set must cite selected source ${inboxItemId}`,
      );
    }
  }
  return normalized;
}

export function normalizeInboxStoryCandidateInput(
  input: InboxStoryCandidateInput,
): InboxStoryCandidateInput {
  if (!input || typeof input !== 'object') {
    throw DomainError.validation('Inbox Story Candidate is required');
  }
  if (!Array.isArray(input.citations) || input.citations.length === 0) {
    throw DomainError.validation(
      'Inbox Story Candidate must cite at least one selected Revision',
    );
  }
  if (input.citations.length > MAX_CITATIONS) {
    throw DomainError.validation(
      `Inbox Story Candidate must not cite more than ${String(MAX_CITATIONS)} Revisions`,
    );
  }

  const seen = new Set<string>();
  const citations = input.citations.map((citation, index) => {
    if (!citation || typeof citation !== 'object') {
      throw DomainError.validation(
        `Inbox Story Candidate citation ${String(index + 1)} is required`,
      );
    }
    const normalized = {
      inboxItemId: singleLine(citation.inboxItemId, 'Inbox Item id'),
      revisionSha256: normalizeContentSha256(citation.revisionSha256),
      locator: limitedSingleLine(
        citation.locator,
        MAX_LOCATOR_LENGTH,
        'citation locator',
      ),
    };
    const key = [
      normalized.inboxItemId,
      normalized.revisionSha256,
      normalized.locator,
    ].join('\u0000');
    if (seen.has(key)) {
      throw DomainError.validation(
        'Inbox Story Candidate must not contain duplicate citations',
      );
    }
    seen.add(key);
    return normalized;
  });

  return {
    title: limitedSingleLine(input.title, MAX_TITLE_LENGTH, 'title'),
    problem: limitedText(input.problem, MAX_STATEMENT_LENGTH, 'problem'),
    role: limitedSingleLine(input.role, MAX_ROLE_LENGTH, 'role'),
    goal: limitedText(input.goal, MAX_STATEMENT_LENGTH, 'goal'),
    value: limitedText(input.value, MAX_STATEMENT_LENGTH, 'value'),
    cognitiveMode: parseInboxCandidateCognitiveMode(input.cognitiveMode),
    citations,
  };
}

export function parseInboxCandidateCognitiveMode(
  value: string,
): InboxCandidateCognitiveMode {
  if (value === 'clear' || value === 'complicated' || value === 'complex') {
    return value;
  }
  throw DomainError.validation(
    `unsupported Inbox Candidate cognitive mode: ${value}`,
  );
}

export function parseInboxCandidateStatus(value: string): InboxCandidateStatus {
  if (
    value === 'ready' ||
    value === 'stale' ||
    value === 'selected' ||
    value === 'deferred' ||
    value === 'rejected'
  ) {
    return value;
  }
  throw DomainError.validation(`unsupported Inbox Candidate status: ${value}`);
}

export function parseInboxCandidateDecisionAction(
  value: string,
): InboxCandidateDecisionAction {
  if (value === 'defer' || value === 'reject') {
    return value;
  }
  throw DomainError.validation(
    `unsupported Inbox Candidate decision: ${value}`,
  );
}

export function normalizeInboxCandidateDecisionReason(value: string): string {
  return limitedText(value, MAX_DECISION_REASON_LENGTH, 'decision reason');
}

export function assertInboxExtractionVersion(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw DomainError.validation(
      'Inbox Extraction expected version must be positive',
    );
  }
  return value;
}

export function normalizeContentSha256(value: string): string {
  const normalized = singleLine(value, 'content SHA-256').toLowerCase();
  if (!CONTENT_SHA256_PATTERN.test(normalized)) {
    throw DomainError.validation('Inbox content SHA-256 is invalid');
  }
  return normalized;
}

function limitedText(value: string, maximum: number, label: string): string {
  if (typeof value !== 'string') {
    throw DomainError.validation(`Inbox Candidate ${label} must not be empty`);
  }
  const normalized = value.replace(/\r\n?/g, '\n').trim();
  if (normalized.length === 0) {
    throw DomainError.validation(`Inbox Candidate ${label} must not be empty`);
  }
  if (normalized.length > maximum) {
    throw DomainError.validation(
      `Inbox Candidate ${label} must not exceed ${String(maximum)} characters`,
    );
  }
  return normalized;
}

function limitedSingleLine(
  value: string,
  maximum: number,
  label: string,
): string {
  const normalized = singleLine(value, label);
  if (normalized.length > maximum) {
    throw DomainError.validation(
      `Inbox Candidate ${label} must not exceed ${String(maximum)} characters`,
    );
  }
  return normalized;
}

function singleLine(value: string, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw DomainError.validation(`Inbox Candidate ${label} must not be empty`);
  }
  const normalized = value.trim();
  if (/[\r\n]/.test(normalized)) {
    throw DomainError.validation(
      `Inbox Candidate ${label} must be a single line`,
    );
  }
  return normalized;
}
