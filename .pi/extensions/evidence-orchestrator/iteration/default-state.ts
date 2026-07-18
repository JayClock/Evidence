import type { WorkflowState } from './state';

/** Test/bootstrap shape for one worktree-local Story; it carries no Board authority. */
export const DEFAULT_STATE: WorkflowState = {
  iteration_id: 'ITER-0001',
  loop: 'kickoff',
};
