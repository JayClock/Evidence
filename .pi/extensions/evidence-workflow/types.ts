export type Phase =
  | 'frame'
  | 'clarify'
  | 'specify'
  | 'validate'
  | 'domain_model'
  | 'architecture'
  | 'planning'
  | 'coding'
  | 'review'
  | 'learn'
  | 'complete';
export type GateMode = 'auto' | 'review' | 'review_if' | 'override';

export interface ActiveWorkItem {
  story_id: string;
  scenario_id: string;
  /** Immutable Git HEAD captured before this scenario's Red step. */
  git_baseline: string;
}

export interface WorkflowState {
  phase: Phase;
  round: number;
  pending_gate: string | null;
  failures: number;
  max_rounds: number;
  artifacts: string[];
  gate_config: Record<string, GateMode>;
  active_work_item?: ActiveWorkItem;
  pi?: {
    enabled: boolean;
    version: number;
    last_command?: string;
    last_run_at?: string;
    last_completed_phase?: Phase;
  };
}

export interface PhaseMeta {
  title: string;
  skill: string;
  inputs: string[];
  outputs: string[];
  gateId: string;
  gateTitle: string;
}
