import { createHash } from 'node:crypto';
import { appendBoardEvent } from '../../iteration/board-events';
import { mutateBoard, readBoard } from '../../iteration/board-repository';
import type {
  BoardItem,
  BoardState,
  FlowLane,
} from '../../iteration/board-state';
import type { WorkflowState } from '../../iteration/state';
import type {
  ActiveFlowLane,
  AdmissionKind,
  AdmissionOutcome,
  FlowPolicy,
} from './model';
import { readFlowPolicy } from './policy';
import { desiredFlowLane, laneMovesBackward } from './projection';

function active(item: BoardItem): boolean {
  return ['provisioning', 'active'].includes(item.lifecycle);
}

function laneLimit(policy: FlowPolicy, lane: FlowLane): number {
  return lane === 'done'
    ? Number.POSITIVE_INFINITY
    : policy.lanes[lane as ActiveFlowLane];
}

function laneCount(
  board: BoardState,
  lane: FlowLane,
  excludingIterationId?: string,
): number {
  return board.items.filter(
    (item) =>
      active(item) &&
      item.iteration_id !== excludingIterationId &&
      item.admitted_lane === lane,
  ).length;
}

function hasLaneCapacity(
  board: BoardState,
  policy: FlowPolicy,
  lane: FlowLane,
  excludingIterationId?: string,
): boolean {
  return laneCount(board, lane, excludingIterationId) < laneLimit(policy, lane);
}

export function workflowStateSha256(state: WorkflowState): string {
  return `sha256:${createHash('sha256')
    .update(JSON.stringify(state))
    .digest('hex')}`;
}

export function assertCanProvision(
  board: BoardState,
  policy: FlowPolicy,
): void {
  const activeCount = board.items.filter(active).length;
  if (activeCount >= policy.max_active_stories) {
    throw new Error(
      `Story WIP is full: active=${activeCount}/${policy.max_active_stories}.`,
    );
  }
  const discovery = laneCount(board, 'discovery');
  if (discovery >= policy.lanes.discovery) {
    throw new Error(
      `Discovery WIP is full: ${discovery}/${policy.lanes.discovery}.`,
    );
  }
}

function clearPending(item: BoardItem): void {
  delete item.pending_lane;
  delete item.pending_lane_requested_at;
  delete item.pending_state_sha256;
}

function outcome(
  item: BoardItem,
  kind: AdmissionKind,
  policySha256: string,
): AdmissionOutcome {
  return {
    iteration_id: item.iteration_id,
    kind,
    admitted_lane: item.admitted_lane,
    ...(item.pending_lane ? { pending_lane: item.pending_lane } : {}),
    policy_sha256: policySha256,
  };
}

function recordAdmission(
  primaryRoot: string,
  result: AdmissionOutcome,
  fromLane: FlowLane | undefined,
  recordedAt: string,
  explicitPull = false,
): void {
  if (result.kind === 'unchanged') return;
  appendBoardEvent(primaryRoot, {
    type: explicitPull
      ? 'pull'
      : result.kind === 'rework_overflow'
        ? 'rework_overflow'
        : 'admission',
    iteration_id: result.iteration_id,
    recorded_at: recordedAt,
    ...(fromLane ? { from_lane: fromLane } : {}),
    to_lane: result.pending_lane ?? result.admitted_lane,
    outcome: result.kind,
    policy_sha256: result.policy_sha256,
  });
}

function admittedLaneBefore(
  primaryRoot: string,
  iterationId: string,
): FlowLane | undefined {
  return readBoard(primaryRoot).items.find(
    ({ iteration_id }) => iteration_id === iterationId,
  )?.admitted_lane;
}

/** Reconcile one persisted Story state with its repository-level admitted lane. */
export function reconcileBoardItem(
  primaryRoot: string,
  iterationId: string,
  state: WorkflowState,
  now = new Date().toISOString(),
): AdmissionOutcome {
  if (state.iteration_id !== iterationId) {
    throw new Error(
      `Board/State Iteration mismatch: ${iterationId}/${state.iteration_id}.`,
    );
  }
  const snapshot = readFlowPolicy(primaryRoot);
  const fromLane = admittedLaneBefore(primaryRoot, iterationId);
  const result = mutateBoard(primaryRoot, (draft) => {
    const item = draft.items.find(
      ({ iteration_id }) => iteration_id === iterationId,
    );
    if (!item) throw new Error(`Board item does not exist: ${iterationId}.`);
    const desired = desiredFlowLane(state);
    item.updated_at = now;

    if (desired === 'done') {
      item.lifecycle = 'terminal';
      item.admitted_lane = 'done';
      item.terminal_at = now;
      clearPending(item);
      return outcome(item, 'terminal', snapshot.sha256);
    }
    if (item.lifecycle !== 'active') {
      throw new Error(
        `Only an active Board item can reconcile flow: ${iterationId}/${item.lifecycle}.`,
      );
    }
    if (desired === item.admitted_lane) {
      clearPending(item);
      return outcome(item, 'unchanged', snapshot.sha256);
    }
    if (laneMovesBackward(item.admitted_lane, desired)) {
      const overflow = !hasLaneCapacity(
        draft,
        snapshot.policy,
        desired,
        iterationId,
      );
      item.admitted_lane = desired;
      clearPending(item);
      return outcome(
        item,
        overflow ? 'rework_overflow' : 'admitted',
        snapshot.sha256,
      );
    }
    if (hasLaneCapacity(draft, snapshot.policy, desired, iterationId)) {
      item.admitted_lane = desired;
      clearPending(item);
      return outcome(item, 'admitted', snapshot.sha256);
    }
    item.pending_lane = desired;
    item.pending_lane_requested_at = now;
    item.pending_state_sha256 = workflowStateSha256(state);
    return outcome(item, 'queued', snapshot.sha256);
  }).value;
  recordAdmission(primaryRoot, result, fromLane, now);
  return result;
}

export function requestDeliveryAdmission(
  primaryRoot: string,
  iterationId: string,
  state: WorkflowState,
  now = new Date().toISOString(),
): AdmissionOutcome {
  if (
    state.iteration_id !== iterationId ||
    state.loop !== 'pair' ||
    state.pair_session?.checkpoint !== 'plan_confirmed'
  ) {
    throw new Error(
      `Delivery admission requires Pair/plan_confirmed: ${iterationId}.`,
    );
  }
  const snapshot = readFlowPolicy(primaryRoot);
  const fromLane = admittedLaneBefore(primaryRoot, iterationId);
  const result = mutateBoard(primaryRoot, (draft) => {
    const item = draft.items.find(
      ({ iteration_id }) => iteration_id === iterationId,
    );
    if (!item || item.lifecycle !== 'active') {
      throw new Error(`Active Board item does not exist: ${iterationId}.`);
    }
    if (item.pending_lane) {
      throw new Error(`${iterationId} already awaits ${item.pending_lane}.`);
    }
    if (item.admitted_lane === 'delivery') {
      return outcome(item, 'unchanged', snapshot.sha256);
    }
    if (item.admitted_lane !== 'ready') {
      throw new Error(
        `${iterationId} must be admitted to ready before Delivery.`,
      );
    }
    item.updated_at = now;
    if (hasLaneCapacity(draft, snapshot.policy, 'delivery', iterationId)) {
      item.admitted_lane = 'delivery';
      return outcome(item, 'admitted', snapshot.sha256);
    }
    item.pending_lane = 'delivery';
    item.pending_lane_requested_at = now;
    item.pending_state_sha256 = workflowStateSha256(state);
    return outcome(item, 'queued', snapshot.sha256);
  }).value;
  recordAdmission(primaryRoot, result, fromLane, now);
  return result;
}

export function pullPendingLane(
  primaryRoot: string,
  iterationId: string,
  state: WorkflowState,
  now = new Date().toISOString(),
): AdmissionOutcome {
  const snapshot = readFlowPolicy(primaryRoot);
  const fromLane = admittedLaneBefore(primaryRoot, iterationId);
  const result = mutateBoard(primaryRoot, (draft) => {
    const item = draft.items.find(
      ({ iteration_id }) => iteration_id === iterationId,
    );
    if (!item) throw new Error(`Board item does not exist: ${iterationId}.`);
    if (item.lifecycle !== 'active' || !item.pending_lane) {
      throw new Error(`Board item is not queued for a lane: ${iterationId}.`);
    }
    if (item.pending_state_sha256 !== workflowStateSha256(state)) {
      throw new Error(
        `Queued Story state drifted before Pull: ${iterationId}.`,
      );
    }
    if (
      !hasLaneCapacity(draft, snapshot.policy, item.pending_lane, iterationId)
    ) {
      throw new Error(
        `${item.pending_lane} WIP is full; ${iterationId} remains queued.`,
      );
    }
    item.admitted_lane = item.pending_lane;
    item.updated_at = now;
    clearPending(item);
    return outcome(item, 'admitted', snapshot.sha256);
  }).value;
  recordAdmission(primaryRoot, result, fromLane, now, true);
  return result;
}

export function validateFlowBoard(primaryRoot: string): void {
  const board = readBoard(primaryRoot);
  const { policy } = readFlowPolicy(primaryRoot);
  const activeCount = board.items.filter(active).length;
  if (activeCount > policy.max_active_stories) {
    throw new Error(
      `Board exceeds active Story WIP: ${activeCount}/${policy.max_active_stories}.`,
    );
  }
}
