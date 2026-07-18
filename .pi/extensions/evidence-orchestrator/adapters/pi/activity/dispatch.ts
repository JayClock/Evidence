import {
  ensureProjectDirs,
  missingPaths,
} from '../../../iteration/artifact-inventory';
import { prepareModelProjection } from '../../../loops/understand/modeling/projection';
import {
  pairDeterministicAction,
  pairNextInstruction,
} from '../../../loops/pair/pair-session';
import {
  concerningShowcaseEvaluations,
  missingShowcaseEvaluations,
  missingShowcaseProductObservations,
  missingShowcaseRisks,
  prepareShowcaseReview,
  showcaseNextInstruction,
} from '../../../loops/showcase/showcase-session';
import {
  artifactRelativePath,
  iterationRoot,
} from '../../../iteration/artifact-layout';
import { readState } from '../../../iteration/state-repository';
import {
  type PairDeterministicAction,
  type WorkflowLoop,
  type WorkflowState,
} from '../../../iteration/state';
import {
  activityAgentForState,
  activityRequiredInputs,
  buildActivityTask,
} from './task';

export interface ActivityRunRequest {
  instructions?: string;
}

export class ActivityRunBlockedError extends Error {
  constructor(
    readonly kind:
      | 'kickoff_decision'
      | 'clarification'
      | 'scenario_decision'
      | 'modeling_profile'
      | 'model_decision'
      | 'desk_check'
      | 'pair_navigation'
      | 'showcase_risk'
      | 'showcase_observation'
      | 'showcase_evaluation'
      | 'showcase_decision'
      | 'respond_decision'
      | 'flow_admission',
    message: string,
  ) {
    super(message);
    this.name = 'ActivityRunBlockedError';
  }
}

export interface PreparedActivityRun {
  state: WorkflowState;
  activity: Exclude<WorkflowLoop, 'complete'>;
  agentName?: string;
  pairAction?: PairDeterministicAction;
  showcaseAction?: 'run_q2';
  modelingAction?: 'complete_no_model';
  task: string;
}

export interface CompletedIteration {
  state: WorkflowState;
  activity?: never;
  task: string;
}

export type ActivityRunPreparation = PreparedActivityRun | CompletedIteration;

function agentFor(state: WorkflowState): string | undefined {
  return activityAgentForState(state);
}

/** Resolve one activity without performing agent work. */
export function prepareActivityRun(
  cwd: string,
  request: ActivityRunRequest = {},
): ActivityRunPreparation {
  let current = readState(cwd);
  ensureProjectDirs(cwd, iterationRoot(cwd, current));
  if (current.halted) {
    throw new Error(
      `Iteration ${current.iteration_id} is halted: ${current.halted.reason}`,
    );
  }
  if (current.loop === 'complete') {
    return {
      state: current,
      task: buildActivityTask(cwd, request.instructions),
    };
  }
  if (!current.intake_snapshot) {
    throw new Error(
      'The active iteration has no frozen requirement input. Start one with /evidence-new.',
    );
  }
  const modelingAction: PreparedActivityRun['modelingAction'] =
    current.loop === 'understand' &&
    current.modeling_stage === 'expansion' &&
    current.modeling_profile?.method === 'none'
      ? 'complete_no_model'
      : undefined;
  let showcaseAction: PreparedActivityRun['showcaseAction'];
  if (current.loop === 'showcase') {
    const q2 = current.showcase_q2_observations ?? [];
    if (q2.length === 0) showcaseAction = 'run_q2';
    else if (q2.some(({ exit_code }) => exit_code !== 0)) {
      throw new ActivityRunBlockedError(
        'showcase_decision',
        `A selected Showcase Q2 failed. ${showcaseNextInstruction(cwd)}.`,
      );
    } else {
      const missingProductObservations =
        missingShowcaseProductObservations(current);
      if (missingProductObservations.length > 0) {
        throw new ActivityRunBlockedError(
          'showcase_observation',
          `Showcase requires human product/value observations for ${missingProductObservations.join(', ')}. ${showcaseNextInstruction(cwd)}.`,
        );
      }
      const missing = missingShowcaseRisks(current);
      if (missing.length > 0) {
        throw new ActivityRunBlockedError(
          'showcase_risk',
          `Showcase requires explicit ${missing.join(' and ')} risk decisions. ${showcaseNextInstruction(cwd)}.`,
        );
      }
      const missingEvaluations = missingShowcaseEvaluations(current);
      if (missingEvaluations.length > 0) {
        throw new ActivityRunBlockedError(
          'showcase_evaluation',
          `Showcase requires evaluation evidence for ${missingEvaluations.join(', ')}. ${showcaseNextInstruction(cwd)}.`,
        );
      }
      const concerns = concerningShowcaseEvaluations(current);
      if (concerns.length > 0) {
        throw new ActivityRunBlockedError(
          'showcase_decision',
          `Showcase has unresolved concerns: ${concerns.join(', ')}. ${showcaseNextInstruction(cwd)}.`,
        );
      }
      if (current.showcase_stage === 'decision') {
        throw new ActivityRunBlockedError(
          'showcase_decision',
          `Independent review is complete. ${showcaseNextInstruction(cwd)}.`,
        );
      }
      current = prepareShowcaseReview(cwd);
    }
  }
  if (current.loop === 'respond' && current.respond_stage === 'decision') {
    throw new ActivityRunBlockedError(
      'respond_decision',
      `Respond candidate ${current.respond_candidate?.artifact_path ?? 'missing'} awaits /evidence-respond approve|revise <reason>.`,
    );
  }
  if (current.loop === 'kickoff' && current.kickoff_candidate) {
    throw new ActivityRunBlockedError(
      'kickoff_decision',
      `Kickoff candidate ${current.kickoff_candidate.artifact_path} awaits /evidence-kickoff.`,
    );
  }
  if (
    current.loop === 'understand' &&
    current.understand_stage === 'scenario_review'
  ) {
    throw new ActivityRunBlockedError(
      'scenario_decision',
      'Scenario drafts await a human /evidence-scenario decision.',
    );
  }
  if (
    current.loop === 'understand' &&
    current.modeling_stage === 'profile_review'
  ) {
    throw new ActivityRunBlockedError(
      'modeling_profile',
      'The modeling Profile awaits /evidence-modeling-profile.',
    );
  }
  if (
    current.loop === 'understand' &&
    current.modeling_stage === 'candidate_ready'
  ) {
    current = prepareModelProjection(cwd);
  }
  if (
    current.loop === 'understand' &&
    current.modeling_stage === 'model_review'
  ) {
    throw new ActivityRunBlockedError(
      'model_decision',
      'The challenged model and ubiquitous language await human /evidence-model confirm [reason] | revise|scenario-gap|method-gap <reason>.',
    );
  }
  if (current.loop === 'tasking' && current.tasking_stage === 'desk_check') {
    throw new ActivityRunBlockedError(
      'desk_check',
      'The Tasking candidate awaits human /evidence-desk-check.',
    );
  }
  if (
    current.loop === 'pair' &&
    (current.pair_session?.checkpoint === 'quality_gates_passed' ||
      current.pair_session?.automation_exception)
  ) {
    throw new ActivityRunBlockedError(
      'pair_navigation',
      current.pair_session?.automation_exception
        ? `Automated Pair coding stopped with an exception: ${current.pair_session.automation_exception.reason}. ${pairNextInstruction(current)}.`
        : `Automated Pair coding is complete. ${pairNextInstruction(current)}.`,
    );
  }
  if (current.pending_clarification) {
    throw new ActivityRunBlockedError(
      'clarification',
      `TQA ${current.pending_clarification.question_id} awaits the domain expert: ${current.pending_clarification.question}`,
    );
  }
  const task = showcaseAction
    ? 'Execute the locked Showcase Q2 commands and display the confirmed Given/When/Then observation.'
    : buildActivityTask(cwd, request.instructions ?? '');
  const missing = missingPaths(
    cwd,
    activityRequiredInputs(current).map((path) =>
      path.startsWith(`artifacts/iterations/${current.iteration_id}/`)
        ? path
        : artifactRelativePath(current, path),
    ),
  );
  if (missing.length > 0) {
    throw new Error(
      `Cannot run ${current.loop}: missing inputs: ${missing.join(', ')}.`,
    );
  }
  const pairAction =
    current.loop === 'pair' ? pairDeterministicAction(cwd, current) : undefined;
  return {
    state: current,
    activity: current.loop as Exclude<WorkflowLoop, 'complete'>,
    ...(agentFor(current) ? { agentName: agentFor(current) } : {}),
    ...(pairAction ? { pairAction } : {}),
    ...(showcaseAction ? { showcaseAction } : {}),
    ...(modelingAction ? { modelingAction } : {}),
    task,
  };
}

export function isCompletedIteration(
  preparation: ActivityRunPreparation,
): preparation is CompletedIteration {
  return preparation.state.loop === 'complete';
}
