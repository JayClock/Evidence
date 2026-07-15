import type { WorkflowSnapshot } from '../iteration/state';

export const EXTENSION_ID = 'evidence-orchestrator';
export const STATUS_KEY = EXTENSION_ID;
export const STATUS_PREFIX = 'orchestrator';
export const ACTIVITY_RESULT_MESSAGE_TYPE =
  'evidence-orchestrator-activity-result';

export function statusLabel(
  state: WorkflowSnapshot | undefined,
  activity?: 'subagent' | 'state-error',
): string {
  if (activity === 'state-error') return `${STATUS_PREFIX}:state-error`;
  if (!state) throw new Error('Workflow state is required for this status.');
  const current =
    state.workflow_version === 5 ? state.loop : `legacy-${state.terminal}`;
  return `${STATUS_PREFIX}:${current}${activity ? `:${activity}` : ''}`;
}
