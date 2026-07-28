import {
  DomainError,
  Ref,
  RespondCandidate,
  RespondDecision,
  type RespondAuthority,
  type RespondCandidateDescription,
  type RespondDecisionDescription,
  type RespondNextProbe,
  type RespondPromotion,
} from '@evidence/server-domain';
import { Prisma } from '@prisma/client';

export type RespondCandidateRow = Prisma.RespondCandidateGetPayload<
  Record<string, never>
>;
export type RespondDecisionRow = Prisma.RespondDecisionGetPayload<
  Record<string, never>
>;

export function assembleRespondCandidate(
  row: RespondCandidateRow,
): RespondCandidate {
  return new RespondCandidate(row.id, {
    reference: row.reference,
    sequence: row.sequence,
    workspace: new Ref(row.workspaceId),
    iteration: new Ref(row.iterationId),
    story: new Ref(row.storyId),
    storyRevision: new Ref(row.storyRevisionId),
    showcaseRun: new Ref(row.showcaseRunId),
    showcaseDecision: new Ref(row.showcaseDecisionId),
    authority: jsonObject<RespondAuthority>(row.authority, row.id, 'authority'),
    promotions: jsonArray<RespondPromotion>(
      row.promotions,
      row.id,
      'promotions',
    ),
    noPromotionReason: row.noPromotionReason,
    observedOutcomes: jsonStrings(
      row.observedOutcomes,
      row.id,
      'observed outcomes',
    ),
    residualRisks: jsonStrings(row.residualRisks, row.id, 'residual risks'),
    nextProbe: jsonObject<RespondNextProbe>(
      row.nextProbe,
      row.id,
      'next Probe',
    ),
    proposedAt: row.proposedAt.toISOString(),
    contentSha256: row.contentSha256,
  } satisfies RespondCandidateDescription);
}

export function assembleRespondDecision(
  row: RespondDecisionRow,
): RespondDecision {
  return new RespondDecision(row.id, {
    candidate: new Ref(row.candidateId),
    action: row.action as RespondDecisionDescription['action'],
    reason: row.reason,
    candidateSha256: row.candidateSha256,
    authoritySha256: row.authoritySha256,
    decidedBy: new Ref(row.decidedByUserId),
    decidedAt: row.decidedAt.toISOString(),
    contentSha256: row.contentSha256,
  } satisfies RespondDecisionDescription);
}

function jsonStrings(
  value: Prisma.JsonValue,
  id: string,
  label: string,
): string[] {
  const values = jsonArray<unknown>(value, id, label);
  if (!values.every((entry) => typeof entry === 'string')) {
    throw DomainError.internal(`Respond ${label} is invalid for ${id}`);
  }
  return values as string[];
}

function jsonArray<T>(value: Prisma.JsonValue, id: string, label: string): T[] {
  if (!Array.isArray(value)) {
    throw DomainError.internal(`Respond ${label} is invalid for ${id}`);
  }
  return value as T[];
}

function jsonObject<T>(value: Prisma.JsonValue, id: string, label: string): T {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw DomainError.internal(`Respond ${label} is invalid for ${id}`);
  }
  return value as T;
}
