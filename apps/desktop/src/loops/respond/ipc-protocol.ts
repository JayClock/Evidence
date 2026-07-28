import type {
  RespondControllerEvent,
  RespondControllerSummary,
  RunRespondRequest,
} from './controller';

export const RUN_RESPOND_LEARNER_CHANNEL = 'evidence:respond:run-learner';
export const CANCEL_RESPOND_CHANNEL = 'evidence:respond:cancel';
export const RESPOND_EVENT_CHANNEL = 'evidence:respond:event';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;

export function parseRunRespondRequest(value: unknown): RunRespondRequest {
  const input = object(value, 'Respond request');
  return {
    id: identifier(input.id, 'request id'),
    workspaceId: identifier(input.workspaceId, 'workspace id'),
    iterationId: identifier(input.iterationId, 'iteration id'),
  };
}

export function parseRespondRequestId(value: unknown): string {
  return identifier(value, 'request id');
}

export function parseRespondControllerEvent(
  value: unknown,
): RespondControllerEvent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (
    typeof input.requestId !== 'string' ||
    !ID.test(input.requestId) ||
    !['progress', 'checkpoint', 'human-required'].includes(
      String(input.event),
    ) ||
    typeof input.message !== 'string' ||
    typeof input.stage !== 'string'
  ) {
    return null;
  }
  return input as unknown as RespondControllerEvent;
}

export function parseRespondControllerSummary(
  value: unknown,
): RespondControllerSummary {
  const input = object(value, 'Respond summary');
  const nextAction = input.nextAction;
  if (
    nextAction !== null &&
    nextAction !== 'run_learner' &&
    nextAction !== 'await_human'
  ) {
    throw new Error('Respond next action is invalid.');
  }
  return {
    iterationId: identifier(input.iterationId, 'iteration id'),
    stage: text(
      input.stage,
      'Respond stage',
    ) as RespondControllerSummary['stage'],
    version: positive(input.version, 'Respond version'),
    nextAction,
    candidateId:
      input.candidateId === null
        ? null
        : identifier(input.candidateId, 'Respond Candidate id'),
  };
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function identifier(value: unknown, label: string): string {
  const normalized = text(value, label);
  if (!ID.test(normalized)) throw new Error(`${label} is invalid.`);
  return normalized;
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} is required.`);
  }
  return value;
}

function positive(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return Number(value);
}
