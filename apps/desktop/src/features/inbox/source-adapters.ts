import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { canonicalGitRepository, runGit } from '../../adapters/git/repository';
import { localCommandEnvironment } from '../../adapters/node/command-environment';
import type { InboxSourceCapture } from '../../capabilities/inbox-source/capture';

const execFileAsync = promisify(execFile);
const MAX_MARKDOWN_BYTES = 1024 * 1024;
const MAX_GITHUB_OUTPUT_BYTES = 64 * 1024 * 1024;
const GITHUB_LIST_TIMEOUT_MS = 2 * 60 * 1_000;
const ALL_GITHUB_ISSUES_LIMIT = 2_147_483_647;
const GITHUB_REPOSITORY_PATTERN = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;

export interface GitHubIssuesCaptureInput {
  repositoryRoot: string;
}

export type GitHubCommandRunner = (
  command: string,
  args: string[],
) => Promise<string>;

export function captureManualText(input: {
  title: string;
  body: string;
  contentType?: 'text/plain' | 'text/markdown';
}): InboxSourceCapture {
  const title = singleLine(input.title, 'Manual Inbox title');
  const body = sourceBody(input.body, 'Manual Inbox body');
  const contentType = input.contentType ?? 'text/plain';
  const identity = JSON.stringify({ title, body, contentType });
  return {
    sourceKind: 'manual_text',
    externalKey: `manual:${sha256(identity)}`,
    title,
    body,
    contentType,
    uri: null,
    providerMetadata: {},
    sourceUpdatedAt: null,
  };
}

export async function captureRepositoryMarkdown(input: {
  repositoryRoot: string;
  relativePath: string;
}): Promise<InboxSourceCapture> {
  const repositoryRoot = await canonicalGitRepository(input.repositoryRoot);
  const relativePath = normalizeRepositoryRelativePath(input.relativePath);
  const requestedPath = resolve(repositoryRoot, relativePath);
  assertInside(repositoryRoot, requestedPath);
  const canonicalPath = await realpath(requestedPath).catch(() => {
    throw new Error('Inbox Markdown source is not accessible.');
  });
  assertInside(repositoryRoot, canonicalPath);
  const metadata = await stat(canonicalPath);
  if (!metadata.isFile()) {
    throw new Error('Inbox Markdown source must be a regular file.');
  }
  if (metadata.size > MAX_MARKDOWN_BYTES) {
    throw new Error('Inbox Markdown source must not exceed 1 MiB.');
  }
  const body = sourceBody(
    await readFile(canonicalPath, 'utf8'),
    'Inbox Markdown body',
  );
  if (Buffer.byteLength(body, 'utf8') > MAX_MARKDOWN_BYTES) {
    throw new Error('Inbox Markdown source must not exceed 1 MiB.');
  }
  return {
    sourceKind: 'local_markdown',
    externalKey: `workspace:${relativePath}`,
    title: markdownTitle(body, relativePath),
    body,
    contentType: 'text/markdown',
    uri: null,
    providerMetadata: { relativePath },
    sourceUpdatedAt: metadata.mtime.toISOString(),
  };
}

export async function captureOpenGitHubIssues(
  input: GitHubIssuesCaptureInput,
  runner: GitHubCommandRunner = runGitHub,
): Promise<InboxSourceCapture[]> {
  const repository = await workspaceGitHubRepository(input.repositoryRoot);
  const output = await runner('gh', [
    'issue',
    'list',
    '--repo',
    repository,
    '--state',
    'open',
    '--limit',
    String(ALL_GITHUB_ISSUES_LIMIT),
    '--json',
    'number,title,body,url,updatedAt,state,labels',
  ]);
  const issues = jsonObjectArray(output, 'GitHub Issue list response');
  const captures = issues.map((issue, index) =>
    githubIssueCapture(repository, issue, index + 1),
  );
  const identities = new Set<string>();
  for (const capture of captures) {
    if (identities.has(capture.externalKey)) {
      throw new Error('GitHub Issue list contains a duplicate identity.');
    }
    identities.add(capture.externalKey);
  }
  return captures;
}

function githubIssueCapture(
  repository: string,
  issue: Record<string, unknown>,
  index: number,
): InboxSourceCapture {
  const prefix = `GitHub Issue list item ${String(index)}`;
  const number = positiveInteger(issue.number, `${prefix} number`);
  const title = singleLine(issue.title, `${prefix} title`);
  const body = githubIssueBody(issue.body, title, `${prefix} body`);
  const uri = githubIssueUri(issue.url, repository, number, `${prefix} URL`);
  const sourceUpdatedAt = isoTimestamp(
    issue.updatedAt,
    `${prefix} updated timestamp`,
  );
  const state = singleLine(issue.state, `${prefix} state`).toLowerCase();
  if (state !== 'open') {
    throw new Error(`${prefix} must be open.`);
  }
  const labels = Array.isArray(issue.labels)
    ? issue.labels.map((label, labelIndex) => {
        if (!label || typeof label !== 'object' || Array.isArray(label)) {
          throw new Error(
            `${prefix} label ${String(labelIndex + 1)} is invalid.`,
          );
        }
        return singleLine(
          (label as Record<string, unknown>).name,
          `${prefix} label ${String(labelIndex + 1)}`,
        );
      })
    : [];
  return {
    sourceKind: 'github_issue',
    externalKey: `github:${repository.toLowerCase()}#${String(number)}`,
    title,
    body,
    contentType: 'text/markdown',
    uri,
    providerMetadata: {
      repository: repository.toLowerCase(),
      number,
      state,
      labels,
    },
    sourceUpdatedAt,
  };
}

function githubIssueBody(value: unknown, title: string, label: string): string {
  if (value !== null && typeof value !== 'string') {
    throw new Error(`${label} is invalid.`);
  }
  const normalized = (value ?? '').replace(/\r\n?/g, '\n');
  return normalized.trim().length > 0 ? normalized : `# ${title}\n`;
}

function githubIssueUri(
  value: unknown,
  repository: string,
  number: number,
  label: string,
): string {
  const uri = absoluteHttpsUrl(value, label);
  const url = new URL(uri);
  const expectedPath = `/${repository}/issues/${String(number)}`.toLowerCase();
  if (
    url.hostname.toLowerCase() !== 'github.com' ||
    url.pathname.replace(/\/+$/, '').toLowerCase() !== expectedPath ||
    url.search ||
    url.hash
  ) {
    throw new Error('GitHub Issue identity changed during capture.');
  }
  return uri;
}

async function runGitHub(command: string, args: string[]): Promise<string> {
  const result = await execFileAsync(command, args, {
    encoding: 'utf8',
    env: localCommandEnvironment(),
    maxBuffer: MAX_GITHUB_OUTPUT_BYTES,
    timeout: GITHUB_LIST_TIMEOUT_MS,
    windowsHide: true,
  });
  return result.stdout;
}

async function workspaceGitHubRepository(
  repositoryRootInput: string,
): Promise<string> {
  const repositoryRoot = await canonicalGitRepository(repositoryRootInput);
  let remote: string;
  try {
    remote = (
      await runGit(repositoryRoot, ['remote', 'get-url', 'origin'])
    ).trim();
  } catch {
    throw new Error(
      'The bound Workspace repository must have an origin remote.',
    );
  }
  return githubRepositoryFromRemote(remote);
}

function githubRepositoryFromRemote(remote: string): string {
  const scpRemote = /^git@github\.com:(.+)$/i.exec(remote);
  let repositoryPath: string;

  if (scpRemote?.[1]) {
    repositoryPath = scpRemote[1];
  } else {
    let url: URL;
    try {
      url = new URL(remote);
    } catch {
      throw new Error(
        'The bound Workspace repository origin must point to github.com.',
      );
    }
    if (
      url.hostname.toLowerCase() !== 'github.com' ||
      !['git:', 'https:', 'ssh:'].includes(url.protocol) ||
      url.search ||
      url.hash
    ) {
      throw new Error(
        'The bound Workspace repository origin must point to github.com.',
      );
    }
    repositoryPath = url.pathname.replace(/^\/+/, '');
  }

  const [owner, rawName, ...extra] = repositoryPath
    .replace(/\/+$/, '')
    .split('/');
  const name = rawName?.replace(/\.git$/i, '');
  const repository = `${owner ?? ''}/${name ?? ''}`;
  if (extra.length > 0 || !GITHUB_REPOSITORY_PATTERN.test(repository)) {
    throw new Error(
      'The bound Workspace repository origin must point to github.com.',
    );
  }
  return repository;
}

function normalizeRepositoryRelativePath(value: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('Inbox Markdown relative path is required.');
  }
  const normalized = value.trim().replace(/\\/g, '/').replace(/^\.\//, '');
  if (
    isAbsolute(normalized) ||
    /^[a-zA-Z]:\//.test(normalized) ||
    normalized.split('/').some((segment) => segment === '..')
  ) {
    throw new Error('Inbox Markdown path must stay repository-relative.');
  }
  const extension = extname(normalized).toLowerCase();
  if (extension !== '.md' && extension !== '.markdown') {
    throw new Error('Inbox Markdown source must use .md or .markdown.');
  }
  return normalized;
}

function assertInside(root: string, target: string): void {
  const within = relative(root, target);
  if (within === '..' || within.startsWith(`..${sep}`) || isAbsolute(within)) {
    throw new Error('Inbox Markdown path escapes the bound repository.');
  }
}

function markdownTitle(body: string, relativePath: string): string {
  const heading = body
    .split('\n')
    .map((line) => /^#\s+(.+)$/.exec(line)?.[1]?.trim())
    .find(Boolean);
  return (
    heading ||
    relativePath
      .split('/')
      .at(-1)
      ?.replace(/\.markdown?$/i, '') ||
    'Inbox source'
  );
}

function sourceBody(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} is required.`);
  const normalized = value.replace(/\r\n?/g, '\n');
  if (normalized.trim().length === 0) {
    throw new Error(`${label} must not be empty.`);
  }
  return normalized;
}

function singleLine(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} is required.`);
  }
  const normalized = value.trim();
  if (/[\r\n]/.test(normalized)) {
    throw new Error(`${label} must be a single line.`);
  }
  return normalized;
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return Number(value);
}

function absoluteHttpsUrl(value: unknown, label: string): string {
  const raw = singleLine(value, label);
  const url = new URL(raw);
  if (url.protocol !== 'https:') throw new Error(`${label} must use HTTPS.`);
  return url.toString();
}

function isoTimestamp(value: unknown, label: string): string {
  const raw = singleLine(value, label);
  const timestamp = new Date(raw);
  if (Number.isNaN(timestamp.getTime())) {
    throw new Error(`${label} is invalid.`);
  }
  return timestamp.toISOString();
}

function jsonObjectArray(
  value: string,
  label: string,
): Array<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new Error(`${label} was not valid JSON.`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`${label} must be an array.`);
  }
  return parsed.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`${label} item ${String(index + 1)} must be an object.`);
    }
    return entry as Record<string, unknown>;
  });
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
