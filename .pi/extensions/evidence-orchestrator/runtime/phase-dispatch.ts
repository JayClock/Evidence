import { ensureProjectDirs, missingPaths } from '../evidence/artifact-index';
import { prepareModelProjection } from '../evidence/model-projection';
import {
  pairDeterministicAction,
  pairDriverMode,
  pairNextInstruction,
} from '../testing/pairing';
import {
  enterShowcase,
  missingShowcaseRisks,
  prepareShowcaseReview,
  showcaseNextInstruction,
} from '../testing/showcase';
import {
  clarificationStoryIds,
  selectClarificationStory,
  unresolvedClarificationStoryIds,
} from '../requirements/clarifications';
import {
  completePhase,
  isGateAnswered,
  resolvePendingGate,
} from '../workflow/gates';
import {
  artifactRelativePath,
  iterationRoot,
} from '../workflow/iteration-paths';
import { PHASE_META } from '../workflow/phase-catalog';
import { readState, selectWorkItem } from '../workflow/state-store';
import type {
  PairDeterministicAction,
  Phase,
  WorkflowState,
} from '../workflow/types';
import { buildPhaseTask } from '../subagents/phase-task';

export interface PhaseRunRequest {
  requestedPhase?: string;
  instructions?: string;
  storyId?: string;
  scenarioId?: string;
}

export class PhaseRunBlockedError extends Error {
  constructor(
    readonly kind:
      | 'gate'
      | 'kickoff_decision'
      | 'clarification'
      | 'scenario_decision'
      | 'modeling_profile'
      | 'desk_check'
      | 'pair_navigation'
      | 'showcase_risk'
      | 'showcase_decision'
      | 'story_decision'
      | 'story_selection',
    message: string,
  ) {
    super(message);
    this.name = 'PhaseRunBlockedError';
  }
}

export interface PreparedPhaseRun {
  state: WorkflowState;
  phase: Exclude<Phase, 'complete'>;
  agentName?: string;
  pairAction?: PairDeterministicAction;
  showcaseAction?: 'run_q2';
  task: string;
}

export interface CompletedIteration {
  state: WorkflowState;
  task: string;
}

export type PhaseRunPreparation = PreparedPhaseRun | CompletedIteration;

function isCompleted(
  preparation: PhaseRunPreparation,
): preparation is CompletedIteration {
  return preparation.state.phase === 'complete';
}

/**
 * Resolve one run deterministically before handing it to a phase subagent.
 * This function deliberately performs no agent work and never starts a child
 * process, so commands and tools cannot diverge in their guardrails.
 */
export function preparePhaseRun(
  cwd: string,
  request: PhaseRunRequest = {},
): PhaseRunPreparation {
  let state = readState(cwd);
  ensureProjectDirs(cwd, iterationRoot(cwd, state));

  if (state.pending_gate && isGateAnswered(cwd, state.pending_gate)) {
    state = resolvePendingGate(cwd);
  }
  if (state.halted) {
    throw new Error(
      `Iteration ${state.iteration_id} is halted: ${state.halted.reason}`,
    );
  }
  if (state.phase !== 'complete' && !state.requirement_source) {
    throw new Error(
      'This bootstrap iteration is archival and cannot run. Select a GitHub Issue with /evidence-new.',
    );
  }
  if (request.requestedPhase && request.requestedPhase !== state.phase) {
    throw new Error(
      `Cannot run ${request.requestedPhase}: current phase is ${state.phase}. Use /evidence-new before a new iteration.`,
    );
  }
  if (request.storyId || request.scenarioId) {
    if (state.phase === 'clarify') {
      if (!request.storyId || request.scenarioId) {
        throw new Error('Clarify accepts --story=US-xxx without --scenario.');
      }
      state = selectClarificationStory(cwd, request.storyId);
    } else {
      if (state.phase !== 'coding') {
        throw new Error(
          'A --story selection is only valid during clarify or coding.',
        );
      }
      if (!request.storyId || !request.scenarioId) {
        throw new Error(
          'Coding requires both --story=US-xxx and --scenario=SC-xxx.',
        );
      }
      state = selectWorkItem(cwd, request.storyId, request.scenarioId);
    }
  }

  let current = readState(cwd);
  if (
    current.workflow_version === 5 &&
    current.loop === 'pair' &&
    current.pair_session?.checkpoint === 'quality_gates_passed'
  ) {
    current = enterShowcase(cwd);
  }
  let showcaseAction: PreparedPhaseRun['showcaseAction'];
  if (current.workflow_version === 5 && current.loop === 'showcase') {
    const q2 = current.showcase_q2_observations ?? [];
    if (q2.length === 0) {
      showcaseAction = 'run_q2';
    } else if (q2.some(({ exit_code }) => exit_code !== 0)) {
      throw new PhaseRunBlockedError(
        'showcase_decision',
        `A selected Showcase Q2 failed. Accept is blocked. ${showcaseNextInstruction(cwd)}.`,
      );
    } else {
      const missingRisks = missingShowcaseRisks(current);
      if (missingRisks.length > 0) {
        throw new PhaseRunBlockedError(
          'showcase_risk',
          `Showcase requires explicit ${missingRisks.join(' and ')} risk decisions. ${showcaseNextInstruction(cwd)}.`,
        );
      }
      if (current.showcase_stage === 'decision') {
        throw new PhaseRunBlockedError(
          'showcase_decision',
          `Independent review is complete. ${showcaseNextInstruction(cwd)}.`,
        );
      }
      current = prepareShowcaseReview(cwd);
    }
  }
  if (
    current.workflow_version === 5 &&
    current.loop === 'kickoff' &&
    current.kickoff_candidate
  ) {
    throw new PhaseRunBlockedError(
      'kickoff_decision',
      `Kickoff candidate ${current.kickoff_candidate.artifact_path} is awaiting a human decision. Run /evidence-kickoff to confirm, revise, split, defer, or stop.`,
    );
  }
  if (
    current.workflow_version === 5 &&
    current.loop === 'understand' &&
    current.understand_stage === 'scenario_review' &&
    current.scenario_drafts?.length
  ) {
    throw new PhaseRunBlockedError(
      'scenario_decision',
      `${current.scenario_drafts.length} Scenario draft(s) await a human decision. Run /evidence-scenario to confirm one, continue TQA, split, or defer.`,
    );
  }
  if (
    current.workflow_version === 5 &&
    current.loop === 'understand' &&
    current.modeling_stage === 'profile_review'
  ) {
    throw new PhaseRunBlockedError(
      'modeling_profile',
      'The modeling Profile awaits a human decision. Run /evidence-modeling-profile to confirm or override it.',
    );
  }
  if (
    current.workflow_version === 5 &&
    current.loop === 'understand' &&
    current.modeling_stage === 'candidate_ready'
  ) {
    current = prepareModelProjection(cwd);
  }
  if (
    current.workflow_version === 5 &&
    current.loop === 'tasking' &&
    current.tasking_stage === 'desk_check' &&
    current.tasking_candidate
  ) {
    throw new PhaseRunBlockedError(
      'desk_check',
      `Tasking draft ${current.tasking_candidate.draft_id} awaits a human decision. Review ${current.tasking_candidate.test_list_path} and run /evidence-desk-check.`,
    );
  }
  if (
    current.workflow_version === 5 &&
    current.loop === 'pair' &&
    current.pair_session &&
    ((current.pair_session.checkpoint === 'red_observed' &&
      current.pair_session.red_observation?.accepted !== true) ||
      current.pair_session.checkpoint === 'quality_gate_failed' ||
      current.pair_session.checkpoint === 'quality_gates_passed')
  ) {
    throw new PhaseRunBlockedError(
      'pair_navigation',
      `Pair is paused at ${current.pair_session.checkpoint}. ${pairNextInstruction(current)}.`,
    );
  }
  if (current.pending_clarification) {
    const pending = current.pending_clarification;
    throw new PhaseRunBlockedError(
      'clarification',
      `Clarification ${pending.question_id} for ${pending.story_id} is awaiting a domain-expert answer: ${pending.question}`,
    );
  }
  if (current.proposed_clarification_story_outcome) {
    const proposal = current.proposed_clarification_story_outcome;
    throw new PhaseRunBlockedError(
      'story_decision',
      `${proposal.story_id} is awaiting a human decision on the proposed ${proposal.outcome} outcome. Run /evidence-story-complete to confirm, override, or continue clarification.`,
    );
  }
  if (current.pending_gate && !isGateAnswered(cwd, current.pending_gate)) {
    throw new PhaseRunBlockedError(
      'gate',
      `Gate ${current.pending_gate} is pending. Edit ${artifactRelativePath(current, `artifacts/gates/${current.pending_gate}.md`)} or run /evidence-gate <decision>.`,
    );
  }
  if (current.phase === 'clarify' && !current.active_clarification_story) {
    const storyIds = clarificationStoryIds(cwd, current);
    const unresolvedStoryIds = unresolvedClarificationStoryIds(cwd, current);
    if (storyIds.length > 0 && unresolvedStoryIds.length > 0) {
      throw new PhaseRunBlockedError(
        'story_selection',
        `Select one clarification story before running clarify: ${unresolvedStoryIds.join(', ')}. Use /evidence-story <US-xxx> or evidence_orchestrator_select_story.`,
      );
    }
    if (storyIds.length > 0) {
      current = completePhase(
        cwd,
        'clarify',
        'All clarification stories have human-confirmed outcomes; advancing directly to specify.',
      );
      if (current.pending_gate) {
        throw new PhaseRunBlockedError(
          'gate',
          `Gate ${current.pending_gate} is pending. Edit ${artifactRelativePath(current, `artifacts/gates/${current.pending_gate}.md`)} or run /evidence-gate <decision>.`,
        );
      }
    }
  }
  const task = showcaseAction
    ? 'Execute the approved Showcase Q2 commands deterministically and display the confirmed Given/When/Then observation.'
    : buildPhaseTask(cwd, current.phase, request.instructions ?? '');
  if (current.phase === 'complete') return { state: current, task };

  const v5UnderstandInputs =
    current.workflow_version === 5 &&
    current.loop === 'understand' &&
    current.understand_stage === 'tqa'
      ? [
          'artifacts/00-user-input/requirements.md',
          'artifacts/01-requirements/problem-statement.md',
          `artifacts/01-requirements/stories/${current.active_clarification_story?.story_id ?? 'missing'}.md`,
          'docs/product/business-context.md',
          'docs/product/user-journeys.md',
        ]
      : current.workflow_version === 5 &&
          current.loop === 'understand' &&
          current.understand_stage === 'modeling'
        ? [
            current.confirmed_scenario?.artifact_path ??
              'artifacts/01-requirements/examples/missing.md',
            '.evidence/model.json',
            '.evidence/entities/',
            '.evidence/associations/',
            ...(current.modeling_stage === 'candidate_ready'
              ? [
                  current.model_projection?.mermaid_path ?? 'missing-model.mmd',
                  current.model_projection?.glossary_path ??
                    'missing-glossary.md',
                  current.model_projection?.context_path ??
                    'missing-context.json',
                ]
              : []),
          ]
        : undefined;
  const v5TaskingInputs =
    current.workflow_version === 5 && current.loop === 'tasking'
      ? [
          current.confirmed_scenario?.artifact_path ??
            'artifacts/01-requirements/examples/missing.md',
          current.model_expansion_path ??
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
        ]
      : undefined;
  const v5PairInputs =
    current.workflow_version === 5 && current.loop === 'pair'
      ? [
          current.confirmed_scenario?.artifact_path ??
            'artifacts/01-requirements/examples/missing.md',
          current.model_expansion_path ??
            'artifacts/02-domain-model/model-expansions/missing.json',
          current.tasking_candidate?.test_list_path ??
            'artifacts/04-planning/test-list.md',
          current.tasking_candidate?.task_list_path ??
            'artifacts/04-planning/task-list.md',
          current.approved_test_plan_path ??
            'artifacts/04-planning/test-plan.json',
          ...(current.active_work_item?.test_plan?.processes.map(
            ({ path }) => path,
          ) ?? []),
          'engineering/evidence-orchestrator/definition-of-done.md',
        ]
      : undefined;
  const v5ShowcaseInputs =
    current.workflow_version === 5 && current.loop === 'showcase'
      ? [
          current.confirmed_scenario?.artifact_path ??
            'artifacts/01-requirements/examples/missing.md',
          current.model_expansion_path ??
            'artifacts/02-domain-model/model-expansions/missing.json',
          current.approved_test_plan_path ??
            'artifacts/04-planning/test-plan.json',
          current.active_work_item
            ? `artifacts/05-code/${current.active_work_item.story_id}/${current.active_work_item.scenario_id}.manifest.json`
            : 'artifacts/05-code/missing/manifest.json',
          current.active_work_item
            ? `artifacts/05-code/${current.active_work_item.story_id}/${current.active_work_item.scenario_id}.summary.md`
            : 'artifacts/05-code/missing/summary.md',
          'engineering/evidence-orchestrator/definition-of-done.md',
        ]
      : undefined;
  const missingInputs = missingPaths(
    cwd,
    (
      v5UnderstandInputs ??
      v5TaskingInputs ??
      v5PairInputs ??
      v5ShowcaseInputs ??
      PHASE_META[current.phase].inputs
    ).map((path) =>
      path.startsWith(`artifacts/iterations/${current.iteration_id}/`)
        ? path
        : artifactRelativePath(current, path),
    ),
  );
  if (missingInputs.length > 0) {
    throw new Error(
      `Cannot run ${current.phase}: missing inputs: ${missingInputs.join(', ')}.`,
    );
  }
  const pairMode =
    current.workflow_version === 5 && current.loop === 'pair'
      ? pairDriverMode(current)
      : undefined;
  const pairAction =
    current.workflow_version === 5 && current.loop === 'pair'
      ? pairDeterministicAction(cwd, current)
      : undefined;
  return {
    state: current,
    phase: current.phase,
    ...(current.workflow_version === 5 && current.loop === 'showcase'
      ? { agentName: 'showcase-reviewer' }
      : current.workflow_version === 5 &&
          current.modeling_stage === 'candidate_ready'
        ? { agentName: 'model-challenger' }
        : pairMode
          ? {
              agentName:
                pairMode === 'test' ? 'test-driver' : 'production-driver',
            }
          : {}),
    ...(pairAction ? { pairAction } : {}),
    ...(showcaseAction ? { showcaseAction } : {}),
    task,
  };
}

export function isCompletedIteration(
  preparation: PhaseRunPreparation,
): preparation is CompletedIteration {
  return isCompleted(preparation);
}
