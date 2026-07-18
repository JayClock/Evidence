import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_STATE } from '../../iteration/default-state';
import { mutateBoard, readBoard } from '../../iteration/board-repository';
import type { BoardItem, FlowLane } from '../../iteration/board-state';
import type { PairSession, WorkflowState } from '../../iteration/state';
import {
  cleanupWorkspaces,
  initializeGitRepository,
  TEST_FLOW_POLICY,
  workspace,
} from '../../test-support/support';
import {
  assertCanProvision,
  pullPendingLane,
  reconcileBoardItem,
  validateFlowBoard,
} from './admission';
import { projectFlow } from './projection';

afterEach(cleanupWorkspaces);

function item(cwd: string, number: number, lane: FlowLane): BoardItem {
  const suffix = String(number).padStart(4, '0');
  return {
    iteration_id: `ITER-${suffix}`,
    candidate_id: `CAND-${suffix}`,
    lifecycle: 'active',
    branch_name: `evidence/iter-${suffix}`,
    worktree_path: join(cwd, '.worktrees', 'evidence', `ITER-${suffix}`),
    base_sha: 'a'.repeat(40),
    admitted_lane: lane,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

function seed(cwd: string, items: BoardItem[]): void {
  mutateBoard(cwd, (draft) => {
    draft.items = items;
    draft.next_iteration_number =
      Math.max(
        0,
        ...items.map(({ iteration_id }) =>
          Number(iteration_id.slice('ITER-'.length)),
        ),
      ) + 1;
  });
}

function state(
  iterationId: string,
  loop: WorkflowState['loop'],
): WorkflowState {
  return { ...DEFAULT_STATE, iteration_id: iterationId, loop };
}

function pairState(
  iterationId: string,
  checkpoint: PairSession['checkpoint'],
): WorkflowState {
  return {
    ...state(iterationId, 'pair'),
    pair_session: { checkpoint } as PairSession,
  };
}

describe('Story flow admission', () => {
  it('projects workflow checkpoints into flow lanes and conditions', () => {
    expect(projectFlow(state('ITER-0001', 'understand'), {})).toMatchObject({
      desired_lane: 'discovery',
      condition: 'runnable',
    });
    expect(
      projectFlow(pairState('ITER-0001', 'plan_confirmed'), {}),
    ).toMatchObject({
      desired_lane: 'ready',
    });
    expect(
      projectFlow(pairState('ITER-0001', 'quality_gates_passed'), {}),
    ).toMatchObject({
      desired_lane: 'review',
      condition: 'waiting_human',
    });
    expect(
      projectFlow(state('ITER-0001', 'tasking'), {
        pending_lane: 'planning',
      }),
    ).toMatchObject({ condition: 'queued' });
  });

  it('queues a forward transition and admits it only after explicit Pull', () => {
    const cwd = workspace();
    initializeGitRepository(cwd);
    seed(cwd, [
      item(cwd, 1, 'planning'),
      item(cwd, 2, 'planning'),
      item(cwd, 3, 'discovery'),
    ]);
    const thirdState = state('ITER-0003', 'tasking');

    expect(reconcileBoardItem(cwd, 'ITER-0003', thirdState)).toMatchObject({
      kind: 'queued',
      admitted_lane: 'discovery',
      pending_lane: 'planning',
    });
    expect(() => pullPendingLane(cwd, 'ITER-0003', thirdState)).toThrow(
      'planning WIP is full',
    );

    mutateBoard(cwd, (draft) => {
      const first = draft.items[0];
      first.lifecycle = 'terminal';
      first.admitted_lane = 'done';
      first.terminal_at = '2026-01-01T00:01:00.000Z';
      first.updated_at = first.terminal_at;
    });
    expect(pullPendingLane(cwd, 'ITER-0003', thirdState)).toMatchObject({
      kind: 'admitted',
      admitted_lane: 'planning',
    });
    expect(readBoard(cwd).items[2]).not.toHaveProperty('pending_lane');
  });

  it('admits backward rework even when the target lane is full', () => {
    const cwd = workspace();
    initializeGitRepository(cwd);
    seed(cwd, [
      item(cwd, 1, 'planning'),
      item(cwd, 2, 'planning'),
      item(cwd, 3, 'review'),
    ]);

    expect(
      reconcileBoardItem(cwd, 'ITER-0003', state('ITER-0003', 'tasking')),
    ).toMatchObject({
      kind: 'rework_overflow',
      admitted_lane: 'planning',
    });
    expect(
      readBoard(cwd).items.filter(
        ({ admitted_lane }) => admitted_lane === 'planning',
      ),
    ).toHaveLength(3);
  });

  it('releases terminal work and enforces total and Discovery WIP', () => {
    const cwd = workspace();
    initializeGitRepository(cwd);
    const first = item(cwd, 1, 'discovery');
    const second = item(cwd, 2, 'discovery');
    const third = item(cwd, 3, 'planning');
    seed(cwd, [first, second, third]);

    expect(() => assertCanProvision(readBoard(cwd), TEST_FLOW_POLICY)).toThrow(
      'Story WIP is full',
    );
    expect(
      reconcileBoardItem(cwd, 'ITER-0001', {
        ...state('ITER-0001', 'complete'),
      }),
    ).toMatchObject({ kind: 'terminal', admitted_lane: 'done' });
    expect(() => validateFlowBoard(cwd)).not.toThrow();

    mutateBoard(cwd, (draft) => {
      draft.items[2].admitted_lane = 'discovery';
    });
    expect(() => assertCanProvision(readBoard(cwd), TEST_FLOW_POLICY)).toThrow(
      'Discovery WIP is full',
    );
  });
});
