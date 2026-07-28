import { DomainError } from '../error';
import { normalizeContentSha256 } from '../inbox';
import type {
  DecideRespondInput,
  ProposeRespondCandidateInput,
  RespondDecisionAction,
  RespondKnowledgeKind,
  RespondNextProbe,
  RespondPromotion,
  RespondPromotionDecision,
} from './respond';

const MAX_TEXT = 4_000;
const MAX_REF = 500;
const MAX_LIST = 50;
const WINDOWS_ABSOLUTE_PATH = /^(?:[a-zA-Z]:[\\/]|\\\\)/;
const KNOWLEDGE_KINDS: readonly RespondKnowledgeKind[] = [
  'product',
  'model',
  'architecture',
  'contract',
  'test_process',
  'skill',
  'prompt',
  'other',
];
const PROMOTION_DECISIONS: readonly RespondPromotionDecision[] = [
  'promoted',
  'deferred',
  'rejected',
];

export function normalizeProposeRespondCandidateInput(
  input: ProposeRespondCandidateInput,
): Required<ProposeRespondCandidateInput> {
  requiredObject(input, 'Respond Candidate');
  if (!Array.isArray(input.promotions) || input.promotions.length > MAX_LIST) {
    throw DomainError.validation('Respond promotions must be a bounded array');
  }
  const promotions = input.promotions.map(normalizePromotion);
  const noPromotionReason = optionalText(
    input.noPromotionReason,
    'No-promotion reason',
  );
  if (promotions.length === 0 && !noPromotionReason) {
    throw DomainError.validation(
      'Respond without promotions requires a no-promotion reason',
    );
  }
  if (promotions.length > 0 && noPromotionReason) {
    throw DomainError.validation(
      'No-promotion reason is valid only when promotions are empty',
    );
  }
  return {
    actionId: singleLine(input.actionId, 'Respond action id'),
    expectedIterationVersion: positiveVersion(input.expectedIterationVersion),
    authoritySha256: normalizeContentSha256(input.authoritySha256),
    promotions,
    noPromotionReason,
    observedOutcomes: textList(
      input.observedOutcomes,
      'Observed outcomes',
      true,
    ),
    residualRisks: textList(input.residualRisks, 'Residual risks', false),
    nextProbe: normalizeProbe(input.nextProbe),
  };
}

export function normalizeDecideRespondInput(
  input: DecideRespondInput,
): DecideRespondInput {
  requiredObject(input, 'Respond decision');
  return {
    expectedIterationVersion: positiveVersion(input.expectedIterationVersion),
    candidateId: singleLine(input.candidateId, 'Respond Candidate id'),
    candidateSha256: normalizeContentSha256(input.candidateSha256),
    authoritySha256: normalizeContentSha256(input.authoritySha256),
    action: oneOf<RespondDecisionAction>(input.action, 'Respond decision', [
      'approve',
      'revise',
    ]),
    reason: text(input.reason, 'Respond decision reason', MAX_TEXT),
  };
}

function normalizePromotion(
  value: RespondPromotion,
  index: number,
): RespondPromotion {
  requiredObject(value, `Promotion ${String(index + 1)}`);
  const decision = oneOf<RespondPromotionDecision>(
    value.decision,
    'Promotion decision',
    PROMOTION_DECISIONS,
  );
  const canonicalTarget = optionalRef(
    value.canonicalTarget,
    'Promotion canonical target',
  );
  if (decision === 'promoted' && !canonicalTarget) {
    throw DomainError.validation(
      'Promoted knowledge requires a canonical target',
    );
  }
  return {
    sourceRef: safeRef(value.sourceRef, 'Promotion source'),
    kind: oneOf<RespondKnowledgeKind>(
      value.kind,
      'Knowledge kind',
      KNOWLEDGE_KINDS,
    ),
    decision,
    reason: text(value.reason, 'Promotion reason', MAX_TEXT),
    validationEvidenceRefs: refList(
      value.validationEvidenceRefs,
      'Promotion validation evidence',
      true,
    ),
    canonicalTarget,
  };
}

function normalizeProbe(value: RespondNextProbe): RespondNextProbe {
  requiredObject(value, 'Next Probe');
  const question = text(value.question, 'Next Probe question', MAX_TEXT);
  if (/^(todo|tbd|continue|follow up|待办|继续)$/iu.test(question)) {
    throw DomainError.validation(
      'Next Probe must contain a concrete learning question',
    );
  }
  return {
    question,
    whyNow: text(value.whyNow, 'Next Probe rationale', MAX_TEXT),
    evidenceRefs: refList(value.evidenceRefs, 'Next Probe evidence', true),
    firstAction: text(value.firstAction, 'Next Probe first action', MAX_TEXT),
  };
}

function refList(value: string[], label: string, required: boolean): string[] {
  if (!Array.isArray(value) || value.length > MAX_LIST) {
    throw DomainError.validation(`${label} must be a bounded array`);
  }
  const normalized = [...new Set(value.map((entry) => safeRef(entry, label)))];
  if (required && normalized.length === 0) {
    throw DomainError.validation(`${label} must not be empty`);
  }
  return normalized;
}

function textList(value: string[], label: string, required: boolean): string[] {
  if (!Array.isArray(value) || value.length > MAX_LIST) {
    throw DomainError.validation(`${label} must be a bounded array`);
  }
  const normalized = value.map((entry, index) =>
    text(entry, `${label}[${String(index)}]`, MAX_REF),
  );
  if (required && normalized.length === 0) {
    throw DomainError.validation(`${label} must not be empty`);
  }
  return normalized;
}

function safeRef(value: string, label: string): string {
  const normalized = singleLine(value, label);
  if (
    normalized.startsWith('/') ||
    WINDOWS_ABSOLUTE_PATH.test(normalized) ||
    normalized.toLowerCase().startsWith('file:')
  ) {
    throw DomainError.validation(
      `${label} cannot contain a local absolute path`,
    );
  }
  return normalized;
}

function optionalRef(
  value: string | null | undefined,
  label: string,
): string | null {
  return value == null || value.trim() === '' ? null : safeRef(value, label);
}

function optionalText(
  value: string | null | undefined,
  label: string,
): string | null {
  return value == null || value.trim() === ''
    ? null
    : text(value, label, MAX_TEXT);
}

function text(value: string, label: string, maximum: number): string {
  if (typeof value !== 'string')
    throw DomainError.validation(`${label} is required`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) {
    throw DomainError.validation(
      `${label} must be between 1 and ${String(maximum)} characters`,
    );
  }
  return normalized;
}

function singleLine(value: string, label: string): string {
  const normalized = text(value, label, MAX_REF);
  if (/\r|\n/u.test(normalized)) {
    throw DomainError.validation(`${label} must be one line`);
  }
  return normalized;
}

function positiveVersion(value: number): number {
  if (!Number.isInteger(value) || value < 1) {
    throw DomainError.validation('Expected version must be a positive integer');
  }
  return value;
}

function oneOf<T extends string>(
  value: T,
  label: string,
  allowed: readonly T[],
): T {
  if (!allowed.includes(value)) {
    throw DomainError.validation(`${label} is unsupported`);
  }
  return value;
}

function requiredObject(
  value: unknown,
  label: string,
): asserts value is object {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw DomainError.validation(`${label} is required`);
  }
}
