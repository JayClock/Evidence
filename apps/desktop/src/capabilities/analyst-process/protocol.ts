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

export interface TaskingAnalystRequest {
  id: string;
  workspaceId: string;
  iterationId: string;
}

export interface TaskingAnalystRuntimeRequest extends TaskingAnalystRequest {
  apiBaseUrl: string;
  sessionDirectory: string;
  repositoryRoot: string;
  worktreeRoot: string;
}

export interface AnalystEvent {
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

export function parseTaskingAnalystRequest(
  value: unknown,
): TaskingAnalystRequest {
  const input = record(value);
  return {
    id: requestId(input.id),
    workspaceId: resourceId(input.workspaceId, 'Workspace id'),
    iterationId: resourceId(input.iterationId, 'Iteration id'),
  };
}

export function parseTaskingAnalystRuntimeRequest(
  value: unknown,
): TaskingAnalystRuntimeRequest {
  const input = record(value);
  return {
    ...parseTaskingAnalystRequest(input),
    apiBaseUrl: requiredString(input.apiBaseUrl, 'API base URL'),
    sessionDirectory: requiredString(
      input.sessionDirectory,
      'Tasking session directory',
    ),
    repositoryRoot: requiredString(input.repositoryRoot, 'Repository root'),
    worktreeRoot: requiredString(input.worktreeRoot, 'Iteration worktree root'),
  };
}

export function parseAnalystEvent(value: unknown): AnalystEvent | null {
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

function isEvent(value: unknown): value is AnalystEvent['event'] {
  return (
    value === 'progress' ||
    value === 'tool-start' ||
    value === 'tool-end' ||
    value === 'complete' ||
    value === 'error'
  );
}
