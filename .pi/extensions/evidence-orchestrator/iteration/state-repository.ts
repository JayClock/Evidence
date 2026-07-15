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
import { legacyTerminalFacts } from './terminal-policy';

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

/** Read active v5 state. Legacy iterations remain status-only. */
export function readState(cwd: string): WorkflowState {
  const raw = readRawState(cwd);
  if (!raw) return normalizeState(DEFAULT_STATE);
  if (raw.workflow_version !== 5) {
    const legacy = legacyTerminalFacts(raw);
    throw new Error(
      `Legacy iteration ${legacy.iterationId} is read-only. Start a new Issue-backed v5 iteration before running workflow actions.`,
    );
  }
  return normalizeState(raw as unknown as WorkflowState);
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
  const raw = readRawState(cwd);
  if (!raw) return;
  if (raw.workflow_version !== 5) {
    legacyTerminalFacts(raw);
    return;
  }
  const current = normalizeState(raw as unknown as WorkflowState);
  if (current.loop !== 'complete' && !current.halted) {
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
