import {
  ensureProjectDirs,
  missingPaths,
} from '../../../iteration/artifact-inventory';
import { prepareModelProjection } from '../../../loops/understand/modeling/projection';
import {
  pairDeterministicAction,
  pairDriverMode,
  pairNextInstruction,
} from '../../../loops/pair/pair-session';
import {
  enterShowcase,
  missingShowcaseRisks,
  prepareShowcaseReview,
  showcaseNextInstruction,
} from '../../../loops/showcase/showcase-session';
import {
  artifactRelativePath,
  iterationRoot,
} from '../../../iteration/artifact-layout';
import { readState } from '../../../iteration/state-repository';
import type {
  PairDeterministicAction,
  WorkflowLoop,
  WorkflowState,
} from '../../../iteration/state';
import { buildActivityTask } from './task';

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
      | 'desk_check'
      | 'pair_navigation'
      | 'showcase_risk'
      | 'showcase_decision'
      | 'respond_decision',
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
  task: string;
}

export interface CompletedIteration {
  state: WorkflowState;
  activity?: never;
  task: string;
}

export type ActivityRunPreparation = PreparedActivityRun | CompletedIteration;

function agentFor(state: WorkflowState): string | undefined {
  if (state.loop === 'kickoff') return 'requirements-analyst';
  if (state.loop === 'understand') {
    if (state.understand_stage === 'tqa') return 'requirements-analyst';
    return state.modeling_stage === 'candidate_ready'
      ? 'model-challenger'
      : 'domain-modeler';
  }
  if (state.loop === 'tasking') return 'architect';
  if (state.loop === 'pair') {
    const mode = pairDriverMode(state);
    return mode === 'test'
      ? 'test-driver'
      : mode
        ? 'production-driver'
        : undefined;
  }
  if (state.loop === 'showcase') return 'showcase-reviewer';
  if (state.loop === 'respond') return 'respond-learner';
  return undefined;
}

function requiredInputs(state: WorkflowState): string[] {
  if (state.loop === 'kickoff') {
    return [
      'artifacts/00-user-input/requirements.md',
      'docs/product/personas.md',
      'docs/product/business-context.md',
      'docs/product/user-journeys.md',
      'docs/product/story-map.md',
    ];
  }
  if (state.loop === 'understand' && state.understand_stage === 'tqa') {
    return [
      'artifacts/00-user-input/requirements.md',
      'artifacts/01-requirements/problem-statement.md',
      `artifacts/01-requirements/stories/${state.active_clarification_story?.story_id ?? 'missing'}.md`,
      'docs/product/business-context.md',
      'docs/product/user-journeys.md',
    ];
  }
  if (state.loop === 'understand') {
    return [
      state.confirmed_scenario?.artifact_path ??
        'artifacts/01-requirements/examples/missing.md',
      '.evidence/model.json',
      '.evidence/entities/',
      '.evidence/associations/',
      ...(state.modeling_stage === 'candidate_ready'
        ? [
            state.model_projection?.mermaid_path ?? 'missing-model.mmd',
            state.model_projection?.glossary_path ?? 'missing-glossary.md',
            state.model_projection?.context_path ?? 'missing-context.json',
          ]
        : []),
    ];
  }
  if (state.loop === 'tasking') {
    return [
      state.confirmed_scenario?.artifact_path ??
        'artifacts/01-requirements/examples/missing.md',
      state.model_expansion_path ??
        'artifacts/02-domain-model/model-expansions/missing.json',
      'docs/architecture/context-map.md',
      'docs/architecture/module-structure.md',
      'docs/architecture/tech-stack.md',
      'docs/architecture/test-strategy.md',
      'docs/architecture/test-doubles.md',
      'contracts/api.yaml',
      'engineering/evidence-orchestrator/runtime-contexts.json',
      'engineering/evidence-orchestrator/test-processes/',
      'engineering/evidence-orchestrator/definition-of-done.md',
    ];
  }
  if (state.loop === 'pair') {
    return [
      state.confirmed_scenario?.artifact_path ??
        'artifacts/01-requirements/examples/missing.md',
      state.model_expansion_path ??
        'artifacts/02-domain-model/model-expansions/missing.json',
      state.tasking_candidate?.test_list_path ??
        'artifacts/04-planning/test-list.md',
      state.tasking_candidate?.task_list_path ??
        'artifacts/04-planning/task-list.md',
      state.approved_test_plan_path ?? 'artifacts/04-planning/test-plan.json',
      ...(state.active_work_item?.test_plan.processes.map(({ path }) => path) ??
        []),
      'engineering/evidence-orchestrator/definition-of-done.md',
    ];
  }
  if (state.loop === 'showcase') {
    return [
      state.confirmed_scenario?.artifact_path ??
        'artifacts/01-requirements/examples/missing.md',
      state.model_expansion_path ??
        'artifacts/02-domain-model/model-expansions/missing.json',
      state.approved_test_plan_path ?? 'artifacts/04-planning/test-plan.json',
      state.active_work_item
        ? `artifacts/05-code/${state.active_work_item.story_id}/${state.active_work_item.scenario_id}.manifest.json`
        : 'artifacts/05-code/missing/manifest.json',
      'engineering/evidence-orchestrator/definition-of-done.md',
    ];
  }
  if (state.loop === 'respond') {
    return [
      state.confirmed_scenario?.artifact_path ??
        'artifacts/01-requirements/examples/missing.md',
      state.active_work_item
        ? `artifacts/05-code/${state.active_work_item.story_id}/${state.active_work_item.scenario_id}.manifest.json`
        : 'artifacts/05-code/missing/manifest.json',
      state.showcase_reviews?.at(-1)?.artifact_path ??
        'artifacts/06-review/missing-review.json',
      'docs/knowledge-governance.md',
      'engineering/evidence-orchestrator/definition-of-done.md',
    ];
  }
  return [];
}

/** Resolve one v5 activity without performing agent work. */
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
  if (!current.requirement_source) {
    throw new Error(
      'The active iteration has no frozen GitHub Issue. Start one with /evidence-new.',
    );
  }
  if (
    current.loop === 'pair' &&
    current.pair_session?.checkpoint === 'quality_gates_passed'
  ) {
    current = enterShowcase(cwd);
  }
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
      const missing = missingShowcaseRisks(current);
      if (missing.length > 0) {
        throw new ActivityRunBlockedError(
          'showcase_risk',
          `Showcase requires explicit ${missing.join(' and ')} risk decisions. ${showcaseNextInstruction(cwd)}.`,
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
  if (current.loop === 'tasking' && current.tasking_stage === 'desk_check') {
    throw new ActivityRunBlockedError(
      'desk_check',
      'The Tasking candidate awaits human /evidence-desk-check.',
    );
  }
  if (
    current.loop === 'pair' &&
    current.pair_session &&
    ((current.pair_session.checkpoint === 'red_observed' &&
      current.pair_session.red_observation?.accepted !== true) ||
      current.pair_session.checkpoint === 'quality_gate_failed' ||
      current.pair_session.checkpoint === 'quality_gates_passed')
  ) {
    throw new ActivityRunBlockedError(
      'pair_navigation',
      `Pair is paused at ${current.pair_session.checkpoint}. ${pairNextInstruction(current)}.`,
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
    requiredInputs(current).map((path) =>
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
    task,
  };
}

export function isCompletedIteration(
  preparation: ActivityRunPreparation,
): preparation is CompletedIteration {
  return preparation.state.loop === 'complete';
}
