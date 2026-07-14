import type {
  FeedbackDecider,
  FeedbackTarget,
  Phase,
  WorkflowFeedback,
  WorkflowLoop,
  WorkflowState,
} from './types';

export const LOOP_ORDER: WorkflowLoop[] = [
  'kickoff',
  'understand',
  'tasking',
  'pair',
  'showcase',
  'respond',
  'complete',
];

const FORWARD_LOOP: Record<WorkflowLoop, WorkflowLoop | undefined> = {
  kickoff: 'understand',
  understand: 'tasking',
  tasking: 'pair',
  pair: 'showcase',
  showcase: 'respond',
  respond: 'complete',
  complete: undefined,
};

export const FEEDBACK_LOOP_BY_TARGET: Record<FeedbackTarget, WorkflowLoop> = {
  problem: 'kickoff',
  business_knowledge: 'understand',
  scenario: 'understand',
  model: 'understand',
  architecture: 'tasking',
  test_strategy: 'tasking',
  test_process: 'tasking',
  test: 'pair',
  implementation: 'pair',
  refactor: 'pair',
  value_validation: 'showcase',
};

const COMPATIBILITY_PHASE_BY_LOOP: Record<WorkflowLoop, Phase> = {
  kickoff: 'frame',
  understand: 'clarify',
  tasking: 'architecture',
  pair: 'coding',
  showcase: 'review',
  respond: 'learn',
  complete: 'complete',
};

/** Keep v5 readable by v4 phase code during the incremental migration. */
export function compatibilityPhaseForLoop(loop: WorkflowLoop): Phase {
  return COMPATIBILITY_PHASE_BY_LOOP[loop];
}

/** Project a legacy phase into its containing v5 knowledge activity. */
export function loopForCompatibilityPhase(phase: Phase): WorkflowLoop {
  switch (phase) {
    case 'frame':
      return 'kickoff';
    case 'clarify':
    case 'specify':
    case 'validate':
    case 'domain_model':
      return 'understand';
    case 'architecture':
    case 'planning':
      return 'tasking';
    case 'coding':
      return 'pair';
    case 'review':
      return 'showcase';
    case 'learn':
      return 'respond';
    case 'complete':
      return 'complete';
  }
}

export function isV5Workflow(
  state: WorkflowState,
): state is WorkflowState & { workflow_version: 5; loop: WorkflowLoop } {
  return state.workflow_version === 5 && state.loop !== undefined;
}

export interface LoopFeedbackInput {
  target: FeedbackTarget;
  reason: string;
  decided_by: FeedbackDecider;
}

export interface LoopTransitionRequest {
  to: WorkflowLoop;
  feedback?: LoopFeedbackInput;
}

function loopIndex(loop: WorkflowLoop): number {
  return LOOP_ORDER.indexOf(loop);
}

export function allowedLoopActions(loop: WorkflowLoop): string[] {
  const actions: string[] = [];
  const forward = FORWARD_LOOP[loop];
  if (forward) actions.push(`advance:${forward}`);
  for (const [target, destination] of Object.entries(
    FEEDBACK_LOOP_BY_TARGET,
  ) as Array<[FeedbackTarget, WorkflowLoop]>) {
    if (loop !== 'complete' && loopIndex(destination) <= loopIndex(loop)) {
      actions.push(`feedback:${target}->${destination}`);
    }
  }
  return actions;
}

/** Pure v5 transition. Persistence is handled by state-store. */
export function transitionLoopState(
  state: WorkflowState,
  request: LoopTransitionRequest,
  now = new Date().toISOString(),
): WorkflowState {
  if (!isV5Workflow(state)) {
    throw new Error(
      'Only a v5 workflow can use knowledge-loop transitions. Complete or halt the active v4 iteration first.',
    );
  }
  const from = state.loop;
  const feedback = request.feedback;
  let recordedFeedback: WorkflowFeedback | undefined;
  if (feedback) {
    if (!feedback.reason.trim()) {
      throw new Error('A feedback transition requires a non-empty reason.');
    }
    const expected = FEEDBACK_LOOP_BY_TARGET[feedback.target];
    if (request.to !== expected) {
      throw new Error(
        `Feedback target ${feedback.target} must route to ${expected}, not ${request.to}.`,
      );
    }
    if (loopIndex(request.to) > loopIndex(from)) {
      throw new Error(
        `Feedback cannot move forward from ${from} to ${request.to}. Use the normal advance transition.`,
      );
    }
    recordedFeedback = {
      target: feedback.target,
      from_loop: from,
      to_loop: request.to,
      reason: feedback.reason.trim(),
      decided_by: feedback.decided_by,
      recorded_at: now,
    };
  } else if (FORWARD_LOOP[from] !== request.to) {
    throw new Error(
      `Invalid v5 workflow transition: ${from} -> ${request.to}. Allowed next action: ${FORWARD_LOOP[from] ?? 'none'}.`,
    );
  }

  return {
    ...state,
    loop: request.to,
    phase: compatibilityPhaseForLoop(request.to),
    round: 0,
    ...(recordedFeedback
      ? {
          feedback_history: [
            ...(state.feedback_history ?? []),
            recordedFeedback,
          ],
        }
      : {}),
  };
}
