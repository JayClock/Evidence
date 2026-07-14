export type ActivePhase =
  | 'kickoff'
  | 'discover'
  | 'model'
  | 'design'
  | 'build'
  | 'showcase'
  | 'learn';
export type Phase = 'idle' | ActivePhase | 'complete';
export type GateMode = 'auto' | 'review' | 'review_if' | 'override';
export type GateDecisionAction = 'approve' | 'revise' | 'reject';
export type TestProcessRuntime = 'rust' | 'typescript' | 'tauri';
export type TestDouble = 'real' | 'fake' | 'stub' | 'spy' | 'mock';

export interface GitHubIssueRequirementSource {
  type: 'github_issue';
  repository: string;
  issue_number: number;
  url: string;
  snapshot_path: string;
  projection_path: string;
  content_hash: string;
  issue_updated_at: string;
  fetched_at: string;
}

export interface TestProcessSelection {
  id: string;
  path: string;
  runtime: TestProcessRuntime;
  functional_contexts: string[];
}

/** Ordered test processes selected for the single active vertical scenario. */
export interface TestPlan {
  version: 1;
  processes: TestProcessSelection[];
}

export interface ActiveWorkItem {
  story_id: string;
  scenario_id: string;
  /** Immutable Git HEAD captured before this scenario's first Red step. */
  git_baseline: string;
  test_plan?: TestPlan;
}

export interface ClarificationRecord {
  question_id: string;
  story_id: string;
  thought: string;
  question: string;
  asked_at: string;
  answer?: string;
  answered_at?: string;
}

export interface PhaseFailure {
  phase: ActivePhase;
  round: number;
  summary: string;
  recorded_at: string;
}

export interface WorkflowHalt {
  phase: ActivePhase;
  reason: string;
  recorded_at: string;
}

export interface WorkflowState {
  /** State schema. Earlier workflow states are intentionally unsupported. */
  version: 2;
  /** Null only when no iteration has been started in this checkout. */
  iteration_id: string | null;
  phase: Phase;
  round: number;
  pending_gate: string | null;
  failures: number;
  max_rounds: number;
  artifacts: string[];
  gate_config: Record<ActivePhase, GateMode>;
  requirement_source?: GitHubIssueRequirementSource;
  active_work_item?: ActiveWorkItem;
  /** The sole TQA question waiting for an explicit domain-expert answer. */
  pending_clarification?: ClarificationRecord;
  /** Answered TQA exchanges for this iteration's single Story. */
  clarification_history?: ClarificationRecord[];
  last_failure?: PhaseFailure;
  halted?: WorkflowHalt;
  pi?: {
    enabled: boolean;
    version: number;
    last_command?: string;
    last_run_at?: string;
    last_completed_phase?: ActivePhase;
  };
}

export interface PhaseMeta {
  title: string;
  inputs: string[];
  outputs: string[];
  gateId: string;
  gateTitle: string;
}
