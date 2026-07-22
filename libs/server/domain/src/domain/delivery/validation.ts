import { DomainError } from '../error';
import type {
  StoryCandidateInput,
  StoryCandidateStatus,
  StoryCitationInput,
  StoryCognitiveMode,
} from './delivery';

const MAX_TITLE_LENGTH = 200;
const MAX_ROLE_LENGTH = 200;
const MAX_STATEMENT_LENGTH = 2_000;
const MAX_LOCATOR_LENGTH = 500;
const MAX_CITATIONS = 20;
const CONTENT_SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;

export function normalizeStoryCandidateInput(
  input: StoryCandidateInput,
): StoryCandidateInput {
  const citations = normalizeCitations(input.citations);
  return {
    title: limitedSingleLine(input.title, MAX_TITLE_LENGTH, 'title'),
    problem: limitedText(input.problem, MAX_STATEMENT_LENGTH, 'problem'),
    role: limitedSingleLine(input.role, MAX_ROLE_LENGTH, 'role'),
    goal: limitedText(input.goal, MAX_STATEMENT_LENGTH, 'goal'),
    value: limitedText(input.value, MAX_STATEMENT_LENGTH, 'value'),
    cognitiveMode: parseStoryCognitiveMode(input.cognitiveMode),
    citations,
  };
}

export function parseStoryCognitiveMode(value: string): StoryCognitiveMode {
  if (value === 'clear' || value === 'complicated' || value === 'complex') {
    return value;
  }
  throw DomainError.validation(`unsupported Story cognitive mode: ${value}`);
}

export function parseStoryCandidateStatus(value: string): StoryCandidateStatus {
  if (value === 'pending' || value === 'confirmed' || value === 'rejected') {
    return value;
  }
  throw DomainError.validation(`unsupported Story Candidate status: ${value}`);
}

export function assertStoryCandidateVersion(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw DomainError.validation(
      'Story Candidate expected version must be positive',
    );
  }
  return value;
}

function normalizeCitations(
  citations: StoryCitationInput[],
): StoryCitationInput[] {
  if (!Array.isArray(citations) || citations.length === 0) {
    throw DomainError.validation(
      'Story Candidate must cite at least one Inbox Revision',
    );
  }
  if (citations.length > MAX_CITATIONS) {
    throw DomainError.validation(
      `Story Candidate must not cite more than ${String(MAX_CITATIONS)} Inbox Revisions`,
    );
  }

  const seen = new Set<string>();
  return citations.map((citation, index) => {
    if (!citation || typeof citation !== 'object') {
      throw DomainError.validation(
        `Story Candidate citation ${String(index + 1)} is required`,
      );
    }
    const normalized = {
      inboxItemId: singleLine(citation.inboxItemId, 'Inbox Item id'),
      inboxRevisionId: singleLine(
        citation.inboxRevisionId,
        'Inbox Revision id',
      ),
      contentSha256: normalizeContentSha256(citation.contentSha256),
      locator: limitedSingleLine(
        citation.locator,
        MAX_LOCATOR_LENGTH,
        'citation locator',
      ),
    };
    const key = [
      normalized.inboxItemId,
      normalized.inboxRevisionId,
      normalized.locator,
    ].join('\u0000');
    if (seen.has(key)) {
      throw DomainError.validation(
        'Story Candidate must not contain duplicate citations',
      );
    }
    seen.add(key);
    return normalized;
  });
}

function normalizeContentSha256(value: string): string {
  const normalized = singleLine(
    value,
    'citation content SHA-256',
  ).toLowerCase();
  if (!CONTENT_SHA256_PATTERN.test(normalized)) {
    throw DomainError.validation(
      'Story Candidate citation content SHA-256 is invalid',
    );
  }
  return normalized;
}

function limitedText(value: string, maximum: number, label: string): string {
  if (typeof value !== 'string') {
    throw DomainError.validation(`Story Candidate ${label} must not be empty`);
  }
  const normalized = value.replace(/\r\n?/g, '\n').trim();
  if (normalized.length === 0) {
    throw DomainError.validation(`Story Candidate ${label} must not be empty`);
  }
  return limited(normalized, maximum, label);
}

function limitedSingleLine(
  value: string,
  maximum: number,
  label: string,
): string {
  return limited(singleLine(value, label), maximum, label);
}

function singleLine(value: string, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw DomainError.validation(`Story Candidate ${label} must not be empty`);
  }
  const normalized = value.trim();
  if (/[\r\n]/.test(normalized)) {
    throw DomainError.validation(
      `Story Candidate ${label} must be a single line`,
    );
  }
  return normalized;
}

function limited(value: string, maximum: number, label: string): string {
  if (value.length > maximum) {
    throw DomainError.validation(
      `Story Candidate ${label} must not exceed ${String(maximum)} characters`,
    );
  }
  return value;
}
