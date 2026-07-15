import type { FeedbackTarget, WorkflowLoop } from './state';

/** Route a knowledge gap to the loop that owns the missing knowledge. */
export const FEEDBACK_LOOP_BY_TARGET: Record<FeedbackTarget, WorkflowLoop> = {
  problem: 'kickoff',
  business_knowledge: 'understand',
  scenario: 'understand',
  model: 'understand',
  modeling_method: 'understand',
  architecture: 'tasking',
  test_strategy: 'tasking',
  test_process: 'tasking',
  test: 'pair',
  implementation: 'pair',
  refactor: 'pair',
  value_validation: 'showcase',
  showcase_setup: 'showcase',
};
