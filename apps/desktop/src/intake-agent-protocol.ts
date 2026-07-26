export const RUN_INBOX_ANALYST_CHANNEL = 'evidence:run-inbox-analyst';
export const CANCEL_INBOX_ANALYST_CHANNEL = 'evidence:cancel-inbox-analyst';
export const INBOX_ANALYST_EVENT_CHANNEL = 'evidence:inbox-analyst-event';
export const RUN_KICKOFF_ANALYST_CHANNEL = 'evidence:run-kickoff-analyst';
export const CANCEL_KICKOFF_ANALYST_CHANNEL = 'evidence:cancel-kickoff-analyst';
export const KICKOFF_ANALYST_EVENT_CHANNEL = 'evidence:kickoff-analyst-event';
export const RUN_UNDERSTANDING_ANALYST_CHANNEL =
  'evidence:run-understanding-analyst';
export const CANCEL_UNDERSTANDING_ANALYST_CHANNEL =
  'evidence:cancel-understanding-analyst';

export interface InboxAnalystRequest {
  id: string;
  workspaceId: string;
  extractionId: string;
}

export interface InboxAnalystRuntimeRequest extends InboxAnalystRequest {
  apiBaseUrl: string;
}

export interface KickoffAnalystRequest {
  id: string;
  workspaceId: string;
  iterationId: string;
}

export interface KickoffAnalystRuntimeRequest extends KickoffAnalystRequest {
  apiBaseUrl: string;
}

export interface UnderstandingAnalystRequest {
  id: string;
  workspaceId: string;
  iterationId: string;
}

export interface UnderstandingAnalystRuntimeRequest
  extends UnderstandingAnalystRequest {
  apiBaseUrl: string;
  sessionDirectory: string;
}

export interface IntakeAgentEvent {
  id: string;
  event: 'progress' | 'tool-start' | 'tool-end' | 'complete' | 'error';
  data: string;
}

const REQUEST_ID_PATTERN = /^[a-zA-Z0-9:_-]{1,128}$/;
const RESOURCE_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,255}$/;

export function parseInboxAnalystRequest(value: unknown): InboxAnalystRequest {
  const input = record(value);
  return {
    id: requestId(input.id),
    workspaceId: resourceId(input.workspaceId, 'Workspace id'),
    extractionId: resourceId(input.extractionId, 'Extraction id'),
  };
}

export function parseInboxAnalystRuntimeRequest(
  value: unknown,
): InboxAnalystRuntimeRequest {
  const input = record(value);
  return {
    ...parseInboxAnalystRequest(input),
    apiBaseUrl: requiredString(input.apiBaseUrl, 'API base URL'),
  };
}

export function parseKickoffAnalystRequest(
  value: unknown,
): KickoffAnalystRequest {
  const input = record(value);
  return {
    id: requestId(input.id),
    workspaceId: resourceId(input.workspaceId, 'Workspace id'),
    iterationId: resourceId(input.iterationId, 'Iteration id'),
  };
}

export function parseKickoffAnalystRuntimeRequest(
  value: unknown,
): KickoffAnalystRuntimeRequest {
  const input = record(value);
  return {
    ...parseKickoffAnalystRequest(input),
    apiBaseUrl: requiredString(input.apiBaseUrl, 'API base URL'),
  };
}

export function parseUnderstandingAnalystRequest(
  value: unknown,
): UnderstandingAnalystRequest {
  const input = record(value);
  return {
    id: requestId(input.id),
    workspaceId: resourceId(input.workspaceId, 'Workspace id'),
    iterationId: resourceId(input.iterationId, 'Iteration id'),
  };
}

export function parseUnderstandingAnalystRuntimeRequest(
  value: unknown,
): UnderstandingAnalystRuntimeRequest {
  const input = record(value);
  return {
    ...parseUnderstandingAnalystRequest(input),
    apiBaseUrl: requiredString(input.apiBaseUrl, 'API base URL'),
    sessionDirectory: requiredString(
      input.sessionDirectory,
      'TQA session directory',
    ),
  };
}

export function parseIntakeAgentEvent(value: unknown): IntakeAgentEvent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (
    typeof input.id !== 'string' ||
    !REQUEST_ID_PATTERN.test(input.id) ||
    !isEvent(input.event) ||
    typeof input.data !== 'string'
  ) {
    return null;
  }
  return { id: input.id, event: input.event, data: input.data };
}

function requestId(value: unknown): string {
  const id = requiredString(value, 'Agent request id');
  if (!REQUEST_ID_PATTERN.test(id)) {
    throw new Error('Agent request id contains unsupported characters.');
  }
  return id;
}

function resourceId(value: unknown, label: string): string {
  const id = requiredString(value, label).trim();
  if (!RESOURCE_ID_PATTERN.test(id)) {
    throw new Error(`${label} contains unsupported characters.`);
  }
  return id;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} is required.`);
  }
  return value;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Agent request must be an object.');
  }
  return value as Record<string, unknown>;
}

function isEvent(value: unknown): value is IntakeAgentEvent['event'] {
  return (
    value === 'progress' ||
    value === 'tool-start' ||
    value === 'tool-end' ||
    value === 'complete' ||
    value === 'error'
  );
}
