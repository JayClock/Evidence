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
export type GateDecisionAction = 'approve' | 'revise' | 'reject';

export interface ActiveWorkItem {
  story_id: string;
  scenario_id: string;
  /** Immutable Git HEAD captured before this scenario's Red step. */
  git_baseline: string;
}

export interface PhaseFailure {
  phase: Exclude<Phase, 'complete'>;
  round: number;
  summary: string;
  recorded_at: string;
}

export interface WorkflowHalt {
  phase: Exclude<Phase, 'complete'>;
  reason: string;
  recorded_at: string;
}

export interface WorkflowState {
  /** Immutable namespace for this iteration's generated artifacts and gates. */
  iteration_id: string;
  phase: Phase;
  /** Number of retries for the current phase. */
  round: number;
  pending_gate: string | null;
  failures: number;
  max_rounds: number;
  artifacts: string[];
  gate_config: Record<string, GateMode>;
  active_work_item?: ActiveWorkItem;
  last_failure?: PhaseFailure;
  halted?: WorkflowHalt;
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
