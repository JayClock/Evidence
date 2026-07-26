import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { canonicalGitRepository } from './git-repository';
import { localCommandEnvironment } from './local-command-environment';

const execFileAsync = promisify(execFile);
const MAX_MARKDOWN_BYTES = 1024 * 1024;
const GITHUB_REPOSITORY_PATTERN = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;

export interface InboxSourceCapture {
  sourceKind: 'manual_text' | 'local_markdown' | 'github_issue';
  externalKey: string;
  title: string;
  body: string;
  contentType: 'text/plain' | 'text/markdown';
  uri: string | null;
  providerMetadata: Record<
    string,
    null | boolean | number | string | Array<string>
  >;
  sourceUpdatedAt: string | null;
}

export interface GitHubIssueCaptureInput {
  repository: string;
  issueNumber: number;
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

export async function captureGitHubIssue(
  input: GitHubIssueCaptureInput,
  runner: GitHubCommandRunner = runGitHub,
): Promise<InboxSourceCapture> {
  const repository = input.repository.trim();
  if (!GITHUB_REPOSITORY_PATTERN.test(repository)) {
    throw new Error('GitHub repository must use owner/name.');
  }
  if (!Number.isSafeInteger(input.issueNumber) || input.issueNumber <= 0) {
    throw new Error('GitHub issue number must be a positive integer.');
  }
  const output = await runner('gh', [
    'issue',
    'view',
    String(input.issueNumber),
    '--repo',
    repository,
    '--json',
    'number,title,body,url,updatedAt,state,labels',
  ]);
  const issue = jsonObject(output, 'GitHub Issue response');
  const number = positiveInteger(issue.number, 'GitHub Issue number');
  if (number !== input.issueNumber) {
    throw new Error('GitHub Issue identity changed during capture.');
  }
  const title = singleLine(issue.title, 'GitHub Issue title');
  const body = sourceBody(issue.body, 'GitHub Issue body');
  const uri = absoluteHttpsUrl(issue.url, 'GitHub Issue URL');
  const sourceUpdatedAt = isoTimestamp(
    issue.updatedAt,
    'GitHub Issue updated timestamp',
  );
  const state = singleLine(issue.state, 'GitHub Issue state').toLowerCase();
  const labels = Array.isArray(issue.labels)
    ? issue.labels.map((label, index) => {
        if (!label || typeof label !== 'object' || Array.isArray(label)) {
          throw new Error(
            `GitHub Issue label ${String(index + 1)} is invalid.`,
          );
        }
        return singleLine(
          (label as Record<string, unknown>).name,
          `GitHub Issue label ${String(index + 1)}`,
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

async function runGitHub(command: string, args: string[]): Promise<string> {
  const result = await execFileAsync(command, args, {
    encoding: 'utf8',
    env: localCommandEnvironment(),
    maxBuffer: 2 * 1024 * 1024,
    timeout: 30_000,
    windowsHide: true,
  });
  return result.stdout;
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

function jsonObject(value: string, label: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new Error(`${label} was not valid JSON.`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} must be an object.`);
  }
  return parsed as Record<string, unknown>;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
