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

function isValidPendingClarification(
  clarification: ClarificationRecord,
): boolean {
  return (
    typeof clarification.question_id === 'string' &&
    Boolean(clarification.question_id.trim()) &&
    STORY_ID_PATTERN.test(clarification.story_id) &&
    typeof clarification.question === 'string' &&
    Boolean(clarification.question.trim()) &&
    CLARIFICATION_TARGETS.has(clarification.target) &&
    typeof clarification.asked_at === 'string' &&
    Boolean(clarification.asked_at) &&
    clarification.answer === undefined &&
    clarification.answered_at === undefined
  );
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
        !proposal ||
        proposal.story_id !== story_id ||
        !isValidClarificationOutcomeProposal(proposal)
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
      (record) => !record.answer || !record.answered_at,
    )
  ) {
    throw new Error(
      'Clarification history may only contain answered exchanges.',
    );
  }
  return {
    iteration_id: iterationId,
    phase: phase as Phase,
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
