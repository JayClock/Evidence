import { ensureProjectDirs, missingPaths } from '../evidence/artifact-index';
import { buildPhaseTask } from '../subagents/phase-task';
import { isGateAnswered, resolvePendingGate } from '../workflow/gates';
import {
  artifactRelativePath,
  iterationRoot,
} from '../workflow/iteration-paths';
import { PHASE_META } from '../workflow/phase-catalog';
import { readState, selectWorkItem } from '../workflow/state-store';
import type { ActivePhase, WorkflowState } from '../workflow/types';

export interface PhaseRunRequest {
  requestedPhase?: string;
  instructions?: string;
  storyId?: string;
  scenarioId?: string;
}

export class PhaseRunBlockedError extends Error {
  constructor(
    readonly kind: 'gate' | 'clarification' | 'idle',
    message: string,
  ) {
    super(message);
    this.name = 'PhaseRunBlockedError';
  }
}

export interface PreparedPhaseRun {
  state: WorkflowState;
  phase: ActivePhase;
  task: string;
}

export interface TerminalIteration {
  state: WorkflowState;
  task: string;
}

export type PhaseRunPreparation = PreparedPhaseRun | TerminalIteration;

export function preparePhaseRun(
  cwd: string,
  request: PhaseRunRequest = {},
): PhaseRunPreparation {
  let state = readState(cwd);
  if (state.phase === 'idle') {
    return { state, task: buildPhaseTask(cwd) };
  }
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
      'The active iteration has no frozen GitHub Issue. Start a new iteration with /evidence-new.',
    );
  }
  if (request.requestedPhase && request.requestedPhase !== state.phase) {
    throw new Error(
      `Cannot run ${request.requestedPhase}: current phase is ${state.phase}.`,
    );
  }
  if (request.storyId || request.scenarioId) {
    if (state.phase !== 'build') {
      throw new Error(
        '--story and --scenario are only valid while the workflow is in build.',
      );
    }
    if (!request.storyId || !request.scenarioId) {
      throw new Error(
        'Build selection requires both --story=US-xxx and --scenario=SC-xxx.',
      );
    }
    state = selectWorkItem(cwd, request.storyId, request.scenarioId);
  }

  if (state.pending_clarification) {
    const pending = state.pending_clarification;
    throw new PhaseRunBlockedError(
      'clarification',
      `TQA ${pending.question_id} for ${pending.story_id} is awaiting the domain expert: ${pending.question}`,
    );
  }
  if (state.pending_gate && !isGateAnswered(cwd, state.pending_gate)) {
    throw new PhaseRunBlockedError(
      'gate',
      `Gate ${state.pending_gate} is pending. Run /evidence-gate approve|revise|reject <reason>.`,
    );
  }
  if (state.phase === 'complete') {
    return { state, task: buildPhaseTask(cwd) };
  }

  const task = buildPhaseTask(cwd, state.phase, request.instructions ?? '');
  const missingInputs = missingPaths(
    cwd,
    PHASE_META[state.phase].inputs.map((path) =>
      artifactRelativePath(state, path),
    ),
  );
  if (missingInputs.length > 0) {
    throw new Error(
      `Cannot run ${state.phase}: missing inputs: ${missingInputs.join(', ')}.`,
    );
  }
  return { state, phase: state.phase, task };
}

export function isCompletedIteration(
  preparation: PhaseRunPreparation,
): preparation is TerminalIteration {
  return ['idle', 'complete'].includes(preparation.state.phase);
}
