import { FEEDBACK_LOOP_BY_TARGET } from './feedback-routing';
import { assertIterationId } from './artifact-layout';
import { LOOP_ORDER } from './transition-graph';
import type { ClarificationRecord, WorkflowState } from './state';

const WORKFLOW_STATE_FIELDS: Readonly<Record<keyof WorkflowState, true>> = {
  iteration_id: true,
  loop: true,
  kickoff_candidate: true,
  kickoff_decisions: true,
  understand_stage: true,
  scenario_drafts: true,
  confirmed_scenarios: true,
  understanding_decisions: true,
  modeling_stage: true,
  modeling_profile_proposal: true,
  modeling_profile: true,
  model_expansion_path: true,
  model_git_baseline: true,
  model_change_proposal: true,
  model_change_application: true,
  model_projection: true,
  model_challenges: true,
  model_decisions: true,
  tasking_stage: true,
  tasking_candidate: true,
  tasking_gap: true,
  desk_check_decisions: true,
  approved_test_plan_path: true,
  approved_test_plan_sha256: true,
  pair_session: true,
  showcase_stage: true,
  showcase_q2_observations: true,
  showcase_risk_decisions: true,
  showcase_product_observations: true,
  showcase_evaluation_observations: true,
  showcase_reviews: true,
  showcase_decisions: true,
  showcase_review_failures: true,
  respond_stage: true,
  respond_candidate: true,
  respond_decisions: true,
  knowledge_promotion_path: true,
  next_probe: true,
  feedback_history: true,
  intake_snapshot: true,
  active_work_item: true,
  completed_work_items: true,
  active_clarification_story: true,
  pending_clarification: true,
  clarification_history: true,
  halted: true,
  pi: true,
};
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
  'model_review',
  'model_confirmed',
]);
const TASKING_STAGES = new Set([
  'drafting',
  'desk_check',
  'knowledge_gap',
  'approved',
]);
const DESK_CHECK_ACTIONS = new Set([
  'approve',
  'revise',
  'architecture_gap',
  'process_gap',
  'scenario_gap',
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

function validModelRefs(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const refs = value as { entities?: unknown; associations?: unknown };
  return textArray(refs.entities, true) && textArray(refs.associations, true);
}

function validIntakeSnapshot(value: WorkflowState['intake_snapshot']): boolean {
  if (!value) return true;
  return (
    value.version === 1 &&
    /^CAND-\d{4,}$/.test(value.candidate_id) &&
    text(value.candidate_snapshot_path) &&
    /^sha256:[a-f0-9]{64}$/.test(value.candidate_snapshot_sha256) &&
    Array.isArray(value.source_revisions) &&
    value.source_revisions.length > 0 &&
    value.source_revisions.every(
      ({ inbox_id, revision_sha256, snapshot_path, snapshot_sha256 }) =>
        /^INBOX-\d{4,}$/.test(inbox_id) &&
        /^sha256:[a-f0-9]{64}$/.test(revision_sha256) &&
        text(snapshot_path) &&
        /^sha256:[a-f0-9]{64}$/.test(snapshot_sha256),
    ) &&
    new Set(
      value.source_revisions.map(
        ({ inbox_id, revision_sha256 }) =>
          `${inbox_id}\u0000${revision_sha256}`,
      ),
    ).size === value.source_revisions.length &&
    text(value.manifest_path) &&
    text(value.projection_path) &&
    /^sha256:[a-f0-9]{64}$/.test(value.content_sha256) &&
    text(value.frozen_at)
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
    if (!Object.hasOwn(WORKFLOW_STATE_FIELDS, field)) {
      throw new Error(`Unsupported workflow state field: ${field}.`);
    }
  }
  if (!validIntakeSnapshot(state.intake_snapshot)) {
    throw new Error('The provider-neutral iteration Intake is invalid.');
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
        (decision.action !== 'confirmed' && !text(decision.reason)) ||
        (decision.reason !== undefined && !text(decision.reason)) ||
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
        (decision.action !== 'confirmed' && !text(decision.reason)) ||
        (decision.reason !== undefined && !text(decision.reason)) ||
        (decision.draft_ids !== undefined &&
          (!textArray(decision.draft_ids) ||
            new Set(decision.draft_ids).size !== decision.draft_ids.length)) ||
        (decision.scenario_ids !== undefined &&
          (!textArray(decision.scenario_ids) ||
            !decision.scenario_ids.every((id) =>
              SCENARIO_ID_PATTERN.test(id),
            ) ||
            new Set(decision.scenario_ids).size !==
              decision.scenario_ids.length)) ||
        !text(decision.decided_at),
    )
  ) {
    throw new Error('The Understand decision history is invalid.');
  }
  if (
    state.confirmed_scenarios &&
    (state.confirmed_scenarios.length === 0 ||
      state.confirmed_scenarios.some(
        (scenario) =>
          scenario.version !== 1 ||
          !STORY_ID_PATTERN.test(scenario.story_id) ||
          !SCENARIO_ID_PATTERN.test(scenario.scenario_id) ||
          !textArray(scenario.given) ||
          !text(scenario.when) ||
          !textArray(scenario.then) ||
          !textArray(scenario.business_data) ||
          scenario.confirmed_by !== 'human' ||
          (scenario.confirmation_reason !== undefined &&
            !text(scenario.confirmation_reason)) ||
          !text(scenario.confirmed_at),
      ) ||
      new Set(state.confirmed_scenarios.map(({ scenario_id }) => scenario_id))
        .size !== state.confirmed_scenarios.length ||
      new Set(state.confirmed_scenarios.map(({ story_id }) => story_id))
        .size !== 1)
  ) {
    throw new Error('The confirmed Scenario Set is invalid.');
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
    [
      'expansion',
      'candidate_ready',
      'model_review',
      'model_confirmed',
    ].includes(state.modeling_stage ?? '') &&
    !state.modeling_profile
  ) {
    throw new Error(`${state.modeling_stage} requires a confirmed Profile.`);
  }
  if (
    ['candidate_ready', 'model_review', 'model_confirmed'].includes(
      state.modeling_stage ?? '',
    ) &&
    (!text(state.model_expansion_path) || !text(state.model_git_baseline))
  ) {
    throw new Error('A model candidate requires expansion and Git baseline.');
  }
  const noModelProfile =
    state.modeling_profile?.method === 'none' &&
    state.modeling_profile.model_change_required === false;
  if (
    state.modeling_profile?.method === 'none' &&
    state.modeling_profile.model_change_required !== false
  ) {
    throw new Error('method=none cannot require a canonical model change.');
  }
  if (
    state.modeling_profile?.method === 'none' &&
    ['candidate_ready', 'model_review'].includes(state.modeling_stage ?? '')
  ) {
    throw new Error('method=none must bypass model expansion and challenge.');
  }
  if (
    state.modeling_stage === 'model_review' &&
    state.model_challenges?.at(-1)?.outcome !== 'pass'
  ) {
    throw new Error('Human model review requires a passing challenge.');
  }
  if (
    state.modeling_stage === 'model_confirmed' &&
    !noModelProfile &&
    (state.model_challenges?.at(-1)?.outcome !== 'pass' ||
      state.model_decisions?.at(-1)?.action !== 'confirm')
  ) {
    throw new Error('Tasking requires a human-confirmed model decision.');
  }
  if (
    (state.model_decisions ?? []).some(
      (decision) =>
        decision.version !== 1 ||
        !['confirm', 'revise', 'scenario_gap', 'method_gap'].includes(
          decision.action,
        ) ||
        decision.decided_by !== 'human' ||
        (decision.action !== 'confirm' && !text(decision.reason)) ||
        (decision.reason !== undefined && !text(decision.reason)) ||
        !text(decision.challenge_artifact_path) ||
        !text(decision.challenge_artifact_sha256) ||
        !text(decision.projection_sha256) ||
        !text(decision.model_expansion_sha256) ||
        (decision.model_change_proposal_sha256 !== undefined &&
          !text(decision.model_change_proposal_sha256)) ||
        !text(decision.artifact_path) ||
        !text(decision.decided_at),
    )
  ) {
    throw new Error('The human model decision history is invalid.');
  }
  if (
    state.model_change_application &&
    (!state.model_change_proposal ||
      state.model_decisions?.at(-1)?.action !== 'confirm' ||
      !text(state.model_change_application.git_baseline) ||
      !textArray(state.model_change_application.changed_paths) ||
      !text(state.model_change_application.applied_at))
  ) {
    throw new Error('The applied model change is invalid.');
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
    state.tasking_candidate &&
    (state.tasking_candidate.version !== 2 ||
      !textArray(state.tasking_candidate.scenario_ids) ||
      !state.tasking_candidate.scenario_ids.every((id) =>
        SCENARIO_ID_PATTERN.test(id),
      ) ||
      !Array.isArray(state.tasking_candidate.tests) ||
      state.tasking_candidate.tests.length === 0 ||
      state.tasking_candidate.tests.some(
        (test) =>
          !text(test.id) ||
          !text(test.intent) ||
          !text(test.process_id) ||
          !text(test.step_id) ||
          !textArray(test.scenario_ids) ||
          !test.scenario_ids.every((id) => SCENARIO_ID_PATTERN.test(id)) ||
          !textArray(test.business_data) ||
          !validModelRefs(test.model_refs),
      ) ||
      !Array.isArray(state.tasking_candidate.tasks) ||
      state.tasking_candidate.tasks.length === 0 ||
      state.tasking_candidate.tasks.some(
        (task) =>
          !text(task.id) ||
          !text(task.description) ||
          !textArray(task.test_ids) ||
          !textArray(task.depends_on, true) ||
          !validModelRefs(task.model_refs),
      ))
  ) {
    throw new Error('The Tasking candidate traceability is invalid.');
  }
  if (
    (state.desk_check_decisions ?? []).some(
      (decision) =>
        !DESK_CHECK_ACTIONS.has(decision.action) ||
        (decision.action !== 'approve' && !text(decision.reason)) ||
        (decision.reason !== undefined && !text(decision.reason)) ||
        (decision.draft_id !== undefined && !text(decision.draft_id)) ||
        (decision.candidate_sha256 !== undefined &&
          !text(decision.candidate_sha256)) ||
        decision.decided_by !== 'human' ||
        !text(decision.artifact_path) ||
        !text(decision.decided_at),
    )
  ) {
    throw new Error('The Desk Check decision history is invalid.');
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
      !textArray(state.active_work_item.scenario_ids) ||
      !state.active_work_item.scenario_ids.every((id) =>
        SCENARIO_ID_PATTERN.test(id),
      ) ||
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
    (state.pair_session.version !== 2 ||
      !textArray(state.pair_session.scenario_ids) ||
      !state.pair_session.scenario_ids.every((id) =>
        SCENARIO_ID_PATTERN.test(id),
      ) ||
      !PAIR_CHECKPOINTS.has(state.pair_session.checkpoint) ||
      !text(state.pair_session.task_id) ||
      !text(state.pair_session.test_id) ||
      !text(state.pair_session.process_id) ||
      !text(state.pair_session.step_id) ||
      !text(state.pair_session.git_baseline) ||
      !Array.isArray(state.pair_session.completed_task_ids) ||
      !Array.isArray(state.pair_session.completed_test_ids) ||
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
    (!state.tasking_candidate ||
      !state.tasking_candidate.tasks.some(
        ({ id, test_ids }) =>
          id === state.pair_session?.task_id &&
          test_ids.includes(state.pair_session?.test_id ?? ''),
      ) ||
      !state.tasking_candidate.tests.some(
        ({ id, process_id, step_id }) =>
          id === state.pair_session?.test_id &&
          process_id === state.pair_session?.process_id &&
          step_id === state.pair_session?.step_id,
      ) ||
      state.pair_session.completed_task_ids.some(
        (id) => !state.tasking_candidate?.tasks.some((task) => task.id === id),
      ) ||
      state.pair_session.completed_test_ids.some(
        (id) => !state.tasking_candidate?.tests.some((test) => test.id === id),
      ))
  ) {
    throw new Error('The Pair session TASK/TEST traceability is invalid.');
  }
  if (
    (state.completed_work_items ?? []).some(
      (item) =>
        item.version !== 1 ||
        !STORY_ID_PATTERN.test(item.story_id) ||
        !Array.isArray(item.scenarios) ||
        item.scenarios.length === 0 ||
        item.scenarios.some(
          (scenario) =>
            scenario.story_id !== item.story_id ||
            !SCENARIO_ID_PATTERN.test(scenario.scenario_id),
        ) ||
        item.work_item.story_id !== item.story_id ||
        JSON.stringify(item.work_item.scenario_ids) !==
          JSON.stringify(
            item.scenarios.map(({ scenario_id }) => scenario_id),
          ) ||
        item.pair.checkpoint !== 'quality_gates_passed' ||
        !text(item.approved_test_plan_path) ||
        !text(item.approved_test_plan_sha256) ||
        !text(item.model_expansion_path) ||
        !text(item.model_decision_path) ||
        !text(item.execution_manifest_path) ||
        !text(item.execution_manifest_sha256) ||
        !text(item.completed_at),
    )
  ) {
    throw new Error('The completed delivery work items are invalid.');
  }
  if (
    state.pair_session &&
    (!state.active_work_item ||
      state.pair_session.story_id !== state.active_work_item.story_id ||
      JSON.stringify(state.pair_session.scenario_ids) !==
        JSON.stringify(state.active_work_item.scenario_ids) ||
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
    (state.showcase_risk_decisions ?? []).some((decision) => {
      const allowed =
        decision.quadrant === 'Q3'
          ? [
              'exploratory',
              'usability',
              'accessibility',
              'compatibility',
              'other',
            ]
          : decision.quadrant === 'Q4'
            ? ['performance', 'security', 'reliability', 'operability', 'other']
            : [];
      return (
        !['Q3', 'Q4'].includes(decision.quadrant) ||
        !['required', 'not_required'].includes(decision.disposition) ||
        !Array.isArray(decision.activities) ||
        decision.activities.some((activity) => !allowed.includes(activity)) ||
        (decision.disposition === 'required'
          ? decision.activities.length === 0
          : decision.activities.length > 0) ||
        !text(decision.reason) ||
        decision.decided_by !== 'human' ||
        !text(decision.decided_at)
      );
    })
  ) {
    throw new Error('The Showcase risk decisions are invalid.');
  }
  if (
    (state.showcase_product_observations ?? []).some(
      (observation) =>
        observation.version !== 1 ||
        !text(observation.observation_id) ||
        !STORY_ID_PATTERN.test(observation.story_id) ||
        !SCENARIO_ID_PATTERN.test(observation.scenario_id) ||
        !textArray(observation.given) ||
        !text(observation.when) ||
        !textArray(observation.observed_outcomes) ||
        !textArray(observation.business_data) ||
        !text(observation.observation) ||
        !text(observation.value_feedback) ||
        !textArray(observation.evidence_refs) ||
        !text(observation.artifact_path) ||
        observation.observed_by !== 'human' ||
        !text(observation.observed_at),
    )
  ) {
    throw new Error('The Showcase product observations are invalid.');
  }
  if (
    (state.showcase_evaluation_observations ?? []).some(
      (observation) =>
        observation.version !== 1 ||
        !text(observation.evaluation_id) ||
        !['Q3', 'Q4'].includes(observation.quadrant) ||
        !(
          observation.quadrant === 'Q3'
            ? [
                'exploratory',
                'usability',
                'accessibility',
                'compatibility',
                'other',
              ]
            : ['performance', 'security', 'reliability', 'operability', 'other']
        ).includes(observation.activity) ||
        !['passed', 'concern'].includes(observation.outcome) ||
        !text(observation.finding) ||
        !textArray(observation.evidence_refs) ||
        !text(observation.artifact_path) ||
        observation.observed_by !== 'human' ||
        !text(observation.observed_at),
    )
  ) {
    throw new Error('The Showcase evaluation observations are invalid.');
  }
  if (
    (state.showcase_reviews ?? []).some(
      (review) =>
        review.version !== 2 ||
        !textArray(review.product_observation_ids) ||
        !textArray(review.evaluation_ids, true),
    )
  ) {
    throw new Error('The Showcase review records are invalid.');
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
