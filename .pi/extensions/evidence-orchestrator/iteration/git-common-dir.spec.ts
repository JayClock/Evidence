import { execFileSync } from 'node:child_process';
import { mkdirSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertPrimaryWorktree,
  gitCommonDir,
  primaryWorktreeRoot,
  repositoryRoot,
} from './git-common-dir';
import {
  cleanupWorkspaces,
  initializeGitRepository,
  workspace,
} from '../test-support/support';

afterEach(cleanupWorkspaces);

describe('Git repository identity', () => {
  it('resolves the primary worktree and shared common directory', () => {
    const cwd = workspace();
    initializeGitRepository(cwd);

    expect(repositoryRoot(cwd)).toBe(realpathSync(cwd));
    expect(primaryWorktreeRoot(cwd)).toBe(realpathSync(cwd));
    expect(assertPrimaryWorktree(cwd)).toBe(realpathSync(cwd));
    expect(gitCommonDir(cwd)).toBe(realpathSync(join(cwd, '.git')));
  });

  it('shares the common directory while rejecting control from a linked worktree', () => {
    const cwd = workspace();
    initializeGitRepository(cwd);
    const linked = join(cwd, '.worktrees', 'ITER-0002');
    mkdirSync(join(cwd, '.worktrees'), { recursive: true });
    execFileSync(
      'git',
      [
        'worktree',
        'add',
        '--quiet',
        '-b',
        'evidence/iter-0002',
        linked,
        'HEAD',
      ],
      { cwd },
    );

    expect(repositoryRoot(linked)).toBe(realpathSync(linked));
    expect(primaryWorktreeRoot(linked)).toBe(realpathSync(cwd));
    expect(gitCommonDir(linked)).toBe(gitCommonDir(cwd));
    expect(() => assertPrimaryWorktree(linked)).toThrow(
      'Board control commands require the primary worktree',
    );
  });
});
