import { existsSync, readFileSync } from 'node:fs';
import { DEFAULT_STATE } from '../iteration/default-state';
import { normalizeState } from '../iteration/state-codec';
import { statePath } from '../iteration/state-repository';
import type { WorkflowSnapshot, WorkflowState } from '../iteration/state';
import { readTerminalV4State } from './v4/terminal-state-reader';

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Orchestrator state must be an object.');
  }
  return value as Record<string, unknown>;
}

/** Query an active v5 state or an immutable terminal v4 projection without enabling legacy writes. */
export function readStateSnapshot(cwd: string): WorkflowSnapshot {
  const path = statePath(cwd);
  if (!existsSync(path)) return normalizeState(DEFAULT_STATE);
  const raw = record(JSON.parse(readFileSync(path, 'utf8')) as unknown);
  return raw.workflow_version === 5
    ? normalizeState(raw as unknown as WorkflowState)
    : readTerminalV4State(raw);
}
