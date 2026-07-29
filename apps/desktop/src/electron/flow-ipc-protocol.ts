import type { StartIterationRequest } from '../iteration/provisioning-controller';

export const READ_INBOX_MARKDOWN_CHANNEL = 'evidence:read-inbox-markdown';
export const FETCH_INBOX_GITHUB_ISSUES_CHANNEL =
  'evidence:fetch-inbox-github-issues';
export const RUN_INBOX_ANALYST_CHANNEL = 'evidence:run-inbox-analyst';
export const CANCEL_INBOX_ANALYST_CHANNEL = 'evidence:cancel-inbox-analyst';
export const RUN_KICKOFF_ANALYST_CHANNEL = 'evidence:run-kickoff-analyst';
export const CANCEL_KICKOFF_ANALYST_CHANNEL = 'evidence:cancel-kickoff-analyst';
export const RUN_UNDERSTANDING_ANALYST_CHANNEL =
  'evidence:run-understanding-analyst';
export const CANCEL_UNDERSTANDING_ANALYST_CHANNEL =
  'evidence:cancel-understanding-analyst';
export const RUN_TASKING_ANALYST_CHANNEL = 'evidence:run-tasking-analyst';
export const CANCEL_TASKING_ANALYST_CHANNEL = 'evidence:cancel-tasking-analyst';
export const ANALYST_EVENT_CHANNEL = 'evidence:analyst-event';
export const START_ITERATION_CHANNEL = 'evidence:start-iteration';

const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9:._-]{0,199}$/;

export interface ReadInboxMarkdownRequest {
  workspaceId: string;
  relativePath: string;
}

export interface FetchInboxGitHubIssuesRequest {
  workspaceId: string;
}

export function parseReadInboxMarkdownRequest(
  value: unknown,
): ReadInboxMarkdownRequest {
  const input = record(value);
  return {
    workspaceId: id(input.workspaceId, 'Workspace'),
    relativePath: requiredString(input.relativePath, 'Markdown relative path'),
  };
}

export function parseFetchInboxGitHubIssuesRequest(
  value: unknown,
): FetchInboxGitHubIssuesRequest {
  const input = record(value);
  return {
    workspaceId: id(input.workspaceId, 'Workspace'),
  };
}

export function parseStartIterationRequest(
  value: unknown,
): StartIterationRequest {
  const input = record(value);
  return {
    id: id(input.id, 'Iteration request'),
    workspaceId: id(input.workspaceId, 'Workspace'),
    candidateId: id(input.candidateId, 'Inbox Candidate'),
  };
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Desktop flow request must be an object.');
  }
  return value as Record<string, unknown>;
}

function id(value: unknown, label: string): string {
  const normalized = requiredString(value, `${label} id`).trim();
  if (!ID_PATTERN.test(normalized)) {
    throw new Error(`${label} id contains unsupported characters.`);
  }
  return normalized;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} is required.`);
  }
  if (value.length > 1_000) {
    throw new Error(`${label} is too long.`);
  }
  return value;
}
