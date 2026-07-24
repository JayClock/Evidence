import type { CodingAgentEvent } from './coding-agent-protocol';

export const RUN_CODING_AGENT_CHANNEL = 'evidence:run-coding-agent';
export const CANCEL_CODING_AGENT_CHANNEL = 'evidence:cancel-coding-agent';
export const CODING_AGENT_EVENT_CHANNEL = 'evidence:coding-agent-event';
export const GET_CODING_REVIEW_CHANNEL = 'evidence:get-coding-review';
export const ACCEPT_CODING_RUN_CHANNEL = 'evidence:accept-coding-run';
export const REJECT_CODING_RUN_CHANNEL = 'evidence:reject-coding-run';

export interface StartCodingRequest {
  id: string;
  workspaceId: string;
  storyId: string;
  storyRevisionId: string;
}

export interface CodingRunDecisionRequest {
  workspaceId: string;
  runId: string;
  diffSha256: string;
}

export interface CodingRunRejectionRequest extends CodingRunDecisionRequest {
  reason: string;
}

export type CodingRunEvent = CodingAgentEvent;

const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9:._-]{0,127}$/;
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;

export function parseStartCodingRequest(value: unknown): StartCodingRequest {
  const input = record(value);
  return {
    id: safeId(input.id, 'request id'),
    workspaceId: safeId(input.workspaceId, 'Workspace id'),
    storyId: safeId(input.storyId, 'Story id'),
    storyRevisionId: safeId(input.storyRevisionId, 'Story Revision id'),
  };
}

export function parseCodingRunId(value: unknown): string {
  return safeId(value, 'Coding Run id');
}

export function parseCodingRunDecisionRequest(
  value: unknown,
): CodingRunDecisionRequest {
  const input = record(value);
  return {
    workspaceId: safeId(input.workspaceId, 'Workspace id'),
    runId: safeId(input.runId, 'Coding Run id'),
    diffSha256: sha256(input.diffSha256),
  };
}

export function parseCodingRunRejectionRequest(
  value: unknown,
): CodingRunRejectionRequest {
  const input = record(value);
  const decision = parseCodingRunDecisionRequest(input);
  const reason = requiredString(input.reason, 'rejection reason').trim();
  if (reason.length > 2_000) {
    throw new Error('Coding Run rejection reason is too long.');
  }
  return { ...decision, reason };
}

export function parseCodingRunEvent(value: unknown): CodingRunEvent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const event = value as Partial<CodingRunEvent>;
  if (
    typeof event.id !== 'string' ||
    typeof event.event !== 'string' ||
    typeof event.data !== 'string'
  ) {
    return null;
  }
  return { id: event.id, event: event.event, data: event.data };
}

function sha256(value: unknown): string {
  const normalized = requiredString(value, 'diff SHA-256').toLowerCase();
  if (!SHA256_PATTERN.test(normalized)) {
    throw new Error('Coding Run diff SHA-256 is invalid.');
  }
  return normalized;
}

function safeId(value: unknown, label: string): string {
  const normalized = requiredString(value, label).trim();
  if (!ID_PATTERN.test(normalized)) {
    throw new Error(`Coding Run ${label} is invalid.`);
  }
  return normalized;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Coding Run ${label} is required.`);
  }
  return value;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Coding Run request must be an object.');
  }
  return value as Record<string, unknown>;
}
