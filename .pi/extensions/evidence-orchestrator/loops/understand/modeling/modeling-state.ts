import { readState } from '../../../iteration/state-repository';
import type { WorkflowState } from '../../../iteration/state';

export function modelingText(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} must not be empty.`);
  return normalized;
}

export function modelingStrings(
  value: string[],
  name: string,
  allowEmpty = true,
): string[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    throw new Error(
      `${name} must be ${allowEmpty ? 'an' : 'a non-empty'} array.`,
    );
  }
  const normalized = value.map((entry, index) =>
    modelingText(entry, `${name}[${index}]`),
  );
  if (new Set(normalized).size !== normalized.length) {
    throw new Error(`${name} must not contain duplicates.`);
  }
  return normalized;
}

export function requireModelingState(cwd: string): WorkflowState {
  const state = readState(cwd);
  if (
    state.loop !== 'understand' ||
    state.understand_stage !== 'modeling' ||
    !(state.confirmed_scenarios?.length || state.confirmed_scenario)
  ) {
    throw new Error(
      'Modeling is only available for a human-confirmed Scenario Set in the Understand modeling stage.',
    );
  }
  if (state.halted) {
    throw new Error(`Iteration is halted: ${state.halted.reason}`);
  }
  return state;
}
