import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

function git(cwd: string, args: string[]): string {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    throw new Error(`Evidence Orchestrator requires a Git repository: ${cwd}.`);
  }
}

export function gitCommonDir(cwd: string): string {
  const path = git(cwd, ['rev-parse', '--git-common-dir']);
  return realpathSync(isAbsolute(path) ? path : resolve(cwd, path));
}

export function primaryWorktreeRoot(cwd: string): string {
  const output = git(cwd, ['worktree', 'list', '--porcelain']);
  const first = output
    .split('\n')
    .find((line) => line.startsWith('worktree '))
    ?.slice('worktree '.length);
  if (!first) {
    throw new Error('Git did not report a primary worktree.');
  }
  return realpathSync(first);
}

export function repositoryRoot(cwd: string): string {
  return realpathSync(git(cwd, ['rev-parse', '--show-toplevel']));
}

export function assertPrimaryWorktree(cwd: string): string {
  const current = repositoryRoot(cwd);
  const primary = primaryWorktreeRoot(cwd);
  if (current !== primary) {
    throw new Error(
      `Board control commands require the primary worktree ${primary}, not ${current}.`,
    );
  }
  return primary;
}
