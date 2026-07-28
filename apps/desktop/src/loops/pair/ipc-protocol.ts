import type {
  ApprovePairRequest,
  DecidePairRequest,
  PairControllerEvent,
  ReviewPairRequest,
  RunPairRequest,
} from './controller';

export const START_PAIR_CHANNEL = 'evidence:start-pair';
export const RESUME_PAIR_CHANNEL = 'evidence:resume-pair';
export const REVIEW_PAIR_CHANNEL = 'evidence:review-pair';
export const DECIDE_PAIR_CHANNEL = 'evidence:decide-pair';
export const APPROVE_PAIR_CHANNEL = 'evidence:approve-pair';
export const CANCEL_PAIR_CHANNEL = 'evidence:cancel-pair';
export const PAIR_EVENT_CHANNEL = 'evidence:pair-event';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const DECISIONS = [
  'back_test',
  'back_implementation',
  'back_tasking',
  'retry_quality',
  'cancel',
] as const;
const CHECKPOINTS = [
  'plan_confirmed',
  'test_written',
  'red_observed',
  'implementation_written',
  'green_observed',
  'refactored',
  'quality_gate_failed',
  'quality_gates_passed',
  'approved',
  'exception',
] as const;

export function parsePairRequestId(value: unknown): string {
  return identifier(value, 'Pair request id');
}

export function parseRunPairRequest(value: unknown): RunPairRequest {
  const input = object(value, 'Pair request');
  return {
    id: identifier(input.id, 'Pair request id'),
    workspaceId: identifier(input.workspaceId, 'Workspace id'),
    iterationId: identifier(input.iterationId, 'Iteration id'),
  };
}

export function parseReviewPairRequest(value: unknown): ReviewPairRequest {
  const input = object(value, 'Pair review request');
  return {
    ...parseRunPairRequest(input),
    expectedManifestSha256: sha256(
      input.expectedManifestSha256,
      'Manifest SHA-256',
    ),
  };
}

export function parseDecidePairRequest(value: unknown): DecidePairRequest {
  const input = object(value, 'Pair decision request');
  return {
    ...parseRunPairRequest(input),
    action: oneOf(input.action, 'Pair decision', DECISIONS),
    reason: text(input.reason, 'Pair decision reason', 2_000),
    resume: boolean(input.resume, 'Pair resume flag'),
  };
}

export function parseApprovePairRequest(value: unknown): ApprovePairRequest {
  const input = object(value, 'Pair approval request');
  return {
    ...parseRunPairRequest(input),
    expectedManifestSha256: sha256(
      input.expectedManifestSha256,
      'Manifest SHA-256',
    ),
    expectedDiffSha256: sha256(input.expectedDiffSha256, 'diff SHA-256'),
    commitMessage: text(input.commitMessage, 'commit message', 200),
    reason: text(input.reason, 'Pair approval reason', 2_000),
  };
}

export function parsePairControllerEvent(
  value: unknown,
): PairControllerEvent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (
    typeof input.requestId !== 'string' ||
    !ID.test(input.requestId) ||
    (input.event !== 'progress' &&
      input.event !== 'checkpoint' &&
      input.event !== 'human-required') ||
    typeof input.message !== 'string' ||
    input.message.length > 2_000 ||
    (input.checkpoint !== null &&
      !CHECKPOINTS.includes(input.checkpoint as never))
  ) {
    return null;
  }
  return {
    requestId: input.requestId,
    event: input.event,
    message: input.message,
    checkpoint: input.checkpoint as PairControllerEvent['checkpoint'],
  };
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function identifier(value: unknown, label: string): string {
  const normalized = text(value, label, 256);
  if (!ID.test(normalized)) throw new Error(`${label} is invalid.`);
  return normalized;
}

function text(value: unknown, label: string, maximum: number): string {
  if (typeof value !== 'string') throw new Error(`${label} is invalid.`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) {
    throw new Error(`${label} is invalid.`);
  }
  return normalized;
}

function sha256(value: unknown, label: string): string {
  if (typeof value !== 'string' || !SHA256.test(value)) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${label} is invalid.`);
  return value;
}

function oneOf<const T extends readonly string[]>(
  value: unknown,
  label: string,
  options: T,
): T[number] {
  if (typeof value === 'string' && options.includes(value)) return value;
  throw new Error(`${label} is invalid.`);
}
