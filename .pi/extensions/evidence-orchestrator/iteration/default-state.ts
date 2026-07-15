import type { WorkflowState } from './state';

/** Test/bootstrap shape only; an active iteration still requires a frozen Issue. */
export const DEFAULT_STATE: WorkflowState = {
  iteration_id: 'ITER-0001',
  loop: 'kickoff',
};
