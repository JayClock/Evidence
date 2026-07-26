import { DomainError } from '../error';
import {
  normalizeContentSha256,
  normalizeInboxStoryCandidateInput,
} from '../inbox';
import type {
  CompleteIterationProvisioningInput,
  FailIterationProvisioningInput,
  IterationLifecycle,
  IterationLoop,
  IterationStage,
  KickoffDecisionAction,
  KickoffDecisionInput,
  SelectInboxCandidateInput,
} from './iteration';

const GIT_COMMIT_SHA_PATTERN = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/;
const ITERATION_BRANCH_PATTERN = /^evidence\/iter-[a-z0-9][a-z0-9-]*$/;
const MAX_REASON_LENGTH = 2_000;

export function normalizeSelectInboxCandidateInput(
  input: SelectInboxCandidateInput,
): SelectInboxCandidateInput {
  if (!input || typeof input !== 'object') {
    throw DomainError.validation('Candidate selection input is required');
  }
  return {
    candidateId: singleLine(input.candidateId, 'Candidate id'),
    candidateSha256: normalizeContentSha256(input.candidateSha256),
    baseCommitSha: normalizeGitCommitSha(input.baseCommitSha),
  };
}

export function normalizeCompleteIterationProvisioningInput(
  input: CompleteIterationProvisioningInput,
): CompleteIterationProvisioningInput {
  if (!input || typeof input !== 'object') {
    throw DomainError.validation('Iteration provisioning input is required');
  }
  const branchName = singleLine(input.branchName, 'Iteration branch name');
  if (!ITERATION_BRANCH_PATTERN.test(branchName)) {
    throw DomainError.validation(
      'Iteration branch name must use evidence/iter-<reference>',
    );
  }
  return {
    expectedVersion: assertIterationVersion(input.expectedVersion),
    baseCommitSha: normalizeGitCommitSha(input.baseCommitSha),
    branchName,
  };
}

export function normalizeFailIterationProvisioningInput(
  input: FailIterationProvisioningInput,
): FailIterationProvisioningInput {
  if (!input || typeof input !== 'object') {
    throw DomainError.validation('Iteration provisioning failure is required');
  }
  return {
    expectedVersion: assertIterationVersion(input.expectedVersion),
    reason: normalizeReason(input.reason, true) ?? '',
  };
}

export function normalizeKickoffDecisionInput(
  input: KickoffDecisionInput,
): Required<Omit<KickoffDecisionInput, 'reason'>> & {
  reason: string | null;
} {
  if (!input || typeof input !== 'object') {
    throw DomainError.validation('Kickoff Decision input is required');
  }
  const action = parseKickoffDecisionAction(input.action);
  return {
    proposalId: singleLine(input.proposalId, 'Kickoff Proposal id'),
    proposalSha256: normalizeContentSha256(input.proposalSha256),
    expectedIterationVersion: assertIterationVersion(
      input.expectedIterationVersion,
    ),
    action,
    reason: normalizeReason(input.reason, action !== 'confirm'),
  };
}

export function normalizeKickoffReplacementProposal(
  input: Parameters<typeof normalizeInboxStoryCandidateInput>[0],
) {
  return normalizeInboxStoryCandidateInput(input);
}

export function parseKickoffDecisionAction(
  value: string,
): KickoffDecisionAction {
  if (
    value === 'confirm' ||
    value === 'revise' ||
    value === 'split' ||
    value === 'defer' ||
    value === 'stop'
  ) {
    return value;
  }
  throw DomainError.validation(`unsupported Kickoff decision: ${value}`);
}

export function parseIterationLifecycle(value: string): IterationLifecycle {
  if (
    value === 'provisioning' ||
    value === 'active' ||
    value === 'provisioning_failed' ||
    value === 'halted'
  ) {
    return value;
  }
  throw DomainError.validation(`unsupported Iteration lifecycle: ${value}`);
}

export function parseIterationLoop(value: string): IterationLoop {
  if (value === 'kickoff' || value === 'understand') {
    return value;
  }
  throw DomainError.validation(`unsupported Iteration loop: ${value}`);
}

export function parseIterationStage(value: string): IterationStage {
  if (
    value === 'candidate_review' ||
    value === 'candidate_drafting' ||
    value === 'tqa'
  ) {
    return value;
  }
  throw DomainError.validation(`unsupported Iteration stage: ${value}`);
}

export function assertIterationVersion(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw DomainError.validation('Iteration expected version must be positive');
  }
  return value;
}

export function assertKickoffCanConfirm(activeStoryId: string | null): void {
  if (activeStoryId !== null) {
    throw DomainError.conflict(
      'An Iteration cannot create more than one Story during Kickoff',
    );
  }
}

export function normalizeGitCommitSha(value: string): string {
  const normalized = singleLine(value, 'base commit SHA').toLowerCase();
  if (!GIT_COMMIT_SHA_PATTERN.test(normalized)) {
    throw DomainError.validation('Iteration base commit SHA is invalid');
  }
  return normalized;
}

function normalizeReason(
  value: string | null | undefined,
  required: boolean,
): string | null {
  if (value === undefined || value === null || value.trim().length === 0) {
    if (required) {
      throw DomainError.validation('Kickoff decision reason is required');
    }
    return null;
  }
  const normalized = value.replace(/\r\n?/g, '\n').trim();
  if (normalized.length > MAX_REASON_LENGTH) {
    throw DomainError.validation(
      `Kickoff decision reason must not exceed ${String(MAX_REASON_LENGTH)} characters`,
    );
  }
  return normalized;
}

function singleLine(value: string, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw DomainError.validation(`${label} must not be empty`);
  }
  const normalized = value.trim();
  if (/[\r\n]/.test(normalized)) {
    throw DomainError.validation(`${label} must be a single line`);
  }
  return normalized;
}
