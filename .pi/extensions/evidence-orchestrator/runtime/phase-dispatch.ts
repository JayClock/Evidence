import { ensureProjectDirs, missingPaths } from '../evidence/artifact-index';
import {
  clarificationStoryIds,
  selectClarificationStory,
  unresolvedClarificationStoryIds,
} from '../requirements/clarifications';
import { isGateAnswered, resolvePendingGate } from '../workflow/gates';
import {
  artifactRelativePath,
  iterationRoot,
} from '../workflow/iteration-paths';
import { PHASE_META } from '../workflow/phase-catalog';
import { readState, selectWorkItem } from '../workflow/state-store';
import type { Phase, WorkflowState } from '../workflow/types';
import { buildPhaseTask } from '../subagents/phase-task';

export interface PhaseRunRequest {
  requestedPhase?: string;
  instructions?: string;
  storyId?: string;
  scenarioId?: string;
}

export class PhaseRunBlockedError extends Error {
  constructor(
    readonly kind: 'gate' | 'clarification' | 'story_selection',
    message: string,
  ) {
    super(message);
    this.name = 'PhaseRunBlockedError';
  }
}

export interface PreparedPhaseRun {
  state: WorkflowState;
  phase: Exclude<Phase, 'complete'>;
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
  if (state.pending_clarification) {
    const pending = state.pending_clarification;
    throw new PhaseRunBlockedError(
      'clarification',
      `Clarification ${pending.question_id} for ${pending.story_id} is awaiting a domain-expert answer: ${pending.question}`,
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

  const current = readState(cwd);
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
  }
  const task = buildPhaseTask(
    cwd,
    request.requestedPhase,
    request.instructions ?? '',
  );
  if (current.phase === 'complete') return { state: current, task };

  const missingInputs = missingPaths(
    cwd,
    PHASE_META[current.phase].inputs.map((path) =>
      artifactRelativePath(current, path),
    ),
  );
  if (missingInputs.length > 0) {
    throw new Error(
      `Cannot run ${current.phase}: missing inputs: ${missingInputs.join(', ')}.`,
    );
  }
  return { state: current, phase: current.phase, task };
}

export function isCompletedIteration(
  preparation: PhaseRunPreparation,
): preparation is CompletedIteration {
  return isCompleted(preparation);
}
