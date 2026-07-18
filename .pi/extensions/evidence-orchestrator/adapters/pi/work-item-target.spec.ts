import { afterEach, describe, expect, it } from 'vitest';
import { provisionWorkItem } from '../../capabilities/work-item-worktree/provisioner';
import { workflowStateSha256 } from '../../capabilities/flow-control/admission';
import { DEFAULT_STATE } from '../../iteration/default-state';
import { mutateBoard } from '../../iteration/board-repository';
import { writeState } from '../../iteration/state-repository';
import {
  cleanupWorkspaces,
  initializeGitRepository,
  workspace,
} from '../../test-support/support';
import {
  parseIterationCommand,
  requireWorkItemTarget,
} from './work-item-target';

afterEach(cleanupWorkspaces);

function provision(cwd: string) {
  return provisionWorkItem(
    cwd,
    'CAND-0001',
    ({ iterationId, worktreeRoot }) => {
      writeState(worktreeRoot, { ...DEFAULT_STATE, iteration_id: iterationId });
    },
  );
}

describe('exact Story target', () => {
  it('parses the required Iteration id and preserves remaining command text', () => {
    expect(
      parseIterationCommand('iter-0012 approve because it is ready'),
    ).toEqual({
      iterationId: 'ITER-0012',
      rest: 'approve because it is ready',
    });
    expect(() => parseIterationCommand('approve')).toThrow(
      'requires ITER-xxxx',
    );
  });

  it('resolves one Board item to its canonical worktree-local State', () => {
    const cwd = workspace();
    initializeGitRepository(cwd);
    const provisioned = provision(cwd);

    expect(requireWorkItemTarget(cwd, 'ITER-0001')).toMatchObject({
      worktreeRoot: provisioned.worktree.path,
      state: { iteration_id: 'ITER-0001' },
      item: { candidate_id: 'CAND-0001' },
    });
  });

  it('blocks queued, terminal, and mismatched Story targets', () => {
    const cwd = workspace();
    initializeGitRepository(cwd);
    const provisioned = provision(cwd);
    const state = { ...DEFAULT_STATE, iteration_id: 'ITER-0001' };
    mutateBoard(cwd, (draft) => {
      const item = draft.items[0];
      item.pending_lane = 'planning';
      item.pending_lane_requested_at = '2026-01-01T00:00:00.000Z';
      item.pending_state_sha256 = workflowStateSha256(state);
    });

    expect(() => requireWorkItemTarget(cwd, 'ITER-0001')).toThrow(
      'queued for planning',
    );
    expect(
      requireWorkItemTarget(cwd, 'ITER-0001', { allowPending: true }).state
        .iteration_id,
    ).toBe('ITER-0001');

    writeState(provisioned.worktree.path, {
      ...DEFAULT_STATE,
      iteration_id: 'ITER-9999',
    });
    expect(() =>
      requireWorkItemTarget(cwd, 'ITER-0001', { allowPending: true }),
    ).toThrow('Board/State Iteration mismatch');
  });
});
