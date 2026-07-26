import type { StartIterationRequest } from './iteration-controller';

export const READ_INBOX_MARKDOWN_CHANNEL = 'evidence:read-inbox-markdown';
export const FETCH_INBOX_GITHUB_ISSUE_CHANNEL =
  'evidence:fetch-inbox-github-issue';
export const RUN_INBOX_ANALYST_CHANNEL = 'evidence:run-inbox-analyst';
export const CANCEL_INBOX_ANALYST_CHANNEL = 'evidence:cancel-inbox-analyst';
export const RUN_KICKOFF_ANALYST_CHANNEL = 'evidence:run-kickoff-analyst';
export const CANCEL_KICKOFF_ANALYST_CHANNEL = 'evidence:cancel-kickoff-analyst';
export const INTAKE_AGENT_EVENT_CHANNEL = 'evidence:intake-agent-event';
export const START_ITERATION_CHANNEL = 'evidence:start-iteration';

const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9:._-]{0,199}$/;
const GITHUB_NAME_PATTERN = /^[a-zA-Z0-9_.-]{1,100}$/;

export interface ReadInboxMarkdownRequest {
  workspaceId: string;
  relativePath: string;
}

export interface GitHubIssueReference {
  owner: string;
  repository: string;
  issueNumber: number;
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

export function parseGitHubIssueReference(
  value: unknown,
): GitHubIssueReference {
  const input = record(value);
  const owner = githubName(input.owner, 'GitHub owner');
  const repository = githubName(input.repository, 'GitHub repository');
  if (
    typeof input.issueNumber !== 'number' ||
    !Number.isSafeInteger(input.issueNumber) ||
    input.issueNumber < 1 ||
    input.issueNumber > 2_147_483_647
  ) {
    throw new Error('GitHub issue number is invalid.');
  }
  return { owner, repository, issueNumber: input.issueNumber };
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
    throw new Error('Desktop intake request must be an object.');
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

function githubName(value: unknown, label: string): string {
  const normalized = requiredString(value, label).trim();
  if (!GITHUB_NAME_PATTERN.test(normalized)) {
    throw new Error(`${label} contains unsupported characters.`);
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
