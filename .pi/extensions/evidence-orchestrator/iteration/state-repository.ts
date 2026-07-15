import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readTerminalV4State } from '../compatibility/v4/terminal-state-reader';
import { DEFAULT_STATE } from './default-state';
import { normalizeState } from './state-codec';
import {
  transitionLoopState,
  type LoopTransitionRequest,
} from './transition-graph';
import type {
  ActiveWorkItem,
  TestProcessSelection,
  WorkflowSnapshot,
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

/** Read either an active v5 state or an immutable terminal v4 projection. */
export function readStateSnapshot(cwd: string): WorkflowSnapshot {
  const raw = readRawState(cwd);
  if (!raw) return normalizeState(DEFAULT_STATE);
  return raw.workflow_version === 5
    ? normalizeState(raw as unknown as WorkflowState)
    : readTerminalV4State(raw);
}

/** Read active v5 state. Terminal v4 iterations are status-only. */
export function readState(cwd: string): WorkflowState {
  const snapshot = readStateSnapshot(cwd);
  if (snapshot.workflow_version !== 5) {
    throw new Error(
      `Legacy iteration ${snapshot.iteration_id} is read-only. Start a new Issue-backed v5 iteration before running workflow actions.`,
    );
  }
  return snapshot;
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

export function assertCanStartV5Iteration(cwd: string): void {
  if (!existsSync(statePath(cwd))) return;
  const current = readStateSnapshot(cwd);
  const terminal =
    current.workflow_version === 4
      ? current.terminal
      : current.loop === 'complete'
        ? 'complete'
        : current.halted
          ? 'halted'
          : undefined;
  if (!terminal) {
    throw new Error(
      `Cannot start a v5 iteration while ${current.iteration_id} is active. Complete, reject, split, or defer it first; state is never migrated in place.`,
    );
  }
}

export function selectedTestProcesses(
  workItem: ActiveWorkItem,
): TestProcessSelection[] {
  return workItem.test_plan.processes;
}
