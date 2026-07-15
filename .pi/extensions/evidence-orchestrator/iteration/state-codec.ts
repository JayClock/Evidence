import { FEEDBACK_LOOP_BY_TARGET } from './feedback-routing';
import { assertIterationId } from './artifact-layout';
import { LOOP_ORDER } from './transition-graph';
import type { ClarificationRecord, WorkflowState } from './state';

const UNSUPPORTED_STATE_FIELDS = [
  'workflow_version',
  'phase',
  'round',
  'pending_gate',
  'failures',
  'max_rounds',
  'gate_config',
  'last_failure',
] as const;
const STORY_ID_PATTERN = /^US-\d{3,}$/;
const SCENARIO_ID_PATTERN = /^SC-\d{3,}$/;
const COGNITIVE_MODES = new Set(['clear', 'complicated', 'complex']);
const KICKOFF_DECISIONS = new Set([
  'confirmed',
  'revise',
  'split',
  'deferred',
  'stopped',
]);
const UNDERSTAND_STAGES = new Set(['tqa', 'scenario_review', 'modeling']);
const UNDERSTANDING_DECISIONS = new Set([
  'confirmed',
  'continue',
  'split',
  'deferred',
]);
const MODELING_STAGES = new Set([
  'profile',
  'profile_review',
  'expansion',
  'candidate_ready',
  'challenged',
]);
const TASKING_STAGES = new Set([
  'drafting',
  'desk_check',
  'knowledge_gap',
  'approved',
]);
const PAIR_CHECKPOINTS = new Set([
  'plan_confirmed',
  'test_written',
  'red_observed',
  'implementation_written',
  'green_observed',
  'refactored',
  'quality_gate_failed',
  'quality_gates_passed',
]);
const SHOWCASE_STAGES = new Set([
  'setup',
  'reviewing',
  'decision',
  'accepted',
  'rejected',
]);
const RESPOND_STAGES = new Set(['drafting', 'decision', 'complete']);
const PI_METADATA_FIELDS = new Set(['last_command', 'last_run_at']);

function text(value: unknown): value is string {
  return typeof value === 'string' && Boolean(value.trim());
}

function textArray(value: unknown, allowEmpty = false): value is string[] {
  return (
    Array.isArray(value) &&
    (allowEmpty || value.length > 0) &&
    value.every((item) => text(item))
  );
}

function validPending(record: ClarificationRecord): boolean {
  return (
    text(record.question_id) &&
    STORY_ID_PATTERN.test(record.story_id) &&
    text(record.question) &&
    ['business_context', 'story', 'history'].includes(record.target) &&
    text(record.asked_at) &&
    record.answer === undefined &&
    record.answered_at === undefined &&
    record.waived_by === undefined
  );
}

function validHistory(record: ClarificationRecord): boolean {
  if (
    !text(record.question_id) ||
    !STORY_ID_PATTERN.test(record.story_id) ||
    !text(record.question) ||
    !['business_context', 'story', 'history'].includes(record.target) ||
    !text(record.asked_at)
  ) {
    return false;
  }
  const answered = text(record.answer) && text(record.answered_at);
  const waived =
    record.waived_by === 'human' &&
    text(record.waived_reason) &&
    text(record.waived_at);
  return answered !== waived;
}

function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function normalizeState(input: WorkflowState): WorkflowState {
  const state = jsonClone(input) as WorkflowState & Record<string, unknown>;
  assertIterationId(state.iteration_id);
  if (!LOOP_ORDER.includes(state.loop)) {
    throw new Error(
      `Unsupported Evidence Orchestrator loop: ${String(state.loop)}.`,
    );
  }
  for (const field of Object.keys(state)) {
    if (
      UNSUPPORTED_STATE_FIELDS.includes(
        field as (typeof UNSUPPORTED_STATE_FIELDS)[number],
      ) ||
      field.startsWith('paused_') ||
      field.includes('clarification_story_outcome')
    ) {
      throw new Error(`Unsupported workflow state field: ${field}.`);
    }
  }
  if (
    state.pi &&
    (Object.keys(state.pi).some((field) => !PI_METADATA_FIELDS.has(field)) ||
      (state.pi.last_command !== undefined && !text(state.pi.last_command)) ||
      (state.pi.last_run_at !== undefined && !text(state.pi.last_run_at)))
  ) {
    throw new Error('Pi runtime metadata is invalid.');
  }
  if (
    (state.feedback_history ?? []).some((feedback) => {
      const expected = FEEDBACK_LOOP_BY_TARGET[feedback.target];
      return (
        expected !== feedback.to_loop ||
        !LOOP_ORDER.includes(feedback.from_loop) ||
        !text(feedback.reason) ||
        !['human', 'system'].includes(feedback.decided_by) ||
        !text(feedback.recorded_at)
      );
    })
  ) {
    throw new Error('The workflow feedback history is invalid.');
  }
  if (
    state.kickoff_candidate &&
    (state.kickoff_candidate.version !== 1 ||
      !text(state.kickoff_candidate.title) ||
      !text(state.kickoff_candidate.problem) ||
      !text(state.kickoff_candidate.role) ||
      !text(state.kickoff_candidate.goal) ||
      !text(state.kickoff_candidate.value) ||
      !COGNITIVE_MODES.has(state.kickoff_candidate.cognitive_mode) ||
      !textArray(state.kickoff_candidate.source_refs) ||
      !text(state.kickoff_candidate.proposed_at) ||
      !text(state.kickoff_candidate.artifact_path))
  ) {
    throw new Error('The Kickoff candidate is invalid.');
  }
  if (
    (state.kickoff_decisions ?? []).some(
      (decision) =>
        !KICKOFF_DECISIONS.has(decision.action) ||
        decision.decided_by !== 'human' ||
        !text(decision.reason) ||
        !text(decision.decided_at) ||
        (decision.story_id !== undefined &&
          !STORY_ID_PATTERN.test(decision.story_id)),
    )
  ) {
    throw new Error('The Kickoff decision history is invalid.');
  }
  if (
    state.understand_stage !== undefined &&
    !UNDERSTAND_STAGES.has(state.understand_stage)
  ) {
    throw new Error(`Unsupported Understand stage: ${state.understand_stage}.`);
  }
  if (
    (state.scenario_drafts ?? []).some(
      (draft) =>
        draft.version !== 1 ||
        !/^DRAFT-\d{3,}$/.test(draft.draft_id) ||
        !STORY_ID_PATTERN.test(draft.story_id) ||
        !text(draft.title) ||
        !textArray(draft.given) ||
        !text(draft.when) ||
        !textArray(draft.then) ||
        !textArray(draft.business_data) ||
        !text(draft.proposed_at) ||
        !text(draft.artifact_path),
    )
  ) {
    throw new Error('The Scenario drafts are invalid.');
  }
  if (
    state.understand_stage === 'scenario_review' &&
    !state.scenario_drafts?.length
  ) {
    throw new Error('Scenario review requires at least one Scenario draft.');
  }
  if (
    (state.understanding_decisions ?? []).some(
      (decision) =>
        !UNDERSTANDING_DECISIONS.has(decision.action) ||
        decision.decided_by !== 'human' ||
        !text(decision.reason) ||
        !text(decision.decided_at),
    )
  ) {
    throw new Error('The Understand decision history is invalid.');
  }
  if (
    state.confirmed_scenario &&
    (state.confirmed_scenario.version !== 1 ||
      !STORY_ID_PATTERN.test(state.confirmed_scenario.story_id) ||
      !SCENARIO_ID_PATTERN.test(state.confirmed_scenario.scenario_id) ||
      !textArray(state.confirmed_scenario.given) ||
      !text(state.confirmed_scenario.when) ||
      !textArray(state.confirmed_scenario.then) ||
      !textArray(state.confirmed_scenario.business_data) ||
      state.confirmed_scenario.confirmed_by !== 'human' ||
      !text(state.confirmed_scenario.confirmation_reason) ||
      !text(state.confirmed_scenario.confirmed_at))
  ) {
    throw new Error('The confirmed Scenario is invalid.');
  }
  if (
    state.modeling_stage !== undefined &&
    !MODELING_STAGES.has(state.modeling_stage)
  ) {
    throw new Error(`Unsupported modeling stage: ${state.modeling_stage}.`);
  }
  if (
    state.modeling_stage === 'profile_review' &&
    !state.modeling_profile_proposal
  ) {
    throw new Error('Modeling Profile review requires an AI proposal.');
  }
  if (
    ['expansion', 'candidate_ready', 'challenged'].includes(
      state.modeling_stage ?? '',
    ) &&
    !state.modeling_profile
  ) {
    throw new Error(`${state.modeling_stage} requires a confirmed Profile.`);
  }
  if (
    ['candidate_ready', 'challenged'].includes(state.modeling_stage ?? '') &&
    (!text(state.model_expansion_path) || !text(state.model_git_baseline))
  ) {
    throw new Error('A model candidate requires expansion and Git baseline.');
  }
  if (
    state.tasking_stage !== undefined &&
    !TASKING_STAGES.has(state.tasking_stage)
  ) {
    throw new Error(`Unsupported Tasking stage: ${state.tasking_stage}.`);
  }
  if (state.tasking_stage === 'desk_check' && !state.tasking_candidate) {
    throw new Error('Tasking Desk Check requires a candidate plan.');
  }
  if (
    state.tasking_stage === 'approved' &&
    (!text(state.approved_test_plan_path) ||
      !text(state.approved_test_plan_sha256) ||
      state.active_work_item?.test_plan.version !== 2)
  ) {
    throw new Error(
      'Approved Tasking requires an immutable v2 test plan and work item.',
    );
  }
  if (
    state.active_work_item &&
    (!STORY_ID_PATTERN.test(state.active_work_item.story_id) ||
      !SCENARIO_ID_PATTERN.test(state.active_work_item.scenario_id) ||
      !text(state.active_work_item.git_baseline) ||
      state.active_work_item.test_plan.version !== 2 ||
      state.active_work_item.test_plan.processes.length === 0 ||
      state.active_work_item.test_plan.processes.some(
        (process) =>
          process.process_version !== 2 ||
          !text(process.id) ||
          !text(process.path) ||
          !textArray(process.functional_contexts) ||
          !textArray(process.technical_boundaries) ||
          !text(process.definition_sha256) ||
          !textArray(process.selected_step_ids) ||
          !process.command_variables ||
          !Array.isArray(process.focused_commands) ||
          process.focused_commands.length === 0 ||
          !text(process.materialized_sha256) ||
          !text(process.materialized_plan_path),
      ))
  ) {
    throw new Error('The active work item is invalid.');
  }
  if (
    state.pair_session &&
    (state.pair_session.version !== 1 ||
      !PAIR_CHECKPOINTS.has(state.pair_session.checkpoint) ||
      !text(state.pair_session.process_id) ||
      !text(state.pair_session.step_id) ||
      !text(state.pair_session.git_baseline) ||
      !Array.isArray(state.pair_session.completed_step_ids) ||
      !Array.isArray(state.pair_session.test_paths) ||
      !Array.isArray(state.pair_session.production_paths) ||
      !Array.isArray(state.pair_session.accepted_reds) ||
      !Array.isArray(state.pair_session.feedback) ||
      !Array.isArray(state.pair_session.driver_history))
  ) {
    throw new Error('The Pair session is invalid.');
  }
  if (
    state.pair_session &&
    (!state.active_work_item ||
      state.pair_session.story_id !== state.active_work_item.story_id ||
      state.pair_session.scenario_id !== state.active_work_item.scenario_id ||
      state.pair_session.git_baseline !== state.active_work_item.git_baseline)
  ) {
    throw new Error('The Pair session must retain its work item baseline.');
  }
  if (state.loop === 'pair' && !state.pair_session) {
    throw new Error('The Pair loop requires an approved Pair session.');
  }
  if (
    state.showcase_stage !== undefined &&
    !SHOWCASE_STAGES.has(state.showcase_stage)
  ) {
    throw new Error(`Unsupported Showcase stage: ${state.showcase_stage}.`);
  }
  if (state.loop === 'showcase' && !state.showcase_stage) {
    throw new Error('The Showcase loop requires a Showcase stage.');
  }
  if (
    state.respond_stage !== undefined &&
    !RESPOND_STAGES.has(state.respond_stage)
  ) {
    throw new Error(`Unsupported Respond stage: ${state.respond_stage}.`);
  }
  if (state.loop === 'respond' && !state.respond_stage) {
    throw new Error('The Respond loop requires a Respond stage.');
  }
  if (state.respond_stage === 'decision' && !state.respond_candidate) {
    throw new Error('Respond decision requires a candidate.');
  }
  if (
    state.respond_stage === 'complete' &&
    (!text(state.knowledge_promotion_path) || !state.next_probe)
  ) {
    throw new Error(
      'Completed Respond requires promotion evidence and next Probe.',
    );
  }
  if (
    state.active_clarification_story &&
    (state.loop !== 'understand' ||
      !STORY_ID_PATTERN.test(state.active_clarification_story.story_id) ||
      !text(state.active_clarification_story.selected_at))
  ) {
    throw new Error('The single active clarification Story is invalid.');
  }
  if (
    state.pending_clarification &&
    (state.loop !== 'understand' ||
      state.understand_stage !== 'tqa' ||
      !validPending(state.pending_clarification) ||
      state.pending_clarification.story_id !==
        state.active_clarification_story?.story_id)
  ) {
    throw new Error('The pending clarification is invalid.');
  }
  if (
    (state.clarification_history ?? []).some(
      (clarification) => !validHistory(clarification),
    )
  ) {
    throw new Error('Clarification history is invalid.');
  }
  if (
    state.halted &&
    (String(state.halted.loop) === 'complete' ||
      !LOOP_ORDER.includes(state.halted.loop) ||
      !text(state.halted.reason) ||
      !text(state.halted.recorded_at))
  ) {
    throw new Error('The workflow halt record is invalid.');
  }
  return state;
}
