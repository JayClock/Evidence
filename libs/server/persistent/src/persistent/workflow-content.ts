import { createHash } from 'node:crypto';
import {
  normalizeInboxCandidateDecisionReason,
  normalizeInboxStoryCandidateInput,
  normalizeKickoffDecisionInput,
  type InboxCandidateDecisionAction,
  type InboxStoryCandidateInput,
  type JsonValue,
  type KickoffDecisionInput,
} from '@evidence/server-domain';

export interface HashedInboxCandidateInput {
  candidate: InboxStoryCandidateInput;
  contentSha256: string;
}

export function hashInboxCandidateInput(
  input: InboxStoryCandidateInput,
): HashedInboxCandidateInput {
  const candidate = normalizeInboxStoryCandidateInput(input);
  return {
    candidate,
    contentSha256: hashCanonicalJson(candidate as unknown as JsonValue),
  };
}

export function hashInboxCandidateDecision(input: {
  candidateId: string;
  candidateSha256: string;
  action: InboxCandidateDecisionAction;
  reason: string;
  decidedByUserId: string;
  decidedAt: string;
}): { reason: string; contentSha256: string } {
  const reason = normalizeInboxCandidateDecisionReason(input.reason);
  return {
    reason,
    contentSha256: hashCanonicalJson({
      ...input,
      reason,
    }),
  };
}

export function hashIterationIntake(input: {
  candidateSnapshot: JsonValue;
  sourceSnapshots: JsonValue[];
  requirementsProjection: string;
  frozenAt: string;
}): string {
  return hashCanonicalJson(input);
}

export function hashKickoffProposal(input: {
  proposal: InboxStoryCandidateInput;
  origin: 'inbox_candidate' | 'requirements_analyst';
  sequence: number;
}): HashedInboxCandidateInput {
  const proposal = normalizeInboxStoryCandidateInput(input.proposal);
  return {
    candidate: proposal,
    contentSha256: hashCanonicalJson({
      ...proposal,
      origin: input.origin,
      sequence: input.sequence,
    } as unknown as JsonValue),
  };
}

export function hashKickoffDecision(
  input: KickoffDecisionInput & {
    iterationId: string;
    decidedByUserId: string;
    decidedAt: string;
  },
): {
  decision: ReturnType<typeof normalizeKickoffDecisionInput>;
  contentSha256: string;
} {
  const decision = normalizeKickoffDecisionInput(input);
  return {
    decision,
    contentSha256: hashCanonicalJson({
      iterationId: input.iterationId,
      proposalId: decision.proposalId,
      proposalSha256: decision.proposalSha256,
      action: decision.action,
      reason: decision.reason,
      decidedByUserId: input.decidedByUserId,
      decidedAt: input.decidedAt,
    }),
  };
}

export function hashCanonicalJson(value: JsonValue): string {
  return `sha256:${createHash('sha256')
    .update(JSON.stringify(canonicalize(value)))
    .digest('hex')}`;
}

function canonicalize(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}
