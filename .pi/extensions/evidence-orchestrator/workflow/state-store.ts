import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { createCodingGitBaseline } from '../evidence/model-and-code';
import { assertScenarioProcessSelection } from '../evidence/knowledge';
import {
  artifactPath,
  artifactRelativePath,
  assertIterationId,
} from './iteration-paths';
import { DEFAULT_STATE, PHASE_ORDER } from './phase-catalog';
import {
  FEEDBACK_LOOP_BY_TARGET,
  LOOP_ORDER,
  loopForCompatibilityPhase,
  transitionLoopState,
  type LoopTransitionRequest,
} from './loop-catalog';
import {
  catalogTestProcessDirectory,
  matchingTestProcessesInDirectories,
} from '../testing/process-catalog';
import type {
  ActiveWorkItem,
  ClarificationRecord,
  ClarificationStoryOutcomeProposal,
  Phase,
  TestProcessRuntime,
  TestProcessSelection,
  WorkflowState,
} from './types';

const CONFIGURABLE_PHASES = new Set(
  PHASE_ORDER.filter((phase) => phase !== 'complete'),
);
const STORY_ID_PATTERN = /^US-\d{3,}$/;
const CLARIFICATION_TARGETS = new Set(['business_context', 'story', 'history']);
const CLARIFICATION_STORY_OUTCOMES = new Set([
  'clarified',
  'needs_split',
  'deferred',
]);
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
]);
const MODELING_SUBJECTS = new Set(['business', 'domain', 'tool']);
const MODELING_METHODS = new Set([
  'none',
  'object',
  'event',
  'four_color',
  'eight_x_flow',
  'algorithmic',
]);
const MODEL_OPERATION_ACTIONS = new Set(['add', 'update', 'remove']);
const MODEL_ELEMENT_KINDS = new Set(['entity', 'association']);

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && Boolean(value.trim());
}

function isNonEmptyStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((entry) => isNonEmptyString(entry))
  );
}

function isValidClarificationOutcomeProposal(
  proposal: ClarificationStoryOutcomeProposal,
): boolean {
  return (
    STORY_ID_PATTERN.test(proposal.story_id) &&
    CLARIFICATION_STORY_OUTCOMES.has(proposal.outcome) &&
    typeof proposal.summary === 'string' &&
    Boolean(proposal.summary.trim()) &&
    typeof proposal.proposed_at === 'string' &&
    Boolean(proposal.proposed_at)
  );
}

function isValidClarificationBase(clarification: ClarificationRecord): boolean {
  return (
    typeof clarification.question_id === 'string' &&
    Boolean(clarification.question_id.trim()) &&
    STORY_ID_PATTERN.test(clarification.story_id) &&
    typeof clarification.question === 'string' &&
    Boolean(clarification.question.trim()) &&
    CLARIFICATION_TARGETS.has(clarification.target) &&
    typeof clarification.asked_at === 'string' &&
    Boolean(clarification.asked_at)
  );
}

function isValidPendingClarification(
  clarification: ClarificationRecord,
): boolean {
  return (
    isValidClarificationBase(clarification) &&
    clarification.answer === undefined &&
    clarification.answered_at === undefined &&
    clarification.waived_by === undefined &&
    clarification.waived_reason === undefined &&
    clarification.waived_at === undefined
  );
}

function isValidClarificationHistoryRecord(
  clarification: ClarificationRecord,
): boolean {
  if (!isValidClarificationBase(clarification)) return false;
  const answered =
    typeof clarification.answer === 'string' &&
    Boolean(clarification.answer.trim()) &&
    typeof clarification.answered_at === 'string' &&
    Boolean(clarification.answered_at) &&
    clarification.waived_by === undefined &&
    clarification.waived_reason === undefined &&
    clarification.waived_at === undefined;
  const waived =
    clarification.answer === undefined &&
    clarification.answered_at === undefined &&
    clarification.waived_by === 'human' &&
    typeof clarification.waived_reason === 'string' &&
    Boolean(clarification.waived_reason.trim()) &&
    typeof clarification.waived_at === 'string' &&
    Boolean(clarification.waived_at);
  return answered || waived;
}

export function statePath(cwd: string): string {
  return join(cwd, 'evidence-state.json');
}

function readJsonFile<T>(path: string): T | undefined {
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

export function normalizeState(state: WorkflowState): WorkflowState {
  const phase = state.phase as string;
  if (!PHASE_ORDER.includes(phase as Phase)) {
    throw new Error(`Unsupported Evidence Orchestrator phase: ${phase}.`);
  }
  for (const gatePhase of Object.keys(state.gate_config ?? {})) {
    if (!CONFIGURABLE_PHASES.has(gatePhase as Phase)) {
      throw new Error(
        `Unsupported Evidence Orchestrator gate configuration: ${gatePhase}.`,
      );
    }
  }
  const iterationId = state.iteration_id ?? DEFAULT_STATE.iteration_id;
  assertIterationId(iterationId);
  const workflowVersion = state.workflow_version ?? 4;
  if (workflowVersion !== 4 && workflowVersion !== 5) {
    throw new Error(
      `Unsupported Evidence Orchestrator workflow version: ${workflowVersion}.`,
    );
  }
  if (workflowVersion === 4 && state.loop !== undefined) {
    throw new Error('A legacy v4 workflow must not declare a v5 loop.');
  }
  if (workflowVersion === 5 && state.loop === undefined) {
    throw new Error('A v5 workflow must declare its current knowledge loop.');
  }
  if (
    state.loop !== undefined &&
    !LOOP_ORDER.includes(state.loop as (typeof LOOP_ORDER)[number])
  ) {
    throw new Error(`Unsupported Evidence Orchestrator loop: ${state.loop}.`);
  }
  const loop =
    workflowVersion === 5
      ? // The phase remains a compatibility projection until EOV5-016. Legacy
        // phase writers therefore determine the containing loop during migration.
        loopForCompatibilityPhase(phase as Phase)
      : undefined;
  const feedbackHistory = state.feedback_history ?? [];
  if (workflowVersion === 4 && feedbackHistory.length > 0) {
    throw new Error('A legacy v4 workflow must not declare v5 feedback.');
  }
  if (
    feedbackHistory.some((feedback) => {
      const expected = FEEDBACK_LOOP_BY_TARGET[feedback.target];
      return (
        !expected ||
        feedback.to_loop !== expected ||
        !LOOP_ORDER.includes(feedback.from_loop) ||
        !LOOP_ORDER.includes(feedback.to_loop) ||
        typeof feedback.reason !== 'string' ||
        !feedback.reason.trim() ||
        !['human', 'system'].includes(feedback.decided_by) ||
        typeof feedback.recorded_at !== 'string' ||
        !feedback.recorded_at
      );
    })
  ) {
    throw new Error('The v5 workflow feedback history is invalid.');
  }
  const kickoffCandidate = state.kickoff_candidate;
  const kickoffDecisions = state.kickoff_decisions ?? [];
  if (
    workflowVersion === 4 &&
    (kickoffCandidate !== undefined || kickoffDecisions.length > 0)
  ) {
    throw new Error('A legacy v4 workflow must not declare v5 Kickoff data.');
  }
  if (
    kickoffCandidate &&
    (kickoffCandidate.version !== 1 ||
      !isNonEmptyString(kickoffCandidate.title) ||
      !isNonEmptyString(kickoffCandidate.problem) ||
      !isNonEmptyString(kickoffCandidate.role) ||
      !isNonEmptyString(kickoffCandidate.goal) ||
      !isNonEmptyString(kickoffCandidate.value) ||
      !COGNITIVE_MODES.has(kickoffCandidate.cognitive_mode) ||
      !Array.isArray(kickoffCandidate.source_refs) ||
      kickoffCandidate.source_refs.length === 0 ||
      kickoffCandidate.source_refs.some(
        (reference) => !isNonEmptyString(reference),
      ) ||
      !isNonEmptyString(kickoffCandidate.proposed_at) ||
      !isNonEmptyString(kickoffCandidate.artifact_path))
  ) {
    throw new Error('The v5 Kickoff candidate is invalid.');
  }
  if (
    kickoffDecisions.some(
      (decision) =>
        !KICKOFF_DECISIONS.has(decision.action) ||
        !isNonEmptyString(decision.reason) ||
        decision.decided_by !== 'human' ||
        !isNonEmptyString(decision.decided_at) ||
        (decision.story_id !== undefined &&
          !STORY_ID_PATTERN.test(decision.story_id)),
    )
  ) {
    throw new Error('The v5 Kickoff decision history is invalid.');
  }
  const understandStage = state.understand_stage;
  const scenarioDrafts = state.scenario_drafts ?? [];
  const confirmedScenario = state.confirmed_scenario;
  const understandingDecisions = state.understanding_decisions ?? [];
  if (
    workflowVersion === 4 &&
    (understandStage !== undefined ||
      scenarioDrafts.length > 0 ||
      confirmedScenario !== undefined ||
      understandingDecisions.length > 0)
  ) {
    throw new Error(
      'A legacy v4 workflow must not declare v5 Understand data.',
    );
  }
  if (
    understandStage !== undefined &&
    !UNDERSTAND_STAGES.has(understandStage)
  ) {
    throw new Error(`Unsupported v5 Understand stage: ${understandStage}.`);
  }
  if (
    workflowVersion === 5 &&
    ((state.paused_clarifications?.length ?? 0) > 0 ||
      (state.paused_clarification_story_outcome_proposals?.length ?? 0) > 0)
  ) {
    throw new Error(
      'A v5 Understand loop cannot pause questions or decisions for another Story.',
    );
  }
  if (
    scenarioDrafts.some(
      (draft) =>
        draft.version !== 1 ||
        !/^DRAFT-\d{3,}$/.test(draft.draft_id) ||
        !STORY_ID_PATTERN.test(draft.story_id) ||
        !isNonEmptyString(draft.title) ||
        !isNonEmptyStringArray(draft.given) ||
        !isNonEmptyString(draft.when) ||
        !isNonEmptyStringArray(draft.then) ||
        !isNonEmptyStringArray(draft.business_data) ||
        !isNonEmptyString(draft.proposed_at) ||
        !isNonEmptyString(draft.artifact_path),
    ) ||
    new Set(scenarioDrafts.map(({ draft_id }) => draft_id)).size !==
      scenarioDrafts.length
  ) {
    throw new Error('The v5 Scenario drafts are invalid.');
  }
  if (understandStage === 'scenario_review' && scenarioDrafts.length === 0) {
    throw new Error('Scenario review requires at least one Scenario draft.');
  }
  if (understandStage === 'tqa' && scenarioDrafts.length > 0) {
    throw new Error('TQA cannot retain Scenario drafts awaiting review.');
  }
  if (
    confirmedScenario &&
    (confirmedScenario.version !== 1 ||
      !STORY_ID_PATTERN.test(confirmedScenario.story_id) ||
      !/^SC-\d{3,}$/.test(confirmedScenario.scenario_id) ||
      !/^DRAFT-\d{3,}$/.test(confirmedScenario.source_draft_id) ||
      !isNonEmptyString(confirmedScenario.title) ||
      !isNonEmptyStringArray(confirmedScenario.given) ||
      !isNonEmptyString(confirmedScenario.when) ||
      !isNonEmptyStringArray(confirmedScenario.then) ||
      !isNonEmptyStringArray(confirmedScenario.business_data) ||
      !isNonEmptyString(confirmedScenario.artifact_path) ||
      confirmedScenario.confirmed_by !== 'human' ||
      !isNonEmptyString(confirmedScenario.confirmation_reason) ||
      !isNonEmptyString(confirmedScenario.confirmed_at))
  ) {
    throw new Error('The v5 confirmed Scenario is invalid.');
  }
  if (confirmedScenario && understandStage !== 'modeling') {
    throw new Error('A confirmed Scenario must enter the modeling stage.');
  }
  if (
    understandingDecisions.some(
      (decision) =>
        !UNDERSTANDING_DECISIONS.has(decision.action) ||
        !isNonEmptyString(decision.reason) ||
        decision.decided_by !== 'human' ||
        !isNonEmptyString(decision.decided_at) ||
        (decision.draft_id !== undefined &&
          !/^DRAFT-\d{3,}$/.test(decision.draft_id)) ||
        (decision.scenario_id !== undefined &&
          !/^SC-\d{3,}$/.test(decision.scenario_id)),
    )
  ) {
    throw new Error('The v5 Understand decision history is invalid.');
  }
  const modelingStage = state.modeling_stage;
  const profileProposal = state.modeling_profile_proposal;
  const modelingProfile = state.modeling_profile;
  const modelExpansionPath = state.model_expansion_path;
  const modelGitBaseline = state.model_git_baseline;
  const modelChangeProposal = state.model_change_proposal;
  const modelChangeApplication = state.model_change_application;
  if (
    workflowVersion === 4 &&
    (modelingStage !== undefined ||
      profileProposal !== undefined ||
      modelingProfile !== undefined ||
      modelExpansionPath !== undefined ||
      modelGitBaseline !== undefined ||
      modelChangeProposal !== undefined ||
      modelChangeApplication !== undefined)
  ) {
    throw new Error('A legacy v4 workflow must not declare v5 modeling data.');
  }
  if (modelingStage !== undefined && !MODELING_STAGES.has(modelingStage)) {
    throw new Error(`Unsupported v5 modeling stage: ${modelingStage}.`);
  }
  if (
    profileProposal &&
    (profileProposal.version !== 1 ||
      !MODELING_SUBJECTS.has(profileProposal.subject) ||
      !MODELING_METHODS.has(profileProposal.method) ||
      ![true, false, 'unknown'].includes(
        profileProposal.model_change_required,
      ) ||
      !isNonEmptyString(profileProposal.reason) ||
      !isNonEmptyString(profileProposal.proposed_at))
  ) {
    throw new Error('The v5 modeling Profile proposal is invalid.');
  }
  if (
    modelingProfile &&
    (modelingProfile.version !== 1 ||
      !MODELING_SUBJECTS.has(modelingProfile.subject) ||
      !MODELING_METHODS.has(modelingProfile.method) ||
      typeof modelingProfile.model_change_required !== 'boolean' ||
      !isNonEmptyString(modelingProfile.reason) ||
      modelingProfile.confirmed_by !== 'human' ||
      !isNonEmptyString(modelingProfile.confirmed_at))
  ) {
    throw new Error('The v5 confirmed modeling Profile is invalid.');
  }
  if (modelingStage === 'profile_review' && !profileProposal) {
    throw new Error('Modeling Profile review requires an AI proposal.');
  }
  if (
    ['expansion', 'candidate_ready'].includes(modelingStage ?? '') &&
    !modelingProfile
  ) {
    throw new Error(
      `${modelingStage} requires a human-confirmed modeling Profile.`,
    );
  }
  if (
    modelChangeProposal &&
    (modelChangeProposal.version !== 1 ||
      !STORY_ID_PATTERN.test(modelChangeProposal.story_id) ||
      !/^SC-\d{3,}$/.test(modelChangeProposal.scenario_id) ||
      !isNonEmptyString(modelChangeProposal.git_baseline) ||
      !isNonEmptyString(modelChangeProposal.reason) ||
      !Array.isArray(modelChangeProposal.operations) ||
      modelChangeProposal.operations.length === 0 ||
      modelChangeProposal.operations.some(
        (operation) =>
          !MODEL_OPERATION_ACTIONS.has(operation.action) ||
          !MODEL_ELEMENT_KINDS.has(operation.kind) ||
          !isNonEmptyString(operation.id) ||
          !isNonEmptyString(operation.path),
      ) ||
      !isNonEmptyString(modelChangeProposal.artifact_path) ||
      !isNonEmptyString(modelChangeProposal.proposed_at))
  ) {
    throw new Error('The v5 model-change proposal is invalid.');
  }
  if (
    modelingStage === 'candidate_ready' &&
    (!isNonEmptyString(modelExpansionPath) ||
      !isNonEmptyString(modelGitBaseline))
  ) {
    throw new Error(
      'A model candidate requires its expansion path and Git baseline.',
    );
  }
  if (
    modelChangeProposal &&
    (modelingProfile?.model_change_required !== true ||
      modelChangeProposal.git_baseline !== modelGitBaseline)
  ) {
    throw new Error(
      'The model-change proposal must match the confirmed Profile and Git baseline.',
    );
  }
  if (
    modelingStage === 'candidate_ready' &&
    modelingProfile?.model_change_required === true &&
    !modelChangeProposal
  ) {
    throw new Error('The confirmed Profile requires a model-change proposal.');
  }
  if (
    modelChangeApplication &&
    (!modelChangeProposal ||
      !isNonEmptyString(modelChangeApplication.git_baseline) ||
      modelChangeApplication.git_baseline !==
        modelChangeProposal.git_baseline ||
      !isNonEmptyStringArray(modelChangeApplication.changed_paths) ||
      !isNonEmptyString(modelChangeApplication.applied_at))
  ) {
    throw new Error('The v5 model-change application is invalid.');
  }
  if (state.active_clarification_story && phase !== 'clarify') {
    throw new Error(
      'An active clarification story is only valid while the workflow is in clarify.',
    );
  }
  if (
    state.active_clarification_story &&
    (!STORY_ID_PATTERN.test(state.active_clarification_story.story_id) ||
      typeof state.active_clarification_story.selected_at !== 'string' ||
      !state.active_clarification_story.selected_at)
  ) {
    throw new Error('The active clarification story is invalid.');
  }
  const activeStoryId = state.active_clarification_story?.story_id;
  const proposedOutcome = state.proposed_clarification_story_outcome;
  const pausedProposals =
    state.paused_clarification_story_outcome_proposals ?? [];
  const allProposals = [
    ...(proposedOutcome ? [proposedOutcome] : []),
    ...pausedProposals,
  ];
  if (workflowVersion === 5 && allProposals.length > 0) {
    throw new Error(
      'A v5 Understand loop uses concrete Scenario drafts, not story-outcome proposals.',
    );
  }
  if (allProposals.length > 0 && phase !== 'clarify') {
    throw new Error(
      'A proposed clarification story outcome is only valid while the workflow is in clarify.',
    );
  }
  if (
    allProposals.some(
      (proposal) => !isValidClarificationOutcomeProposal(proposal),
    ) ||
    new Set(allProposals.map(({ story_id }) => story_id)).size !==
      allProposals.length
  ) {
    throw new Error('The proposed clarification story outcomes are invalid.');
  }
  if (proposedOutcome && proposedOutcome.story_id !== activeStoryId) {
    throw new Error(
      'A proposed clarification story outcome must belong to the active clarification story.',
    );
  }
  if (pausedProposals.some(({ story_id }) => story_id === activeStoryId)) {
    throw new Error(
      'A paused clarification story outcome proposal must not belong to the active clarification story.',
    );
  }

  const clarificationOutcomes = state.clarification_story_outcomes ?? [];
  if (workflowVersion === 5 && clarificationOutcomes.length > 0) {
    throw new Error(
      'A v5 Understand loop is finalized by one human-confirmed Scenario, not batch story outcomes.',
    );
  }
  if (
    new Set(clarificationOutcomes.map(({ story_id }) => story_id)).size !==
      clarificationOutcomes.length ||
    clarificationOutcomes.some((record) => {
      const {
        story_id,
        outcome,
        summary,
        completed_at,
        decided_by,
        confirmed_at,
        proposal,
      } = record;
      const invalidBase =
        !STORY_ID_PATTERN.test(story_id) ||
        !CLARIFICATION_STORY_OUTCOMES.has(outcome) ||
        typeof summary !== 'string' ||
        !summary.trim() ||
        typeof completed_at !== 'string' ||
        !completed_at;
      if (invalidBase) return true;
      if (decided_by === undefined) {
        return confirmed_at !== undefined || proposal !== undefined;
      }
      return (
        decided_by !== 'human' ||
        typeof confirmed_at !== 'string' ||
        !confirmed_at ||
        (proposal !== undefined &&
          (proposal.story_id !== story_id ||
            !isValidClarificationOutcomeProposal(proposal)))
      );
    })
  ) {
    throw new Error('Clarification story outcomes are invalid.');
  }
  const completedStoryIds = new Set(
    clarificationOutcomes.map(({ story_id }) => story_id),
  );
  if (activeStoryId && completedStoryIds.has(activeStoryId)) {
    throw new Error(
      'The active clarification story cannot already have an outcome.',
    );
  }
  if (allProposals.some(({ story_id }) => completedStoryIds.has(story_id))) {
    throw new Error(
      'A story with a clarification outcome cannot retain a proposed outcome.',
    );
  }

  const pendingClarification = state.pending_clarification;
  const pausedClarifications = state.paused_clarifications ?? [];
  const allPendingClarifications = [
    ...(pendingClarification ? [pendingClarification] : []),
    ...pausedClarifications,
  ];
  if (allPendingClarifications.length > 0 && phase !== 'clarify') {
    throw new Error(
      'A pending clarification is only valid while the workflow is in clarify.',
    );
  }
  if (
    allPendingClarifications.some(
      (clarification) => !isValidPendingClarification(clarification),
    ) ||
    new Set(allPendingClarifications.map(({ question_id }) => question_id))
      .size !== allPendingClarifications.length ||
    new Set(allPendingClarifications.map(({ story_id }) => story_id)).size !==
      allPendingClarifications.length
  ) {
    throw new Error('Pending clarifications are invalid.');
  }
  if (pendingClarification && pendingClarification.story_id !== activeStoryId) {
    throw new Error(
      'A pending clarification must belong to the active clarification story.',
    );
  }
  if (pausedClarifications.some(({ story_id }) => story_id === activeStoryId)) {
    throw new Error(
      'A paused clarification must not belong to the active clarification story.',
    );
  }
  const proposedStoryIds = new Set(
    allProposals.map(({ story_id }) => story_id),
  );
  if (
    allPendingClarifications.some(({ story_id }) =>
      proposedStoryIds.has(story_id),
    )
  ) {
    throw new Error(
      'A clarification question and a proposed story outcome cannot both be pending for one story.',
    );
  }
  if (
    allPendingClarifications.some(({ story_id }) =>
      completedStoryIds.has(story_id),
    )
  ) {
    throw new Error(
      'A story with a clarification outcome cannot retain a pending clarification.',
    );
  }
  if (
    state.clarification_history?.some(
      (record) => !isValidClarificationHistoryRecord(record),
    )
  ) {
    throw new Error(
      'Clarification history may only contain answered or human-waived exchanges.',
    );
  }
  return {
    iteration_id: iterationId,
    ...(state.workflow_version !== undefined
      ? { workflow_version: workflowVersion }
      : {}),
    ...(loop ? { loop } : {}),
    ...(kickoffCandidate ? { kickoff_candidate: kickoffCandidate } : {}),
    ...(kickoffDecisions.length > 0
      ? { kickoff_decisions: kickoffDecisions }
      : {}),
    ...(understandStage ? { understand_stage: understandStage } : {}),
    ...(scenarioDrafts.length > 0 ? { scenario_drafts: scenarioDrafts } : {}),
    ...(confirmedScenario ? { confirmed_scenario: confirmedScenario } : {}),
    ...(understandingDecisions.length > 0
      ? { understanding_decisions: understandingDecisions }
      : {}),
    ...(modelingStage ? { modeling_stage: modelingStage } : {}),
    ...(profileProposal ? { modeling_profile_proposal: profileProposal } : {}),
    ...(modelingProfile ? { modeling_profile: modelingProfile } : {}),
    ...(modelExpansionPath ? { model_expansion_path: modelExpansionPath } : {}),
    ...(modelGitBaseline ? { model_git_baseline: modelGitBaseline } : {}),
    ...(modelChangeProposal
      ? { model_change_proposal: modelChangeProposal }
      : {}),
    ...(modelChangeApplication
      ? { model_change_application: modelChangeApplication }
      : {}),
    phase: phase as Phase,
    ...(feedbackHistory.length > 0
      ? { feedback_history: feedbackHistory }
      : {}),
    round: state.round ?? DEFAULT_STATE.round,
    pending_gate: state.pending_gate ?? DEFAULT_STATE.pending_gate,
    failures: state.failures ?? DEFAULT_STATE.failures,
    max_rounds: state.max_rounds ?? DEFAULT_STATE.max_rounds,
    artifacts: state.artifacts ?? DEFAULT_STATE.artifacts,
    gate_config: { ...DEFAULT_STATE.gate_config, ...(state.gate_config ?? {}) },
    ...(state.requirement_source
      ? { requirement_source: state.requirement_source }
      : {}),
    ...(state.active_work_item
      ? { active_work_item: state.active_work_item }
      : {}),
    ...(state.active_clarification_story
      ? { active_clarification_story: state.active_clarification_story }
      : {}),
    ...(state.proposed_clarification_story_outcome
      ? {
          proposed_clarification_story_outcome:
            state.proposed_clarification_story_outcome,
        }
      : {}),
    ...(pausedProposals.length > 0
      ? {
          paused_clarification_story_outcome_proposals: pausedProposals,
        }
      : {}),
    ...(state.clarification_story_outcomes
      ? { clarification_story_outcomes: state.clarification_story_outcomes }
      : {}),
    ...(state.pending_clarification
      ? { pending_clarification: state.pending_clarification }
      : {}),
    ...(pausedClarifications.length > 0
      ? { paused_clarifications: pausedClarifications }
      : {}),
    ...(state.clarification_history
      ? { clarification_history: state.clarification_history }
      : {}),
    ...(state.last_failure ? { last_failure: state.last_failure } : {}),
    ...(state.halted ? { halted: state.halted } : {}),
    pi: { enabled: true, version: 4, ...(state.pi ?? {}) },
  };
}

export function readState(cwd: string): WorkflowState {
  return normalizeState(
    readJsonFile<WorkflowState>(statePath(cwd)) ?? DEFAULT_STATE,
  );
}

export function writeState(cwd: string, state: WorkflowState): WorkflowState {
  const normalized = normalizeState(state);
  writeFileSync(statePath(cwd), `${JSON.stringify(normalized, null, 2)}\n`);
  return normalized;
}

export function transitionWorkflowLoop(
  cwd: string,
  request: LoopTransitionRequest,
): WorkflowState {
  return writeState(cwd, transitionLoopState(readState(cwd), request));
}

export function assertCanStartV5Iteration(cwd: string): void {
  if (!existsSync(statePath(cwd))) return;
  const current = readState(cwd);
  const complete =
    current.workflow_version === 5
      ? current.loop === 'complete'
      : current.phase === 'complete';
  if (!complete && !current.halted) {
    const version = current.workflow_version ?? 4;
    throw new Error(
      `Cannot start a v5 iteration while ${current.iteration_id} is active on workflow v${version}. Complete or halt it first; active workflow state is never migrated in place.`,
    );
  }
}

/**
 * Legacy local-state initialization is intentionally disabled. Requirements must
 * be frozen from an Issue by startIterationFromIssue before any active phase runs.
 */
export function newIterationState(cwd: string): never {
  void cwd;
  throw new Error(
    'Local iteration initialization is disabled. Select a GitHub Issue with /evidence-new.',
  );
}

export function selectWorkItem(
  cwd: string,
  storyId: string,
  scenarioId: string,
): WorkflowState {
  const state = readState(cwd);
  if (state.phase !== 'coding') {
    throw new Error(
      `Cannot select a work item: current phase is ${state.phase}.`,
    );
  }
  if (!/^US-\d{3,}$/i.test(storyId)) {
    throw new Error(`Invalid story id: ${storyId}. Expected US-xxx.`);
  }
  if (!/^SC-\d{3,}$/i.test(scenarioId)) {
    throw new Error(`Invalid scenario id: ${scenarioId}. Expected SC-xxx.`);
  }
  const active_work_item: ActiveWorkItem = {
    story_id: storyId.toUpperCase(),
    scenario_id: scenarioId.toUpperCase(),
    git_baseline: createCodingGitBaseline(cwd),
  };
  return writeState(cwd, { ...state, active_work_item });
}

/** Return the ordered selected processes, supporting legacy single-process evidence. */
export function selectedTestProcesses(
  workItem: ActiveWorkItem,
): TestProcessSelection[] {
  return (
    workItem.test_plan?.processes ??
    (workItem.test_process ? [workItem.test_process] : [])
  );
}

function snapshotCatalogProcess(
  cwd: string,
  state: WorkflowState,
  path: string,
): string {
  const catalog = catalogTestProcessDirectory(cwd);
  const source = join(cwd, path);
  if (!source.startsWith(`${catalog}/`)) return path;
  const targetDirectory = artifactPath(
    cwd,
    state,
    'artifacts/03-architecture/selected-test-processes',
  );
  const target = `${targetDirectory}/${path.split('/').at(-1)}`;
  mkdirSync(targetDirectory, { recursive: true });
  if (!existsSync(target)) copyFileSync(source, target);
  return artifactRelativePath(
    state,
    `artifacts/03-architecture/selected-test-processes/${path.split('/').at(-1)}`,
  );
}

/** Bind one uniquely matching reusable process; repeat for each runtime in a vertical scenario. */
export function selectTestProcess(
  cwd: string,
  runtime: TestProcessRuntime,
  functionalContexts: string[],
): WorkflowState {
  const state = readState(cwd);
  if (state.phase !== 'coding') {
    throw new Error(
      `Cannot select a test process: current phase is ${state.phase}.`,
    );
  }
  if (!state.active_work_item) {
    throw new Error(
      'Cannot select a test process: select one US-xxx / SC-xxx work item first.',
    );
  }
  const candidates = matchingTestProcessesInDirectories(
    cwd,
    [
      artifactPath(
        cwd,
        state,
        'artifacts/03-architecture/selected-test-processes',
      ),
      // Backward-compatible search for immutable pre-migration iterations.
      artifactPath(cwd, state, 'artifacts/03-architecture/test-processes'),
      catalogTestProcessDirectory(cwd),
    ],
    runtime,
    functionalContexts,
  );
  if (candidates.length === 0) {
    throw new Error(
      `No test process matches runtime=${runtime} and contexts=${functionalContexts.join(', ')}.`,
    );
  }
  if (candidates.length > 1) {
    throw new Error(
      `Test process selection is ambiguous for runtime=${runtime} and contexts=${functionalContexts.join(', ')}: ${candidates.map((candidate) => candidate.definition.id).join(', ')}.`,
    );
  }
  const candidate = candidates[0];
  if (!candidate) {
    throw new Error('A uniquely matching test process was not found.');
  }
  if (state.pi?.execution_evidence_version === 1) {
    assertScenarioProcessSelection(
      artifactPath(
        cwd,
        state,
        'artifacts/03-architecture/scenario-context-map.json',
      ),
      state.active_work_item.story_id,
      state.active_work_item.scenario_id,
      runtime,
      functionalContexts,
      candidate.definition.id,
    );
  }
  const selection: TestProcessSelection = {
    id: candidate.definition.id,
    path: snapshotCatalogProcess(cwd, state, candidate.path),
    runtime,
    functional_contexts: [...functionalContexts],
  };
  const selected = selectedTestProcesses(state.active_work_item);
  if (selected.some(({ id }) => id === selection.id)) {
    throw new Error(
      `Test process ${selection.id} is already selected for this work item.`,
    );
  }
  const active_work_item: ActiveWorkItem = {
    ...state.active_work_item,
    // Keep the singleton projection until all consumers have migrated.
    ...(selected.length === 0 ? { test_process: selection } : {}),
    test_plan: {
      version: 1,
      ...(state.pi?.execution_evidence_version === 1
        ? { execution_evidence_version: 1 as const }
        : {}),
      processes: [...selected, selection],
    },
  };
  return writeState(cwd, { ...state, active_work_item });
}
