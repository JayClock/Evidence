import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createStoryWorktree,
  removeStoryWorktree,
  storyBranchName,
  storyWorktreePath,
  worktreeIsClean,
} from './manager';
import {
  cleanupWorkspaces,
  initializeGitRepository,
  workspace,
} from '../../test-support/support';

afterEach(cleanupWorkspaces);

describe('Story worktree manager', () => {
  it('creates isolated worktrees on deterministic branches', () => {
    const cwd = workspace();
    initializeGitRepository(cwd);

    const first = createStoryWorktree(cwd, 'ITER-0001');
    const second = createStoryWorktree(cwd, 'ITER-0002');

    expect(first.path).toBe(storyWorktreePath(cwd, 'ITER-0001'));
    expect(first.branchName).toBe(storyBranchName('ITER-0001'));
    expect(second.branchName).toBe('evidence/iter-0002');
    expect(first.baseSha).toBe(second.baseSha);

    writeFileSync(join(first.path, 'only-first.txt'), 'first\n');
    expect(existsSync(join(second.path, 'only-first.txt'))).toBe(false);
    expect(worktreeIsClean(first.path)).toBe(false);
    expect(worktreeIsClean(second.path)).toBe(true);
  });

  it('rejects an invalid id and an existing worktree path', () => {
    const cwd = workspace();
    initializeGitRepository(cwd);

    expect(() => createStoryWorktree(cwd, 'iteration-1')).toThrow(
      'Invalid worktree Iteration id',
    );
    createStoryWorktree(cwd, 'ITER-0001');
    expect(() => createStoryWorktree(cwd, 'ITER-0001')).toThrow(
      'already exists',
    );
  });

  it('removes only a clean worktree and preserves its branch', () => {
    const cwd = workspace();
    initializeGitRepository(cwd);
    const worktree = createStoryWorktree(cwd, 'ITER-0001');

    removeStoryWorktree(cwd, worktree.path);

    expect(existsSync(worktree.path)).toBe(false);
    expect(
      execFileSync('git', ['branch', '--list', worktree.branchName], {
        cwd,
        encoding: 'utf8',
      }).trim(),
    ).toContain(worktree.branchName);
  });

  it('refuses to remove a dirty worktree', () => {
    const cwd = workspace();
    initializeGitRepository(cwd);
    const worktree = createStoryWorktree(cwd, 'ITER-0001');
    writeFileSync(join(worktree.path, 'dirty.txt'), 'dirty\n');

    expect(() => removeStoryWorktree(cwd, worktree.path)).toThrow(
      'dirty and cannot be archived',
    );
    expect(existsSync(worktree.path)).toBe(true);
  });
});
