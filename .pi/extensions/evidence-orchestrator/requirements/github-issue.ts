import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ensureProjectDirs } from '../evidence/artifact-index';
import { iterationRoot, nextIterationId } from '../workflow/iteration-paths';
import { DEFAULT_STATE } from '../workflow/phase-catalog';
import { readState, writeState } from '../workflow/state-store';
import type {
  GitHubIssueRequirementSource,
  WorkflowState,
} from '../workflow/types';

export type GitHubCliRunner = (args: string[], cwd: string) => string;
export type GitHubCliAsyncRunner = (
  args: string[],
  cwd: string,
  signal?: AbortSignal,
) => Promise<string>;

export interface StartFromIssueInput {
  issueNumber: number;
  repository?: string;
}

export interface GitHubIssueSnapshot {
  version: 1;
  provider: 'github';
  repository: string;
  issue_number: number;
  url: string;
  title: string;
  body: string;
  state: string;
  author: string;
  labels: string[];
  created_at: string;
  updated_at: string;
  fetched_at: string;
  content_hash: string;
}

export interface IssueSourceDrift {
  changed: boolean;
  snapshot_hash: string;
  remote_hash: string;
  issue_updated_at: string;
}

interface GitHubIssueResponse {
  number: number;
  title: string;
  body: string | null;
  url: string;
  state: string;
  author?: { login?: string } | null;
  labels?: Array<{ name?: string }>;
  createdAt: string;
  updatedAt: string;
}

const ISSUE_FIELDS =
  'number,title,body,url,state,author,labels,createdAt,updatedAt';

function defaultRunner(args: string[], cwd: string): string {
  try {
    return execFileSync('gh', args, { cwd, encoding: 'utf8' });
  } catch (error) {
    throw new Error(
      `Unable to read the GitHub Issue with gh CLI. Authenticate with "gh auth login" and verify repository access. ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function parseJson<T>(text: string, description: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${description} returned invalid JSON.`);
  }
}

function requireIssueNumber(issueNumber: number): void {
  if (!Number.isSafeInteger(issueNumber) || issueNumber <= 0) {
    throw new Error(`Invalid GitHub Issue number: ${issueNumber}.`);
  }
}

function resolveRepository(cwd: string, runner: GitHubCliRunner): string {
  const response = parseJson<{ nameWithOwner?: string }>(
    runner(['repo', 'view', '--json', 'nameWithOwner'], cwd),
    'gh repo view',
  );
  if (!response.nameWithOwner?.trim()) {
    throw new Error('Unable to resolve the GitHub repository name.');
  }
  return response.nameWithOwner;
}

function hashPayload(snapshot: {
  repository: string;
  issue_number: number;
  title: string;
  body: string;
  state: string;
  labels: string[];
  updated_at: string;
}): string {
  const payload = JSON.stringify({
    repository: snapshot.repository,
    issue_number: snapshot.issue_number,
    title: snapshot.title,
    body: snapshot.body,
    state: snapshot.state,
    labels: [...snapshot.labels].sort(),
    updated_at: snapshot.updated_at,
  });
  return `sha256:${createHash('sha256').update(payload).digest('hex')}`;
}

export function issueContentHash(
  snapshot: Omit<
    GitHubIssueSnapshot,
    | 'content_hash'
    | 'fetched_at'
    | 'version'
    | 'provider'
    | 'url'
    | 'author'
    | 'created_at'
  >,
): string {
  return hashPayload(snapshot);
}

function snapshotFromResponse(
  repository: string,
  input: StartFromIssueInput,
  response: GitHubIssueResponse,
): GitHubIssueSnapshot {
  if (response.number !== input.issueNumber) {
    throw new Error(
      `GitHub returned Issue #${response.number}, expected #${input.issueNumber}.`,
    );
  }
  const labels = (response.labels ?? [])
    .map((label) => label.name?.trim())
    .filter((label): label is string => Boolean(label))
    .sort();
  const snapshotWithoutHash = {
    version: 1 as const,
    provider: 'github' as const,
    repository,
    issue_number: response.number,
    url: response.url,
    title: response.title,
    body: response.body ?? '',
    state: response.state,
    author: response.author?.login ?? 'unknown',
    labels,
    created_at: response.createdAt,
    updated_at: response.updatedAt,
    fetched_at: new Date().toISOString(),
  };
  return {
    ...snapshotWithoutHash,
    content_hash: hashPayload(snapshotWithoutHash),
  };
}

export function fetchGitHubIssue(
  cwd: string,
  input: StartFromIssueInput,
  runner: GitHubCliRunner = defaultRunner,
): GitHubIssueSnapshot {
  requireIssueNumber(input.issueNumber);
  const repository = input.repository?.trim() || resolveRepository(cwd, runner);
  const response = parseJson<GitHubIssueResponse>(
    runner(
      [
        'issue',
        'view',
        String(input.issueNumber),
        '--repo',
        repository,
        '--json',
        ISSUE_FIELDS,
      ],
      cwd,
    ),
    'gh issue view',
  );
  return snapshotFromResponse(repository, input, response);
}

export async function fetchGitHubIssueAsync(
  cwd: string,
  input: StartFromIssueInput,
  runner: GitHubCliAsyncRunner,
  signal?: AbortSignal,
): Promise<GitHubIssueSnapshot> {
  requireIssueNumber(input.issueNumber);
  const repository =
    input.repository?.trim() ||
    parseJson<{ nameWithOwner?: string }>(
      await runner(['repo', 'view', '--json', 'nameWithOwner'], cwd, signal),
      'gh repo view',
    ).nameWithOwner?.trim();
  if (!repository) {
    throw new Error('Unable to resolve the GitHub repository name.');
  }
  signal?.throwIfAborted();
  const response = parseJson<GitHubIssueResponse>(
    await runner(
      [
        'issue',
        'view',
        String(input.issueNumber),
        '--repo',
        repository,
        '--json',
        ISSUE_FIELDS,
      ],
      cwd,
      signal,
    ),
    'gh issue view',
  );
  signal?.throwIfAborted();
  return snapshotFromResponse(repository, input, response);
}

function sourceFor(
  iterationId: string,
  snapshot: GitHubIssueSnapshot,
): GitHubIssueRequirementSource {
  return {
    type: 'github_issue',
    repository: snapshot.repository,
    issue_number: snapshot.issue_number,
    url: snapshot.url,
    snapshot_path: `artifacts/iterations/${iterationId}/00-user-input/issue.json`,
    projection_path: `artifacts/iterations/${iterationId}/00-user-input/requirements.md`,
    content_hash: snapshot.content_hash,
    issue_updated_at: snapshot.updated_at,
    fetched_at: snapshot.fetched_at,
  };
}

function issueProjection(snapshot: GitHubIssueSnapshot): string {
  const labels = snapshot.labels.length ? snapshot.labels.join(', ') : 'none';
  return `<!-- 此文件由 GitHub Issue 自动生成，请勿手工维护 -->
# ${snapshot.title}

## Issue 来源

- Repository: ${snapshot.repository}
- Issue: [#${snapshot.issue_number}](${snapshot.url})
- State: ${snapshot.state}
- Author: ${snapshot.author}
- Labels: ${labels}
- Updated: ${snapshot.updated_at}
- Content Hash: ${snapshot.content_hash}

## 需求描述

${snapshot.body || '（Issue 没有正文）'}
`;
}

function persistSnapshot(
  cwd: string,
  state: WorkflowState,
  snapshot: GitHubIssueSnapshot,
): WorkflowState {
  const source = sourceFor(state.iteration_id, snapshot);
  ensureProjectDirs(cwd, iterationRoot(cwd, state));
  writeFileSync(
    join(cwd, source.snapshot_path),
    `${JSON.stringify(snapshot, null, 2)}\n`,
  );
  writeFileSync(join(cwd, source.projection_path), issueProjection(snapshot));
  return writeState(cwd, { ...state, requirement_source: source });
}

/** Start a new immutable iteration whose upstream requirement authority is one GitHub Issue. */
export function startIterationFromIssue(
  cwd: string,
  input: StartFromIssueInput,
  runner: GitHubCliRunner = defaultRunner,
): WorkflowState {
  const snapshot = fetchGitHubIssue(cwd, input, runner);
  const state = writeState(cwd, {
    ...DEFAULT_STATE,
    iteration_id: nextIterationId(cwd),
    pi: { enabled: true, version: 5, execution_evidence_version: 1 },
  });
  return persistSnapshot(cwd, state, snapshot);
}

export async function startIterationFromIssueAsync(
  cwd: string,
  input: StartFromIssueInput,
  runner: GitHubCliAsyncRunner,
  signal?: AbortSignal,
): Promise<WorkflowState> {
  const snapshot = await fetchGitHubIssueAsync(cwd, input, runner, signal);
  signal?.throwIfAborted();
  const state = writeState(cwd, {
    ...DEFAULT_STATE,
    iteration_id: nextIterationId(cwd),
    pi: { enabled: true, version: 5, execution_evidence_version: 1 },
  });
  return persistSnapshot(cwd, state, snapshot);
}

function requireIssueSource(
  state: WorkflowState,
): GitHubIssueRequirementSource {
  if (!state.requirement_source) {
    throw new Error(
      'The active iteration has no GitHub Issue requirement source. Select one with /evidence-new.',
    );
  }
  return state.requirement_source;
}

/** Compare the live Issue with the frozen iteration snapshot without modifying local evidence. */
export function checkIssueSourceDrift(
  cwd: string,
  runner: GitHubCliRunner = defaultRunner,
): IssueSourceDrift {
  const state = readState(cwd);
  const source = requireIssueSource(state);
  const remote = fetchGitHubIssue(
    cwd,
    { issueNumber: source.issue_number, repository: source.repository },
    runner,
  );
  return {
    changed: remote.content_hash !== source.content_hash,
    snapshot_hash: source.content_hash,
    remote_hash: remote.content_hash,
    issue_updated_at: remote.updated_at,
  };
}

export async function checkIssueSourceDriftAsync(
  cwd: string,
  runner: GitHubCliAsyncRunner,
  signal?: AbortSignal,
): Promise<IssueSourceDrift> {
  const state = readState(cwd);
  const source = requireIssueSource(state);
  const remote = await fetchGitHubIssueAsync(
    cwd,
    { issueNumber: source.issue_number, repository: source.repository },
    runner,
    signal,
  );
  return {
    changed: remote.content_hash !== source.content_hash,
    snapshot_hash: source.content_hash,
    remote_hash: remote.content_hash,
    issue_updated_at: remote.updated_at,
  };
}

/** Explicitly refresh an Issue snapshot before framing has completed. */
export function syncIssueSource(
  cwd: string,
  runner: GitHubCliRunner = defaultRunner,
): WorkflowState {
  const state = readState(cwd);
  if (state.phase !== 'frame') {
    throw new Error(
      `Cannot refresh the Issue snapshot in phase ${state.phase}. Start a new iteration or return to frame.`,
    );
  }
  const source = requireIssueSource(state);
  const remote = fetchGitHubIssue(
    cwd,
    { issueNumber: source.issue_number, repository: source.repository },
    runner,
  );
  return persistSnapshot(cwd, state, remote);
}

export async function syncIssueSourceAsync(
  cwd: string,
  runner: GitHubCliAsyncRunner,
  signal?: AbortSignal,
): Promise<WorkflowState> {
  const state = readState(cwd);
  if (state.phase !== 'frame') {
    throw new Error(
      `Cannot refresh the Issue snapshot in phase ${state.phase}. Start a new iteration or return to frame.`,
    );
  }
  const source = requireIssueSource(state);
  const remote = await fetchGitHubIssueAsync(
    cwd,
    { issueNumber: source.issue_number, repository: source.repository },
    runner,
    signal,
  );
  signal?.throwIfAborted();
  return persistSnapshot(cwd, state, remote);
}

/** Deterministically verify that state, JSON snapshot, and generated Markdown projection agree. */
export function validateIssueSourceSnapshot(
  cwd: string,
  state = readState(cwd),
): void {
  const source = requireIssueSource(state);
  if (!existsSync(join(cwd, source.snapshot_path))) {
    throw new Error(
      `GitHub Issue snapshot is missing: ${source.snapshot_path}.`,
    );
  }
  if (!existsSync(join(cwd, source.projection_path))) {
    throw new Error(
      `GitHub Issue requirement projection is missing: ${source.projection_path}.`,
    );
  }
  const snapshot = parseJson<GitHubIssueSnapshot>(
    readFileSync(join(cwd, source.snapshot_path), 'utf8'),
    source.snapshot_path,
  );
  const calculatedHash = hashPayload(snapshot);
  if (
    snapshot.version !== 1 ||
    snapshot.provider !== 'github' ||
    snapshot.repository !== source.repository ||
    snapshot.issue_number !== source.issue_number ||
    snapshot.url !== source.url ||
    snapshot.content_hash !== calculatedHash ||
    source.content_hash !== calculatedHash ||
    source.issue_updated_at !== snapshot.updated_at
  ) {
    throw new Error(
      `GitHub Issue snapshot metadata or content hash is inconsistent: ${source.snapshot_path}.`,
    );
  }
  const projection = readFileSync(join(cwd, source.projection_path), 'utf8');
  if (projection !== issueProjection(snapshot)) {
    throw new Error(
      `GitHub Issue requirement projection is stale or manually modified: ${source.projection_path}.`,
    );
  }
}
