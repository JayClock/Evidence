import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_STATE } from './phases';
import type { MetaState } from './types';

export function statePath(cwd: string): string {
  return join(cwd, 'evidence-state.json');
}

function readJsonFile<T>(path: string): T | undefined {
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

export function normalizeState(state: MetaState): MetaState {
  return {
    ...DEFAULT_STATE,
    ...state,
    gate_config: { ...DEFAULT_STATE.gate_config, ...(state.gate_config ?? {}) },
    pi: { enabled: true, version: 3, ...(state.pi ?? {}) },
  };
}

export function readState(cwd: string): MetaState {
  return normalizeState(
    readJsonFile<MetaState>(statePath(cwd)) ?? DEFAULT_STATE,
  );
}

export function writeState(cwd: string, state: MetaState): MetaState {
  const normalized = normalizeState(state);
  writeFileSync(statePath(cwd), `${JSON.stringify(normalized, null, 2)}\n`);
  return normalized;
}
