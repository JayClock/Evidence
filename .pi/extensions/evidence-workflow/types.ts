export type Phase =
  | 'requirements'
  | 'domain_model'
  | 'architecture'
  | 'planning'
  | 'coding'
  | 'review'
  | 'complete';
export type GateMode = 'auto' | 'review' | 'review_if' | 'override';

export interface MetaState {
  phase: Phase;
  round: number;
  pending_gate: string | null;
  failures: number;
  max_rounds: number;
  artifacts: string[];
  gate_config: Record<string, GateMode>;
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
