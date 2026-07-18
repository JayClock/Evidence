import { existsSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { workflowStateSha256 } from '../../capabilities/flow-control/admission';
import {
  acquireActivityLease,
  activityLeasePath,
} from '../../capabilities/flow-control/lease';
import { provisionWorkItem } from '../../capabilities/work-item-worktree/provisioner';
import { DEFAULT_STATE } from '../../iteration/default-state';
import { mutateBoard, readBoard } from '../../iteration/board-repository';
import { readState, writeState } from '../../iteration/state-repository';
import {
  cleanupWorkspaces,
  initializeGitRepository,
  workspace,
} from '../../test-support/support';
import { registerFlowCommands } from './flow-commands';

function context(cwd: string) {
  return {
    cwd,
    ui: { notify: vi.fn() },
  };
}

function flowHandler(cwd: string) {
  let handler:
    | ((args: string, ctx: ReturnType<typeof context>) => Promise<void>)
    | undefined;
  registerFlowCommands({
    registerCommand(_name: string, options: { handler: typeof handler }) {
      handler = options.handler;
    },
  } as never);
  if (!handler) throw new Error('Flow command was not registered.');
  return { handler, ctx: context(cwd) };
}

function provision(cwd: string, candidateId = 'CAND-0001') {
  return provisionWorkItem(
    cwd,
    candidateId,
    ({ iterationId, worktreeRoot }) => {
      writeState(worktreeRoot, { ...DEFAULT_STATE, iteration_id: iterationId });
    },
  );
}

afterEach(cleanupWorkspaces);

describe('Story Flow commands', () => {
  it('lists multiple isolated Story Work Items', async () => {
    const cwd = workspace();
    initializeGitRepository(cwd);
    provision(cwd, 'CAND-0001');
    provision(cwd, 'CAND-0002');
    const { handler, ctx } = flowHandler(cwd);

    await handler('list', ctx);

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining('ITER-0001 · discovery'),
      'info',
    );
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining('ITER-0002 · discovery'),
      'info',
    );
  });

  it('explicitly pulls one queued item without selecting another Story', async () => {
    const cwd = workspace();
    initializeGitRepository(cwd);
    const provisioned = provision(cwd);
    const taskingState = {
      ...DEFAULT_STATE,
      iteration_id: 'ITER-0001',
      loop: 'tasking' as const,
      tasking_stage: 'drafting' as const,
    };
    writeState(provisioned.worktree.path, taskingState);
    mutateBoard(cwd, (draft) => {
      const item = draft.items[0];
      item.pending_lane = 'planning';
      item.pending_lane_requested_at = '2026-01-01T00:00:00.000Z';
      item.pending_state_sha256 = workflowStateSha256(taskingState);
    });
    const { handler, ctx } = flowHandler(cwd);

    await handler('pull ITER-0001', ctx);

    expect(readBoard(cwd).items[0]).toMatchObject({
      admitted_lane: 'planning',
    });
    expect(readBoard(cwd).items[0]).not.toHaveProperty('pending_lane');
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      'ITER-0001 admitted to planning.',
      'info',
    );
  });

  it('archives only clean terminal worktrees and preserves the branch', async () => {
    const cwd = workspace();
    initializeGitRepository(cwd);
    const provisioned = provision(cwd);
    writeState(provisioned.worktree.path, {
      ...DEFAULT_STATE,
      iteration_id: 'ITER-0001',
      loop: 'complete',
    });
    const { handler, ctx } = flowHandler(cwd);

    await handler('archive ITER-0001 Evidence was preserved.', ctx);

    expect(existsSync(provisioned.worktree.path)).toBe(false);
    expect(readBoard(cwd).items[0].lifecycle).toBe('archived');
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      'ITER-0001 worktree archived.',
      'info',
    );
  });

  it('recovers only an expired activity lease with an explicit reason', async () => {
    const cwd = workspace();
    initializeGitRepository(cwd);
    const provisioned = provision(cwd);
    acquireActivityLease(
      cwd,
      provisioned.worktree.path,
      readState(provisioned.worktree.path),
      'activity',
      {
        now: () => new Date('2000-01-01T00:00:00.000Z'),
        leaseId: () => '00000000-0000-4000-8000-000000000001',
      },
    );
    const { handler, ctx } = flowHandler(cwd);

    await handler('recover ITER-0001 The child process crashed.', ctx);

    expect(existsSync(activityLeasePath(cwd, 'ITER-0001'))).toBe(false);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      'ITER-0001 expired activity lease recovered.',
      'info',
    );
  });

  it('requires an explicit reason when recovering failed provisioning', async () => {
    const cwd = workspace();
    initializeGitRepository(cwd);
    expect(() =>
      provisionWorkItem(cwd, 'CAND-0001', () => {
        throw new Error('freeze failed');
      }),
    ).toThrow();
    const { handler, ctx } = flowHandler(cwd);

    await handler('recover ITER-0001', ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      '/evidence-flow recover requires a reason.',
      'error',
    );

    await handler(
      'recover ITER-0001 Human abandoned failed provisioning.',
      ctx,
    );
    expect(readBoard(cwd).items[0].lifecycle).toBe('archived');
  });
});
