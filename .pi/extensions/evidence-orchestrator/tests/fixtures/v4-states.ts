import { DEFAULT_STATE } from '../../workflow/phase-catalog';
import type { WorkflowState } from '../../workflow/types';

export const V4_COMPLETE_STATE: WorkflowState = {
  ...DEFAULT_STATE,
  phase: 'complete',
  pi: { enabled: true, version: 4 },
};

export const V4_HALTED_STATE: WorkflowState = {
  ...DEFAULT_STATE,
  phase: 'frame',
  halted: {
    phase: 'frame',
    reason: 'The domain expert stopped this iteration.',
    recorded_at: '2026-01-01T00:00:00.000Z',
  },
  pi: { enabled: true, version: 4 },
};

export const V4_ACTIVE_STATE: WorkflowState = {
  ...DEFAULT_STATE,
  phase: 'clarify',
  pi: { enabled: true, version: 4 },
};

export const V4_STATE_FIXTURES = [
  V4_COMPLETE_STATE,
  V4_HALTED_STATE,
  V4_ACTIVE_STATE,
] as const;
