import type { WorkflowState } from '../../iteration/state';

export const EXTENSION_ID = 'evidence-orchestrator';
export const STATUS_KEY = EXTENSION_ID;
export const STATUS_PREFIX = 'orchestrator';
export const ACTIVITY_RESULT_MESSAGE_TYPE =
  'evidence-orchestrator-activity-result';
export const ACTIVITY_RESULT_ENTRY_TYPE =
  'evidence-orchestrator-activity-result-entry';

export function statusLabel(
  state: WorkflowState | undefined,
  activity?: 'agent' | 'state-error',
): string {
  if (activity === 'state-error') return `${STATUS_PREFIX}:state-error`;
  if (!state) return `${STATUS_PREFIX}:idle`;
  return `${STATUS_PREFIX}:${state.loop}${activity ? `:${activity}` : ''}`;
}
