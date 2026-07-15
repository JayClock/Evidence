import { readState } from '../../iteration/state-repository';
import type { WorkflowState } from '../../iteration/state';

export function kickoffText(
  value: string,
  name: string,
  singleLine = false,
): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`Kickoff ${name} must not be empty.`);
  if (singleLine && /[\r\n]/.test(normalized)) {
    throw new Error(`Kickoff ${name} must be a single line.`);
  }
  return normalized;
}

export function requireKickoffState(cwd: string): WorkflowState {
  const state = readState(cwd);
  if (state.loop !== 'kickoff') {
    throw new Error(
      `Kickoff is only available in the kickoff loop; current loop is ${state.loop}.`,
    );
  }
  if (state.halted) {
    throw new Error(`Iteration is halted: ${state.halted.reason}`);
  }
  return state;
}
