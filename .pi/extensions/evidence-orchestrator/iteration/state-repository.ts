import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_STATE } from './default-state';
import { normalizeState } from './state-codec';
import {
  transitionLoopState,
  type LoopTransitionRequest,
} from './transition-graph';
import type {
  ActiveWorkItem,
  TestProcessSelection,
  WorkflowState,
} from './state';

function record(value: unknown, subject: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${subject} must be an object.`);
  }
  return value as Record<string, unknown>;
}

export function statePath(cwd: string): string {
  return join(cwd, 'evidence-state.json');
}

function readRawState(cwd: string): Record<string, unknown> | undefined {
  const path = statePath(cwd);
  return existsSync(path)
    ? record(
        JSON.parse(readFileSync(path, 'utf8')) as unknown,
        'Orchestrator state',
      )
    : undefined;
}

/** Read the persisted native workflow state, if an iteration is active. */
export function readPersistedState(cwd: string): WorkflowState | undefined {
  const raw = readRawState(cwd);
  return raw ? normalizeState(raw as unknown as WorkflowState) : undefined;
}

/** Read native state, using the bootstrap shape when no iteration is active. */
export function readState(cwd: string): WorkflowState {
  return readPersistedState(cwd) ?? normalizeState(DEFAULT_STATE);
}

export function writeState(cwd: string, state: WorkflowState): WorkflowState {
  const normalized = normalizeState(state);
  writeFileSync(statePath(cwd), `${JSON.stringify(normalized, null, 2)}\n`);
  return normalized;
}

export function transitionWorkflowLoop(
  cwd: string,
  request: LoopTransitionRequest,
): WorkflowState {
  return writeState(cwd, transitionLoopState(readState(cwd), request));
}

export function assertCanStartIteration(cwd: string): void {
  const current = readPersistedState(cwd);
  if (!current) return;
  if (current.loop !== 'complete' && !current.halted) {
    throw new Error(
      `Cannot start an iteration while ${current.iteration_id} is active. Complete, reject, split, or defer it first; state is never migrated in place.`,
    );
  }
}

export function selectedTestProcesses(
  workItem: ActiveWorkItem,
): TestProcessSelection[] {
  return workItem.test_plan.processes;
}
