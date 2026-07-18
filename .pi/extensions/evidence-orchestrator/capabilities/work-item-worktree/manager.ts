import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, realpathSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { assertPrimaryWorktree } from '../../iteration/git-common-dir';

const ITERATION_ID = /^ITER-\d{4,}$/;

export interface StoryWorktree {
  iterationId: string;
  branchName: string;
  path: string;
  baseSha: string;
}

function git(cwd: string, args: string[]): string {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    const stderr = (error as { stderr?: unknown }).stderr;
    const detail = typeof stderr === 'string' ? stderr.trim() : '';
    throw new Error(
      `Git worktree operation failed${detail ? `: ${detail}` : '.'}`,
    );
  }
}

function normalizeIterationId(iterationId: string): string {
  const normalized = iterationId.trim().toUpperCase();
  if (!ITERATION_ID.test(normalized)) {
    throw new Error(`Invalid worktree Iteration id: ${iterationId}.`);
  }
  return normalized;
}

export function storyBranchName(iterationId: string): string {
  const normalized = normalizeIterationId(iterationId);
  return `evidence/iter-${normalized.slice('ITER-'.length).toLowerCase()}`;
}

export function storyWorktreeRoot(primaryRoot: string): string {
  return join(assertPrimaryWorktree(primaryRoot), '.worktrees', 'evidence');
}

export function storyWorktreePath(
  primaryRoot: string,
  iterationId: string,
): string {
  const normalized = normalizeIterationId(iterationId);
  return join(storyWorktreeRoot(primaryRoot), normalized);
}

function assertExpectedWorktreePath(primaryRoot: string, path: string): void {
  const root = resolve(storyWorktreeRoot(primaryRoot));
  const candidate = resolve(path);
  const fromRoot = relative(root, candidate);
  if (
    fromRoot === '' ||
    fromRoot === '..' ||
    fromRoot.startsWith(`..${sep}`) ||
    fromRoot.includes(sep)
  ) {
    throw new Error(
      `Story worktree path is outside its ITER directory: ${path}.`,
    );
  }
}

export function currentHead(cwd: string): string {
  return git(cwd, ['rev-parse', '--verify', 'HEAD']);
}

export function currentBranch(cwd: string): string {
  return git(cwd, ['branch', '--show-current']);
}

export function createStoryWorktree(
  primaryRoot: string,
  iterationId: string,
  baseSha = currentHead(primaryRoot),
): StoryWorktree {
  const primary = assertPrimaryWorktree(primaryRoot);
  const normalized = normalizeIterationId(iterationId);
  const branchName = storyBranchName(normalized);
  const path = storyWorktreePath(primary, normalized);
  assertExpectedWorktreePath(primary, path);
  if (existsSync(path)) {
    throw new Error(`Story worktree path already exists: ${path}.`);
  }
  git(primary, ['cat-file', '-e', `${baseSha}^{commit}`]);
  mkdirSync(dirname(path), { recursive: true });
  git(primary, ['worktree', 'add', '--quiet', '-b', branchName, path, baseSha]);
  const canonical = realpathSync(path);
  if (currentHead(canonical) !== baseSha) {
    throw new Error(
      `Story worktree baseline drifted during creation: ${normalized}.`,
    );
  }
  return {
    iterationId: normalized,
    branchName,
    path: canonical,
    baseSha,
  };
}

export function worktreeIsClean(path: string): boolean {
  return (
    git(path, ['status', '--porcelain=v1', '--untracked-files=all']) === ''
  );
}

export function removeStoryWorktree(primaryRoot: string, path: string): void {
  const primary = assertPrimaryWorktree(primaryRoot);
  assertExpectedWorktreePath(primary, path);
  if (!existsSync(path)) {
    throw new Error(`Story worktree does not exist: ${path}.`);
  }
  if (!worktreeIsClean(path)) {
    throw new Error(`Story worktree is dirty and cannot be archived: ${path}.`);
  }
  git(primary, ['worktree', 'remove', path]);
}
