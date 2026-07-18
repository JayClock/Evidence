import type { FlowLane } from '../../iteration/board-state';

export type ActiveFlowLane = Exclude<FlowLane, 'done'>;
export type FlowCondition =
  | 'runnable'
  | 'waiting_human'
  | 'queued'
  | 'blocked'
  | 'terminal';

export interface FlowPolicy {
  max_active_stories: number;
  lanes: Record<ActiveFlowLane, number>;
  resources: {
    pair_runner: number;
    activity_per_story: number;
  };
  lease_timeout_ms: number;
}

export interface FlowPolicySnapshot {
  path: string;
  sha256: string;
  policy: FlowPolicy;
}

export interface FlowProjection {
  desired_lane: FlowLane;
  condition: FlowCondition;
  blocker?: string;
}

export type AdmissionKind =
  | 'unchanged'
  | 'admitted'
  | 'queued'
  | 'terminal'
  | 'rework_overflow';

export interface AdmissionOutcome {
  iteration_id: string;
  kind: AdmissionKind;
  admitted_lane: FlowLane;
  pending_lane?: FlowLane;
  policy_sha256: string;
}
