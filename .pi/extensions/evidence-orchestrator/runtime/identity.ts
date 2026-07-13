import type { WorkflowState } from '../workflow/types';

export const EXTENSION_ID = 'evidence-orchestrator';
export const STATUS_KEY = EXTENSION_ID;
export const STATUS_PREFIX = 'orchestrator';

export function statusLabel(
  state: WorkflowState | undefined,
  activity?: 'subagent' | 'state-error',
): string {
  if (activity === 'state-error') return `${STATUS_PREFIX}:state-error`;
  if (!state) throw new Error('Workflow state is required for this status.');
  if (activity) return `${STATUS_PREFIX}:${state.phase}:${activity}`;
  return `${STATUS_PREFIX}:${state.phase}${state.pending_gate ? ':gate' : ''}`;
}
