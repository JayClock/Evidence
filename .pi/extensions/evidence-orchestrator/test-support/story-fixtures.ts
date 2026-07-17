import { decideDeliveryIncrement } from '../loops/pair/coding-approval';
import type { WorkflowState } from '../iteration/state';

/** Record the explicit coding approval used to prepare Showcase test fixtures. */
export function approveStoryCodingForTest(
  cwd: string,
  now = new Date().toISOString(),
): WorkflowState {
  return decideDeliveryIncrement(
    cwd,
    'showcase',
    'Test fixture approves the completed Story for integrated value review.',
    now,
  );
}
