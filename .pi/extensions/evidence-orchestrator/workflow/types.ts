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
export type WorkflowVersion = 4 | 5;
export type WorkflowLoop =
  | 'kickoff'
  | 'understand'
  | 'tasking'
  | 'pair'
  | 'showcase'
  | 'respond'
  | 'complete';
export type FeedbackTarget =
  | 'problem'
  | 'business_knowledge'
  | 'scenario'
  | 'model'
  | 'modeling_method'
  | 'architecture'
  | 'test_strategy'
  | 'test_process'
  | 'test'
  | 'implementation'
  | 'refactor'
  | 'value_validation';
export type FeedbackDecider = 'human' | 'system';
export type CognitiveMode = 'clear' | 'complicated' | 'complex';
export type KickoffDecisionAction =
  | 'confirmed'
  | 'revise'
  | 'split'
  | 'deferred'
  | 'stopped';
export type UnderstandStage = 'tqa' | 'scenario_review' | 'modeling';
export type UnderstandingDecisionAction =
  | 'confirmed'
  | 'continue'
  | 'split'
  | 'deferred';
export type ModelingSubject = 'business' | 'domain' | 'tool';
export type ModelingMethod =
  | 'none'
  | 'object'
  | 'event'
  | 'four_color'
  | 'eight_x_flow'
  | 'algorithmic';
export type ModelChangeRequirement = boolean | 'unknown';
export type ModelingStage =
  | 'profile'
  | 'profile_review'
  | 'expansion'
  | 'candidate_ready'
  | 'challenged';
export type ModelOperationAction = 'add' | 'update' | 'remove';
export type ModelElementKind = 'entity' | 'association';
export type GateMode = 'auto' | 'review' | 'review_if' | 'override';
export type GateDecisionAction = 'approve' | 'revise' | 'reject';
export type ClarificationTarget = 'business_context' | 'story' | 'history';
export type ClarificationStoryOutcome =
  | 'clarified'
  | 'needs_split'
  | 'deferred';
export type TestProcessRuntime = 'rust' | 'typescript' | 'tauri';
export type TestDouble = 'real' | 'fake' | 'stub' | 'spy' | 'mock';
export type TaskingStage =
  | 'drafting'
  | 'desk_check'
  | 'knowledge_gap'
  | 'approved';
export type DeskCheckAction =
  | 'approve'
  | 'revise'
  | 'architecture_gap'
  | 'process_gap'
  | 'scenario_gap';
export type PairCheckpoint =
  | 'plan_confirmed'
  | 'test_written'
  | 'red_observed'
  | 'implementation_written'
  | 'green_observed'
  | 'refactored'
  | 'quality_gate_failed'
  | 'quality_gates_passed';
export type PairDriverMode = 'test' | 'implementation' | 'refactor';
export type PairDeterministicAction =
  | 'run_red'
  | 'run_green'
  | 'run_refactor'
  | 'run_quality_gate';
export type RedFailureKind =
  | 'behavior'
  | 'compile'
  | 'dependency'
  | 'configuration'
  | 'network'
  | 'fixture'
  | 'other';

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

export interface MaterializedTestCommand {
  step_id: string;
  command: string;
}

export interface TestProcessSelection {
  id: string;
  path: string;
  runtime: TestProcessRuntime;
  functional_contexts: string[];
  /** Present for v2 plans; runtime and technical boundaries are independent dimensions. */
  technical_boundaries?: string[];
  process_version?: 1 | 2;
  /** Hash of the immutable snapshotted process definition. */
  definition_sha256?: string;
  /** Ordered v2 steps applicable to this Scenario's selected capabilities. */
  selected_step_ids?: string[];
  /** Whitelist inputs retained so commands can be deterministically re-materialized. */
  command_variables?: Record<string, string>;
  /** Whitelist-expanded commands locked before Pairing. */
  focused_commands?: MaterializedTestCommand[];
  materialized_sha256?: string;
  materialized_plan_path?: string;
}

/** Ordered, cross-runtime test processes selected for one vertical scenario. */
export interface TestPlan {
  version: 1 | 2;
  /** Requires execution records when selected by an Issue-backed iteration. */
  execution_evidence_version?: 1;
  processes: TestProcessSelection[];
}

export interface TaskingTestItem {
  id: string;
  quadrant: 'Q1' | 'Q2';
  intent: string;
  runtime_plan_id: string;
  process_id: string;
  step_id: string;
  supported_by: string[];
  scenario_outcome?: string;
  business_data: string[];
}

export interface TaskingImplementationTask {
  id: string;
  description: string;
  test_ids: string[];
  depends_on: string[];
}

export interface TaskingCandidate {
  version: 1;
  draft_id: string;
  story_id: string;
  scenario_id: string;
  tests: TaskingTestItem[];
  tasks: TaskingImplementationTask[];
  processes: TestProcessSelection[];
  test_list_path: string;
  task_list_path: string;
  candidate_path: string;
  test_list_sha256: string;
  task_list_sha256: string;
  candidate_sha256: string;
  proposed_at: string;
}

export interface TaskingGap {
  kind: 'architecture_gap' | 'process_gap';
  reason: string;
  recorded_at: string;
}

export interface DeskCheckDecision {
  action: DeskCheckAction;
  reason: string;
  draft_id?: string;
  candidate_sha256?: string;
  decided_by: 'human';
  artifact_path: string;
  decided_at: string;
}

export interface PairObservation {
  process_id: string;
  step_id?: string;
  stage: 'red' | 'green' | 'refactor' | 'quality_gate';
  command: string;
  sequence: number;
  exit_code: number;
  expected_failure: boolean;
  accepted?: boolean;
  failure_kind?: RedFailureKind;
  review_reason?: string;
  reviewed_at?: string;
}

export interface PairFeedbackRecord {
  action:
    | 'back_test'
    | 'back_implementation'
    | 'back_tasking'
    | 'reject_red'
    | 'retry_quality'
    | 'driver_blocked';
  reason: string;
  decided_by: 'human' | 'system';
  recorded_at: string;
}

export interface PairDriverRecord {
  mode: PairDriverMode;
  process_id: string;
  step_id: string;
  changed_paths: string[];
  diff_sha256: string;
  summary: string;
  completed_at: string;
}

export interface PairSession {
  version: 1;
  story_id: string;
  scenario_id: string;
  git_baseline: string;
  checkpoint: PairCheckpoint;
  process_id: string;
  step_id: string;
  completed_step_ids: string[];
  test_paths: string[];
  production_paths: string[];
  expected_red: string;
  accepted_reds: PairObservation[];
  red_observation?: PairObservation;
  last_observation?: PairObservation;
  quality_gate_index: number;
  feedback: PairFeedbackRecord[];
  driver_history: PairDriverRecord[];
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
  /** Human explicitly ended the Story without requiring this answer. */
  waived_by?: 'human';
  waived_reason?: string;
  waived_at?: string;
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
  /** Absent when the human directly completes the Story without an AI proposal. */
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

export interface KickoffCandidate {
  version: 1;
  title: string;
  problem: string;
  role: string;
  goal: string;
  value: string;
  cognitive_mode: CognitiveMode;
  source_refs: string[];
  proposed_at: string;
  artifact_path: string;
}

export interface KickoffDecision {
  action: KickoffDecisionAction;
  reason: string;
  decided_by: 'human';
  decided_at: string;
  story_id?: string;
}

export interface ScenarioDraft {
  version: 1;
  draft_id: string;
  story_id: string;
  title: string;
  given: string[];
  when: string;
  then: string[];
  business_data: string[];
  proposed_at: string;
  artifact_path: string;
}

export interface ConfirmedScenario {
  version: 1;
  story_id: string;
  scenario_id: string;
  source_draft_id: string;
  title: string;
  given: string[];
  when: string;
  then: string[];
  business_data: string[];
  artifact_path: string;
  confirmed_by: 'human';
  confirmation_reason: string;
  confirmed_at: string;
}

export interface UnderstandingDecision {
  action: UnderstandingDecisionAction;
  reason: string;
  decided_by: 'human';
  decided_at: string;
  draft_id?: string;
  scenario_id?: string;
}

export interface ModelingProfileProposal {
  version: 1;
  subject: ModelingSubject;
  method: ModelingMethod;
  model_change_required: ModelChangeRequirement;
  reason: string;
  proposed_at: string;
}

export interface ConfirmedModelingProfile {
  version: 1;
  subject: ModelingSubject;
  method: ModelingMethod;
  model_change_required: boolean;
  reason: string;
  confirmed_by: 'human';
  confirmed_at: string;
  proposal?: ModelingProfileProposal;
}

export interface ModelOperation {
  action: ModelOperationAction;
  kind: ModelElementKind;
  id: string;
  path: string;
  content?: string;
  expected_sha256?: string;
}

export interface ModelChangeProposal {
  version: 1;
  story_id: string;
  scenario_id: string;
  git_baseline: string;
  reason: string;
  operations: ModelOperation[];
  artifact_path: string;
  proposed_at: string;
}

export interface ModelChangeApplication {
  git_baseline: string;
  changed_paths: string[];
  applied_at: string;
}

export interface ModelProjectionRecord {
  version: 1;
  model_sha256: string;
  mermaid_path: string;
  glossary_path: string;
  context_path: string;
  regression_ids: string[];
  regression_failures: string[];
  method_failures: string[];
  generated_at: string;
}

export type ModelChallengeOutcome =
  | 'pass'
  | 'scenario_gap'
  | 'model_gap'
  | 'method_gap';

export interface ModelChallengeRecord {
  version: 1;
  requested_outcome: ModelChallengeOutcome;
  outcome: ModelChallengeOutcome;
  summary: string;
  checked_regression_ids: string[];
  projection_sha256: string;
  artifact_path: string;
  challenged_by: 'model-challenger';
  challenged_at: string;
}

export interface WorkflowFeedback {
  target: FeedbackTarget;
  from_loop: WorkflowLoop;
  to_loop: WorkflowLoop;
  reason: string;
  decided_by: FeedbackDecider;
  recorded_at: string;
}

export interface WorkflowState {
  /** Immutable namespace for this iteration's generated artifacts and gates. */
  iteration_id: string;
  /** Absent means a legacy v4 state. New iterations always write version 5. */
  workflow_version?: WorkflowVersion;
  /** Primary v5 knowledge activity. */
  loop?: WorkflowLoop;
  /** One AI-authored candidate awaiting a human Kickoff decision. */
  kickoff_candidate?: KickoffCandidate;
  /** Immutable human decisions made during Kickoff. */
  kickoff_decisions?: KickoffDecision[];
  understand_stage?: UnderstandStage;
  /** AI-authored examples awaiting one human Scenario decision. */
  scenario_drafts?: ScenarioDraft[];
  confirmed_scenario?: ConfirmedScenario;
  understanding_decisions?: UnderstandingDecision[];
  modeling_stage?: ModelingStage;
  modeling_profile_proposal?: ModelingProfileProposal;
  modeling_profile?: ConfirmedModelingProfile;
  model_expansion_path?: string;
  model_git_baseline?: string;
  model_change_proposal?: ModelChangeProposal;
  model_change_application?: ModelChangeApplication;
  model_projection?: ModelProjectionRecord;
  model_challenges?: ModelChallengeRecord[];
  tasking_stage?: TaskingStage;
  tasking_candidate?: TaskingCandidate;
  tasking_gap?: TaskingGap;
  desk_check_decisions?: DeskCheckDecision[];
  approved_test_plan_path?: string;
  approved_test_plan_sha256?: string;
  pair_session?: PairSession;
  /** @deprecated v5 compatibility projection used until v4 phase code is removed. */
  phase: Phase;
  feedback_history?: WorkflowFeedback[];
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
  /** Immutable, answered or human-waived TQA exchanges for the iteration. */
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
