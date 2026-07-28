export const RUN_DIAGRAM_AGENT_CHANNEL = 'evidence:run-diagram-agent';
export const CANCEL_DIAGRAM_AGENT_CHANNEL = 'evidence:cancel-diagram-agent';
export const DIAGRAM_AGENT_EVENT_CHANNEL = 'evidence:diagram-agent-event';

export interface DiagramAgentRequest {
  id: string;
  requirement: string;
  logicalEntitiesHref: string;
  logicalRelationshipsHref: string;
}

export interface AgentRuntimeRequest extends DiagramAgentRequest {
  apiBaseUrl: string;
}

export interface DiagramAgentEvent {
  id: string;
  event: string | null;
  data: string;
}

const REQUEST_ID_PATTERN = /^[a-zA-Z0-9:_-]{1,128}$/;
const MAX_REQUIREMENT_LENGTH = 20_000;

export function parseDiagramAgentRequest(value: unknown): DiagramAgentRequest {
  const input = record(value);
  const id = requiredString(input.id, 'agent request id');
  const requirement = requiredString(input.requirement, 'requirement').trim();
  const logicalEntitiesHref = requiredString(
    input.logicalEntitiesHref,
    'logical entities link',
  );
  const logicalRelationshipsHref = requiredString(
    input.logicalRelationshipsHref,
    'logical relationships link',
  );

  if (!REQUEST_ID_PATTERN.test(id)) {
    throw new Error('Agent request id contains unsupported characters.');
  }
  if (requirement.length > MAX_REQUIREMENT_LENGTH) {
    throw new Error(
      `Agent requirement must not exceed ${String(MAX_REQUIREMENT_LENGTH)} characters.`,
    );
  }

  return {
    id,
    requirement,
    logicalEntitiesHref,
    logicalRelationshipsHref,
  };
}

export function parseAgentRuntimeRequest(value: unknown): AgentRuntimeRequest {
  const input = record(value);
  return {
    ...parseDiagramAgentRequest(input),
    apiBaseUrl: requiredString(input.apiBaseUrl, 'API base URL'),
  };
}

export function parseDiagramAgentEvent(
  value: unknown,
): DiagramAgentEvent | null {
  const input = recordOrNull(value);
  if (
    !input ||
    typeof input.id !== 'string' ||
    (typeof input.event !== 'string' && input.event !== null) ||
    typeof input.data !== 'string'
  ) {
    return null;
  }
  return { id: input.id, event: input.event, data: input.data };
}

function record(value: unknown): Record<string, unknown> {
  const parsed = recordOrNull(value);
  if (!parsed) {
    throw new Error('Agent request must be an object.');
  }
  return parsed;
}

function recordOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} is required.`);
  }
  return value;
}
