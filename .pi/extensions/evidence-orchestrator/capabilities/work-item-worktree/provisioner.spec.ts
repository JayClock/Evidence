import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  provisionWorkItem,
  validateBoardWorktrees,
  WorkItemProvisioningError,
} from './provisioner';
import { readBoard } from '../../iteration/board-repository';
import {
  cleanupWorkspaces,
  initializeGitRepository,
  workspace,
} from '../../test-support/support';

afterEach(cleanupWorkspaces);

describe('Story worktree provisioning', () => {
  it('claims distinct Candidates and activates isolated Board items', () => {
    const cwd = workspace();
    initializeGitRepository(cwd);

    const first = provisionWorkItem(cwd, 'CAND-0001', ({ worktreeRoot }) => {
      writeFileSync(join(worktreeRoot, 'intake-one.txt'), 'one\n');
    });
    const second = provisionWorkItem(cwd, 'CAND-0002');

    expect(first.item).toMatchObject({
      iteration_id: 'ITER-0001',
      candidate_id: 'CAND-0001',
      lifecycle: 'active',
      admitted_lane: 'discovery',
    });
    expect(second.item.iteration_id).toBe('ITER-0002');
    expect(first.item.worktree_path).not.toBe(second.item.worktree_path);
    expect(existsSync(join(first.worktree.path, 'intake-one.txt'))).toBe(true);
    expect(existsSync(join(second.worktree.path, 'intake-one.txt'))).toBe(
      false,
    );
    expect(() => validateBoardWorktrees(cwd)).not.toThrow();
  });

  it('keeps a failed reservation and does not reuse its Iteration id', () => {
    const cwd = workspace();
    initializeGitRepository(cwd);

    expect(() =>
      provisionWorkItem(cwd, 'CAND-0001', () => {
        throw new Error('cannot freeze Intake');
      }),
    ).toThrow(WorkItemProvisioningError);

    const failed = readBoard(cwd).items[0];
    expect(failed).toMatchObject({
      iteration_id: 'ITER-0001',
      candidate_id: 'CAND-0001',
      lifecycle: 'provisioning_failed',
    });
    expect(existsSync(failed.worktree_path)).toBe(true);

    const next = provisionWorkItem(cwd, 'CAND-0002');
    expect(next.item.iteration_id).toBe('ITER-0002');
  });

  it('rejects a Candidate already claimed by a failed or active item', () => {
    const cwd = workspace();
    initializeGitRepository(cwd);
    provisionWorkItem(cwd, 'CAND-0001');
    const before = readBoard(cwd);

    expect(() => provisionWorkItem(cwd, 'CAND-0001')).toThrow(
      'Candidate claims must be unique',
    );
    expect(readBoard(cwd)).toEqual(before);
  });
});
