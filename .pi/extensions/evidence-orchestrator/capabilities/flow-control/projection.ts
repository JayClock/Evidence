import type { BoardItem, FlowLane } from '../../iteration/board-state';
import type { WorkflowState } from '../../iteration/state';
import type { FlowCondition, FlowProjection } from './model';

export const FLOW_LANE_ORDER: FlowLane[] = [
  'discovery',
  'planning',
  'ready',
  'delivery',
  'review',
  'done',
];

export function desiredFlowLane(state: WorkflowState): FlowLane {
  if (state.halted || state.loop === 'complete') return 'done';
  if (state.loop === 'kickoff' || state.loop === 'understand') {
    return 'discovery';
  }
  if (state.loop === 'tasking') return 'planning';
  if (state.loop === 'pair') {
    if (state.pair_session?.checkpoint === 'plan_confirmed') return 'ready';
    if (state.pair_session?.checkpoint === 'quality_gates_passed') {
      return 'review';
    }
    return 'delivery';
  }
  return 'review';
}

function stateBlocker(state: WorkflowState): string | undefined {
  const exception = state.pair_session?.automation_exception;
  return (
    (exception ? `${exception.kind}: ${exception.reason}` : undefined) ??
    state.tasking_gap?.reason
  );
}

function waitingForHuman(state: WorkflowState): boolean {
  if (state.pending_clarification) return true;
  if (state.loop === 'kickoff') return Boolean(state.kickoff_candidate);
  if (state.loop === 'understand') {
    return (
      state.understand_stage === 'scenario_review' ||
      state.modeling_stage === 'profile_review' ||
      state.modeling_stage === 'model_review'
    );
  }
  if (state.loop === 'tasking') return state.tasking_stage === 'desk_check';
  if (state.loop === 'pair') {
    return state.pair_session?.checkpoint === 'quality_gates_passed';
  }
  if (state.loop === 'showcase') {
    return ['decision', 'accepted', 'rejected'].includes(
      state.showcase_stage ?? '',
    );
  }
  if (state.loop === 'respond') return state.respond_stage === 'decision';
  return false;
}

function condition(
  state: WorkflowState,
  item: Pick<BoardItem, 'pending_lane'>,
): { condition: FlowCondition; blocker?: string } {
  if (state.halted || state.loop === 'complete') {
    return {
      condition: 'terminal',
      ...(state.halted ? { blocker: state.halted.reason } : {}),
    };
  }
  if (item.pending_lane) return { condition: 'queued' };
  const blocker = stateBlocker(state);
  if (blocker) return { condition: 'blocked', blocker };
  if (waitingForHuman(state)) return { condition: 'waiting_human' };
  return { condition: 'runnable' };
}

export function projectFlow(
  state: WorkflowState,
  item: Pick<BoardItem, 'pending_lane'>,
): FlowProjection {
  return {
    desired_lane: desiredFlowLane(state),
    ...condition(state, item),
  };
}

export function laneMovesBackward(from: FlowLane, to: FlowLane): boolean {
  return FLOW_LANE_ORDER.indexOf(to) < FLOW_LANE_ORDER.indexOf(from);
}
