import type {
  RunShowcaseRequest,
  ShowcaseControllerEvent,
} from './showcase-controller';

export const RUN_SHOWCASE_CHECKS_CHANNEL = 'evidence:run-showcase-checks';
export const RUN_SHOWCASE_REVIEWER_CHANNEL = 'evidence:run-showcase-reviewer';
export const CANCEL_SHOWCASE_CHANNEL = 'evidence:cancel-showcase';
export const SHOWCASE_EVENT_CHANNEL = 'evidence:showcase-event';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const STAGES = [
  'setup',
  'reviewing',
  'decision',
  'accepted',
  'revised',
  'rejected',
] as const;

export function parseRunShowcaseRequest(value: unknown): RunShowcaseRequest {
  const input = object(value, 'Showcase request');
  return {
    id: identifier(input.id, 'Showcase request id'),
    workspaceId: identifier(input.workspaceId, 'Workspace id'),
    iterationId: identifier(input.iterationId, 'Iteration id'),
  };
}

export function parseShowcaseRequestId(value: unknown): string {
  return identifier(value, 'Showcase request id');
}

export function parseShowcaseControllerEvent(
  value: unknown,
): ShowcaseControllerEvent | null {
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
    (input.stage !== null && !STAGES.includes(input.stage as never))
  ) {
    return null;
  }
  return {
    requestId: input.requestId,
    event: input.event,
    message: input.message,
    stage: input.stage as ShowcaseControllerEvent['stage'],
  };
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function identifier(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} is invalid.`);
  const normalized = value.trim();
  if (!ID.test(normalized)) throw new Error(`${label} is invalid.`);
  return normalized;
}
