import { DomainError } from '../error';
import type {
  CodingRunAcceptanceInput,
  CodingRunFailureInput,
  CodingRunQualityCheck,
  CodingRunQualityStatus,
  CodingRunReviewInput,
  CodingRunStatus,
  StartCodingRunInput,
} from './coding-run';

const GIT_COMMIT_PATTERN = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/;
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;
const FAILURE_CODE_PATTERN = /^[a-z0-9][a-z0-9._-]{0,99}$/;
const MAX_QUALITY_CHECKS = 100;
const MAX_CHANGED_FILES = 10_000;
const MAX_DURATION_MS = 86_400_000;
const MAX_NAME_LENGTH = 200;
const MAX_SUMMARY_LENGTH = 4_000;
const MAX_REJECTION_LENGTH = 2_000;

export function normalizeStartCodingRunInput(
  input: StartCodingRunInput,
): StartCodingRunInput {
  return {
    storyRevisionId: requiredSingleLine(
      input.storyRevisionId,
      'Story Revision id',
      200,
    ),
    baseCommitSha: gitCommit(input.baseCommitSha, 'base commit SHA'),
  };
}

export function normalizeCodingRunReviewInput(
  input: CodingRunReviewInput,
): CodingRunReviewInput {
  if (
    !Number.isSafeInteger(input.changedFileCount) ||
    input.changedFileCount < 1 ||
    input.changedFileCount > MAX_CHANGED_FILES
  ) {
    throw DomainError.validation(
      `Coding Run changed file count must be between 1 and ${String(MAX_CHANGED_FILES)}`,
    );
  }
  const qualityChecks = normalizeCodingRunQualityChecks(input.qualityChecks);
  if (qualityChecks.some((check) => check.status === 'failed')) {
    throw DomainError.validation(
      'Coding Run cannot enter review with a failed quality check',
    );
  }
  if (!qualityChecks.some((check) => check.status === 'passed')) {
    throw DomainError.validation(
      'Coding Run must contain at least one passed quality check',
    );
  }
  return {
    diffSha256: sha256(input.diffSha256, 'diff SHA-256'),
    changedFileCount: input.changedFileCount,
    qualityChecks,
  };
}

export function normalizeCodingRunQualityChecks(
  input: CodingRunQualityCheck[],
): CodingRunQualityCheck[] {
  if (!Array.isArray(input) || input.length > MAX_QUALITY_CHECKS) {
    throw DomainError.validation(
      `Coding Run must not contain more than ${String(MAX_QUALITY_CHECKS)} quality checks`,
    );
  }
  return input.map(normalizeQualityCheck);
}

export function normalizeCodingRunFailureInput(
  input: CodingRunFailureInput,
): CodingRunFailureInput {
  const code = requiredSingleLine(
    input.code,
    'failure code',
    100,
  ).toLowerCase();
  if (!FAILURE_CODE_PATTERN.test(code)) {
    throw DomainError.validation('Coding Run failure code is invalid');
  }
  return {
    code,
    summary: requiredText(input.summary, 'failure summary', MAX_SUMMARY_LENGTH),
  };
}

export function normalizeCodingRunAcceptanceInput(
  input: CodingRunAcceptanceInput,
): CodingRunAcceptanceInput {
  return {
    diffSha256: sha256(input.diffSha256, 'accepted diff SHA-256'),
    commitSha: gitCommit(input.commitSha, 'accepted commit SHA'),
  };
}

export function normalizeCodingRunRejectionReason(value: string): string {
  return requiredText(value, 'rejection reason', MAX_REJECTION_LENGTH);
}

export function parseCodingRunStatus(value: string): CodingRunStatus {
  if (
    value === 'running' ||
    value === 'review_required' ||
    value === 'failed' ||
    value === 'cancelled' ||
    value === 'accepted' ||
    value === 'rejected'
  ) {
    return value;
  }
  throw DomainError.validation(`unsupported Coding Run status: ${value}`);
}

export function assertCodingRunVersion(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw DomainError.validation(
      'Coding Run expected version must be a positive integer',
    );
  }
  return value;
}

function normalizeQualityCheck(
  input: CodingRunQualityCheck,
  index: number,
): CodingRunQualityCheck {
  if (!input || typeof input !== 'object') {
    throw DomainError.validation(
      `Coding Run quality check ${String(index + 1)} is required`,
    );
  }
  const durationMs = input.durationMs;
  if (
    durationMs !== null &&
    (!Number.isSafeInteger(durationMs) ||
      durationMs < 0 ||
      durationMs > MAX_DURATION_MS)
  ) {
    throw DomainError.validation(
      `Coding Run quality check ${String(index + 1)} duration is invalid`,
    );
  }
  return {
    name: requiredSingleLine(
      input.name,
      `quality check ${String(index + 1)} name`,
      MAX_NAME_LENGTH,
    ),
    status: parseQualityStatus(input.status),
    durationMs,
    summary:
      input.summary === null
        ? null
        : requiredText(
            input.summary,
            `quality check ${String(index + 1)} summary`,
            MAX_SUMMARY_LENGTH,
          ),
  };
}

function parseQualityStatus(value: string): CodingRunQualityStatus {
  if (value === 'passed' || value === 'failed' || value === 'skipped') {
    return value;
  }
  throw DomainError.validation(
    `unsupported Coding Run quality status: ${value}`,
  );
}

function gitCommit(value: string, label: string): string {
  const normalized = requiredSingleLine(value, label, 64).toLowerCase();
  if (!GIT_COMMIT_PATTERN.test(normalized)) {
    throw DomainError.validation(`Coding Run ${label} is invalid`);
  }
  return normalized;
}

function sha256(value: string, label: string): string {
  const normalized = requiredSingleLine(value, label, 71).toLowerCase();
  if (!SHA256_PATTERN.test(normalized)) {
    throw DomainError.validation(`Coding Run ${label} is invalid`);
  }
  return normalized;
}

function requiredSingleLine(
  value: string,
  label: string,
  maximum: number,
): string {
  const normalized = requiredText(value, label, maximum);
  if (/[\r\n]/.test(normalized)) {
    throw DomainError.validation(`Coding Run ${label} must be a single line`);
  }
  return normalized;
}

function requiredText(value: string, label: string, maximum: number): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw DomainError.validation(`Coding Run ${label} is required`);
  }
  const normalized = value.replace(/\r\n?/g, '\n').trim();
  if (normalized.length > maximum) {
    throw DomainError.validation(
      `Coding Run ${label} must not exceed ${String(maximum)} characters`,
    );
  }
  return normalized;
}
