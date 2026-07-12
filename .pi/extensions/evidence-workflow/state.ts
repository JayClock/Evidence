import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createCodingGitBaseline } from './evidence';
import { assertIterationId, nextIterationId } from './iteration';
import { DEFAULT_STATE, PHASE_ORDER } from './phases';
import type { ActiveWorkItem, Phase, WorkflowState } from './types';

const CONFIGURABLE_PHASES = new Set(
  PHASE_ORDER.filter((phase) => phase !== 'complete'),
);

export function statePath(cwd: string): string {
  return join(cwd, 'evidence-state.json');
}

function readJsonFile<T>(path: string): T | undefined {
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

export function normalizeState(state: WorkflowState): WorkflowState {
  const phase = state.phase as string;
  if (!PHASE_ORDER.includes(phase as Phase)) {
    throw new Error(`Unsupported Evidence Workflow phase: ${phase}.`);
  }
  for (const gatePhase of Object.keys(state.gate_config ?? {})) {
    if (!CONFIGURABLE_PHASES.has(gatePhase as Phase)) {
      throw new Error(
        `Unsupported Evidence Workflow gate configuration: ${gatePhase}.`,
      );
    }
  }
  const iterationId = state.iteration_id ?? DEFAULT_STATE.iteration_id;
  assertIterationId(iterationId);
  if (state.pending_clarification && phase !== 'clarify') {
    throw new Error(
      'A pending clarification is only valid while the workflow is in clarify.',
    );
  }
  if (state.pending_clarification?.answer) {
    throw new Error(
      'A pending clarification must not already contain an answer.',
    );
  }
  if (
    state.clarification_history?.some(
      (record) => !record.answer || !record.answered_at,
    )
  ) {
    throw new Error(
      'Clarification history may only contain answered exchanges.',
    );
  }
  return {
    iteration_id: iterationId,
    phase: phase as Phase,
    round: state.round ?? DEFAULT_STATE.round,
    pending_gate: state.pending_gate ?? DEFAULT_STATE.pending_gate,
    failures: state.failures ?? DEFAULT_STATE.failures,
    max_rounds: state.max_rounds ?? DEFAULT_STATE.max_rounds,
    artifacts: state.artifacts ?? DEFAULT_STATE.artifacts,
    gate_config: { ...DEFAULT_STATE.gate_config, ...(state.gate_config ?? {}) },
    ...(state.active_work_item
      ? { active_work_item: state.active_work_item }
      : {}),
    ...(state.pending_clarification
      ? { pending_clarification: state.pending_clarification }
      : {}),
    ...(state.clarification_history
      ? { clarification_history: state.clarification_history }
      : {}),
    ...(state.last_failure ? { last_failure: state.last_failure } : {}),
    ...(state.halted ? { halted: state.halted } : {}),
    pi: { enabled: true, version: 4, ...(state.pi ?? {}) },
  };
}

export function readState(cwd: string): WorkflowState {
  return normalizeState(
    readJsonFile<WorkflowState>(statePath(cwd)) ?? DEFAULT_STATE,
  );
}

export function writeState(cwd: string, state: WorkflowState): WorkflowState {
  const normalized = normalizeState(state);
  writeFileSync(statePath(cwd), `${JSON.stringify(normalized, null, 2)}\n`);
  return normalized;
}

/** Start a clean artifact namespace without deleting prior iteration evidence. */
export function newIterationState(cwd: string): WorkflowState {
  return writeState(cwd, {
    ...DEFAULT_STATE,
    iteration_id: nextIterationId(cwd),
    pi: { enabled: true, version: 4 },
  });
}

export function selectWorkItem(
  cwd: string,
  storyId: string,
  scenarioId: string,
): WorkflowState {
  const state = readState(cwd);
  if (state.phase !== 'coding') {
    throw new Error(
      `Cannot select a work item: current phase is ${state.phase}.`,
    );
  }
  if (!/^US-\d{3,}$/i.test(storyId)) {
    throw new Error(`Invalid story id: ${storyId}. Expected US-xxx.`);
  }
  if (!/^SC-\d{3,}$/i.test(scenarioId)) {
    throw new Error(`Invalid scenario id: ${scenarioId}. Expected SC-xxx.`);
  }
  const active_work_item: ActiveWorkItem = {
    story_id: storyId.toUpperCase(),
    scenario_id: scenarioId.toUpperCase(),
    git_baseline: createCodingGitBaseline(cwd),
  };
  return writeState(cwd, { ...state, active_work_item });
}
