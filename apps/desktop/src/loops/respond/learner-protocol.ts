import type { RespondNextProbe, RespondPromotion } from '@evidence/api-client';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/;
const MAX_ITEMS = 50;

export interface RespondLearnerRuntimeRequest {
  id: string;
  timeoutMs: number;
  worktreeRoot: string;
  authoritySha256: string;
  approvedCommitSha: string;
  changedPaths: string[];
  evidence: Record<string, unknown>;
}

export interface RespondLearnerDetails {
  promotions: RespondPromotion[];
  noPromotionReason: string | null;
  observedOutcomes: string[];
  residualRisks: string[];
  nextProbe: RespondNextProbe;
  agentCallCount: 1;
}

export type RespondLearnerEvent =
  | {
      id: string;
      event: 'progress' | 'tool-start' | 'tool-end' | 'error';
      data: string;
    }
  | {
      id: string;
      event: 'complete';
      data: string;
      details: RespondLearnerDetails;
    };

export function parseRespondLearnerRuntimeRequest(
  value: unknown,
): RespondLearnerRuntimeRequest {
  const input = object(value, 'Respond Learner request');
  return {
    id: identifier(input.id, 'request id'),
    timeoutMs: boundedInteger(input.timeoutMs, 'Learner timeout', 1, 600_000),
    worktreeRoot: text(input.worktreeRoot, 'worktree root', 4_096),
    authoritySha256: sha256(input.authoritySha256, 'Respond authority SHA-256'),
    approvedCommitSha: commit(input.approvedCommitSha),
    changedPaths: strings(input.changedPaths, 'changed paths'),
    evidence: object(input.evidence, 'Respond evidence'),
  };
}

export function parseRespondLearnerEvent(
  value: unknown,
): RespondLearnerEvent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (
    typeof input.id !== 'string' ||
    !ID.test(input.id) ||
    typeof input.event !== 'string' ||
    typeof input.data !== 'string'
  ) {
    return null;
  }
  if (
    input.event === 'progress' ||
    input.event === 'tool-start' ||
    input.event === 'tool-end' ||
    input.event === 'error'
  ) {
    return { id: input.id, event: input.event, data: input.data };
  }
  if (input.event !== 'complete') return null;
  const details = nullableObject(input.details);
  if (!details || details.agentCallCount !== 1) return null;
  const promotions = promotionArray(details.promotions);
  const noPromotionReason = nullableText(details.noPromotionReason, 4_000);
  const observedOutcomes = stringsOrNull(details.observedOutcomes);
  const residualRisks = stringsOrNull(details.residualRisks);
  const nextProbe = probe(details.nextProbe);
  if (
    !promotions ||
    !observedOutcomes?.length ||
    !residualRisks ||
    !nextProbe ||
    (promotions.length === 0 ? !noPromotionReason : Boolean(noPromotionReason))
  ) {
    return null;
  }
  return {
    id: input.id,
    event: 'complete',
    data: input.data,
    details: {
      promotions,
      noPromotionReason,
      observedOutcomes,
      residualRisks,
      nextProbe,
      agentCallCount: 1,
    },
  };
}

function promotionArray(value: unknown): RespondPromotion[] | null {
  if (!Array.isArray(value) || value.length > MAX_ITEMS) return null;
  const result: RespondPromotion[] = [];
  for (const candidate of value) {
    const item = nullableObject(candidate);
    if (!item) return null;
    const sourceRef = nullableText(item.sourceRef, 500);
    const reason = nullableText(item.reason, 4_000);
    const validationEvidenceRefs = stringsOrNull(item.validationEvidenceRefs);
    const canonicalTarget = nullableText(item.canonicalTarget, 500);
    if (
      !sourceRef ||
      !reason ||
      !validationEvidenceRefs?.length ||
      !knowledgeKind(item.kind) ||
      !promotionDecision(item.decision) ||
      (item.decision === 'promoted' && !canonicalTarget)
    ) {
      return null;
    }
    result.push({
      sourceRef,
      kind: item.kind,
      decision: item.decision,
      reason,
      validationEvidenceRefs,
      canonicalTarget,
    });
  }
  return result;
}

function probe(value: unknown): RespondNextProbe | null {
  const item = nullableObject(value);
  if (!item) return null;
  const question = nullableText(item.question, 4_000);
  const whyNow = nullableText(item.whyNow, 4_000);
  const evidenceRefs = stringsOrNull(item.evidenceRefs);
  const firstAction = nullableText(item.firstAction, 4_000);
  return question && whyNow && evidenceRefs?.length && firstAction
    ? { question, whyNow, evidenceRefs, firstAction }
    : null;
}

function knowledgeKind(value: unknown): value is RespondPromotion['kind'] {
  return [
    'product',
    'model',
    'architecture',
    'contract',
    'test_process',
    'skill',
    'prompt',
    'other',
  ].includes(String(value));
}

function promotionDecision(
  value: unknown,
): value is RespondPromotion['decision'] {
  return ['promoted', 'deferred', 'rejected'].includes(String(value));
}

function object(value: unknown, label: string): Record<string, unknown> {
  const result = nullableObject(value);
  if (!result) throw new Error(`${label} must be an object.`);
  return result;
}

function nullableObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function strings(value: unknown, label: string): string[] {
  const result = stringsOrNull(value);
  if (!result) throw new Error(`${label} is invalid.`);
  return result;
}

function stringsOrNull(value: unknown): string[] | null {
  if (
    !Array.isArray(value) ||
    value.length > MAX_ITEMS ||
    value.some(
      (entry) =>
        typeof entry !== 'string' || !entry.trim() || entry.length > 4_000,
    )
  ) {
    return null;
  }
  return value.map((entry) => entry.trim());
}

function identifier(value: unknown, label: string): string {
  const normalized = text(value, label, 256);
  if (!ID.test(normalized)) throw new Error(`${label} is invalid.`);
  return normalized;
}

function text(value: unknown, label: string, maximum: number): string {
  const normalized = nullableText(value, maximum);
  if (!normalized) throw new Error(`${label} is invalid.`);
  return normalized;
}

function nullableText(value: unknown, maximum: number): string | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maximum ? normalized : null;
}

function sha256(value: unknown, label: string): string {
  const normalized =
    typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!SHA256.test(normalized)) throw new Error(`${label} is invalid.`);
  return normalized;
}

function commit(value: unknown): string {
  const normalized =
    typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!COMMIT.test(normalized))
    throw new Error('approved commit SHA is invalid.');
  return normalized;
}

function boundedInteger(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): number {
  if (
    !Number.isSafeInteger(value) ||
    Number(value) < minimum ||
    Number(value) > maximum
  ) {
    throw new Error(`${label} is invalid.`);
  }
  return Number(value);
}
