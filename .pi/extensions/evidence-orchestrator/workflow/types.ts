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
export type ClarificationTarget = 'business_context' | 'story' | 'history';
export type ClarificationStoryOutcome =
  | 'clarified'
  | 'needs_split'
  | 'deferred';
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

/** Ordered, cross-runtime test processes selected for one vertical scenario. */
export interface TestPlan {
  version: 1;
  /** Requires execution records when selected by an Issue-backed iteration. */
  execution_evidence_version?: 1;
  processes: TestProcessSelection[];
}

export interface ActiveWorkItem {
  story_id: string;
  scenario_id: string;
  /** Immutable Git HEAD captured before this scenario's Red step. */
  git_baseline: string;
  /** @deprecated Single-process compatibility projection; use test_plan. */
  test_process?: TestProcessSelection;
  /** Immutable ordered test plan; supports one or more runtime-specific processes. */
  test_plan?: TestPlan;
}

export interface ClarificationRecord {
  question_id: string;
  story_id: string;
  question: string;
  target: ClarificationTarget;
  asked_at: string;
  answer?: string;
  answered_at?: string;
}

export interface ActiveClarificationStory {
  story_id: string;
  selected_at: string;
}

/** AI-authored recommendation that cannot release or disposition a story. */
export interface ClarificationStoryOutcomeProposal {
  story_id: string;
  outcome: ClarificationStoryOutcome;
  summary: string;
  proposed_at: string;
}

export interface ClarificationStoryOutcomeRecord {
  story_id: string;
  outcome: ClarificationStoryOutcome;
  summary: string;
  completed_at: string;
  /** Present on human-confirmed records; absent only on legacy iterations. */
  decided_by?: 'human';
  confirmed_at?: string;
  proposal?: ClarificationStoryOutcomeProposal;
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
  /** Upstream requirement authority; local files are immutable iteration snapshots. */
  requirement_source?: GitHubIssueRequirementSource;
  active_work_item?: ActiveWorkItem;
  /** Story currently in focus; selecting another story pauses this one's open work. */
  active_clarification_story?: ActiveClarificationStory;
  /** AI recommendation awaiting a decision for the story currently in focus. */
  proposed_clarification_story_outcome?: ClarificationStoryOutcomeProposal;
  /** Recommendations paused while another story is in focus. */
  paused_clarification_story_outcome_proposals?: ClarificationStoryOutcomeProposal[];
  /** Final, human-confirmed story-level dispositions for the active iteration. */
  clarification_story_outcomes?: ClarificationStoryOutcomeRecord[];
  /** TQA question awaiting an answer for the story currently in focus. */
  pending_clarification?: ClarificationRecord;
  /** Questions paused while another story is in focus. */
  paused_clarifications?: ClarificationRecord[];
  /** Immutable, answered TQA exchanges for the active iteration. */
  clarification_history?: ClarificationRecord[];
  last_failure?: PhaseFailure;
  halted?: WorkflowHalt;
  pi?: {
    enabled: boolean;
    version: number;
    /** New Issue-backed iterations require tool-observed test execution records. */
    execution_evidence_version?: 1;
    last_command?: string;
    last_run_at?: string;
    last_completed_phase?: Phase;
  };
}

export interface PhaseMeta {
  title: string;
  inputs: string[];
  outputs: string[];
  gateId: string;
  gateTitle: string;
}
