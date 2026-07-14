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
  catalogTestProcessDirectory,
  matchingTestProcessesInDirectories,
} from '../testing/process-catalog';
import {
  artifactPath,
  artifactRelativePath,
  assertIterationId,
} from './iteration-paths';
import { DEFAULT_STATE, IDLE_STATE, PHASE_ORDER } from './phase-catalog';
import type {
  ActivePhase,
  ActiveWorkItem,
  ClarificationRecord,
  Phase,
  TestProcessRuntime,
  TestProcessSelection,
  WorkflowState,
} from './types';

const ACTIVE_PHASES = new Set<ActivePhase>([
  'kickoff',
  'discover',
  'model',
  'design',
  'build',
  'showcase',
  'learn',
]);
const STORY_ID_PATTERN = /^US-\d{3,}$/;
const SCENARIO_ID_PATTERN = /^SC-\d{3,}$/;

export function statePath(cwd: string): string {
  return join(cwd, 'evidence-state.json');
}

function readJsonFile<T>(path: string): T | undefined {
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function validQuestionBase(record: ClarificationRecord): boolean {
  return (
    /^Q-\d{3,}$/.test(record.question_id) &&
    STORY_ID_PATTERN.test(record.story_id) &&
    typeof record.thought === 'string' &&
    Boolean(record.thought.trim()) &&
    typeof record.question === 'string' &&
    Boolean(record.question.trim()) &&
    typeof record.asked_at === 'string' &&
    Boolean(record.asked_at)
  );
}

function validateClarifications(state: WorkflowState): void {
  const pending = state.pending_clarification;
  if (pending) {
    if (
      state.phase !== 'discover' ||
      !validQuestionBase(pending) ||
      pending.answer !== undefined ||
      pending.answered_at !== undefined
    ) {
      throw new Error('The pending TQA clarification is invalid.');
    }
  }

  const history = state.clarification_history ?? [];
  if (
    history.some(
      (record) =>
        !validQuestionBase(record) ||
        typeof record.answer !== 'string' ||
        !record.answer.trim() ||
        typeof record.answered_at !== 'string' ||
        !record.answered_at,
    ) ||
    new Set(history.map(({ question_id }) => question_id)).size !==
      history.length ||
    (pending &&
      history.some(({ question_id }) => question_id === pending.question_id))
  ) {
    throw new Error('The answered TQA clarification history is invalid.');
  }
}

function validateWorkItem(workItem: ActiveWorkItem): void {
  if (
    !STORY_ID_PATTERN.test(workItem.story_id) ||
    !SCENARIO_ID_PATTERN.test(workItem.scenario_id) ||
    typeof workItem.git_baseline !== 'string' ||
    !workItem.git_baseline
  ) {
    throw new Error('The active build work item is invalid.');
  }
  if (workItem.test_plan) {
    if (
      workItem.test_plan.version !== 1 ||
      !Array.isArray(workItem.test_plan.processes) ||
      workItem.test_plan.processes.length === 0 ||
      new Set(workItem.test_plan.processes.map(({ id }) => id)).size !==
        workItem.test_plan.processes.length
    ) {
      throw new Error('The active build test plan is invalid.');
    }
  }
}

export function normalizeState(state: WorkflowState): WorkflowState {
  if (state.version !== 2) {
    throw new Error(
      'Unsupported Evidence Orchestrator state schema. Start a new v2 iteration; legacy state is not migrated.',
    );
  }
  if (!PHASE_ORDER.includes(state.phase as Phase)) {
    throw new Error(`Unsupported Evidence Orchestrator phase: ${state.phase}.`);
  }
  if (state.phase === 'idle') {
    if (state.iteration_id !== null) {
      throw new Error('Idle workflow state must not identify an iteration.');
    }
  } else {
    if (!state.iteration_id) {
      throw new Error(
        `Workflow phase ${state.phase} requires an iteration id.`,
      );
    }
    assertIterationId(state.iteration_id);
  }

  const configuredPhases = Object.keys(state.gate_config ?? {});
  if (
    configuredPhases.length !== ACTIVE_PHASES.size ||
    configuredPhases.some((phase) => !ACTIVE_PHASES.has(phase as ActivePhase))
  ) {
    throw new Error(
      'Evidence Orchestrator gate configuration must define exactly the active v2 phases.',
    );
  }
  if (state.pending_gate && (state.phase === 'idle' || !state.iteration_id)) {
    throw new Error('An idle workflow cannot have a pending gate.');
  }
  if (state.halted && !ACTIVE_PHASES.has(state.halted.phase)) {
    throw new Error('The workflow halt references an invalid phase.');
  }
  if (state.last_failure && !ACTIVE_PHASES.has(state.last_failure.phase)) {
    throw new Error('The last phase failure references an invalid phase.');
  }
  validateClarifications(state);
  if (state.active_work_item) validateWorkItem(state.active_work_item);
  if (
    state.active_work_item &&
    !['build', 'showcase', 'learn', 'complete'].includes(state.phase)
  ) {
    throw new Error(
      'An active work item is only valid from Build through iteration completion.',
    );
  }

  return {
    version: 2,
    iteration_id: state.iteration_id,
    phase: state.phase,
    round: state.round ?? 0,
    pending_gate: state.pending_gate ?? null,
    failures: state.failures ?? 0,
    max_rounds: state.max_rounds ?? 5,
    artifacts: state.artifacts ?? [],
    gate_config: { ...state.gate_config },
    ...(state.requirement_source
      ? { requirement_source: state.requirement_source }
      : {}),
    ...(state.active_work_item
      ? { active_work_item: state.active_work_item }
      : {}),
    ...(state.pending_clarification
      ? { pending_clarification: state.pending_clarification }
      : {}),
    ...(state.clarification_history
      ? { clarification_history: state.clarification_history }
      : {}),
    ...(state.last_failure ? { last_failure: state.last_failure } : {}),
    ...(state.halted ? { halted: state.halted } : {}),
    pi: { enabled: true, version: 6, ...(state.pi ?? {}) },
  };
}

export function readState(cwd: string): WorkflowState {
  return normalizeState(
    readJsonFile<WorkflowState>(statePath(cwd)) ?? IDLE_STATE,
  );
}

export function writeState(cwd: string, state: WorkflowState): WorkflowState {
  const normalized = normalizeState(state);
  writeFileSync(statePath(cwd), `${JSON.stringify(normalized, null, 2)}\n`);
  return normalized;
}

/** Construct a clean Issue-backed iteration state without legacy projections. */
export function initialIterationState(iterationId: string): WorkflowState {
  assertIterationId(iterationId);
  return normalizeState({
    ...DEFAULT_STATE,
    iteration_id: iterationId,
    gate_config: { ...DEFAULT_STATE.gate_config },
  });
}

export function selectWorkItem(
  cwd: string,
  storyId: string,
  scenarioId: string,
): WorkflowState {
  const state = readState(cwd);
  if (state.phase !== 'build') {
    throw new Error(
      `Cannot select a work item: current phase is ${state.phase}; expected build.`,
    );
  }
  const normalizedStoryId = storyId.trim().toUpperCase();
  const normalizedScenarioId = scenarioId.trim().toUpperCase();
  if (!STORY_ID_PATTERN.test(normalizedStoryId)) {
    throw new Error(`Invalid story id: ${storyId}. Expected US-xxx.`);
  }
  if (!SCENARIO_ID_PATTERN.test(normalizedScenarioId)) {
    throw new Error(`Invalid scenario id: ${scenarioId}. Expected SC-xxx.`);
  }
  const scenario = artifactPath(
    cwd,
    state,
    `artifacts/02-discovery/examples/${normalizedStoryId}-${normalizedScenarioId}.md`,
  );
  if (!existsSync(scenario)) {
    throw new Error(
      `Cannot select ${normalizedStoryId}/${normalizedScenarioId}: acceptance example is missing.`,
    );
  }
  const active_work_item: ActiveWorkItem = {
    story_id: normalizedStoryId,
    scenario_id: normalizedScenarioId,
    git_baseline: createCodingGitBaseline(cwd),
  };
  return writeState(cwd, { ...state, active_work_item });
}

export function selectedTestProcesses(
  workItem: ActiveWorkItem,
): TestProcessSelection[] {
  return workItem.test_plan?.processes ?? [];
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
    'artifacts/04-design/selected-test-processes',
  );
  const fileName = path.split('/').at(-1);
  if (!fileName) throw new Error(`Invalid test process path: ${path}.`);
  const target = `${targetDirectory}/${fileName}`;
  mkdirSync(targetDirectory, { recursive: true });
  if (!existsSync(target)) copyFileSync(source, target);
  return artifactRelativePath(
    state,
    `artifacts/04-design/selected-test-processes/${fileName}`,
  );
}

export function selectTestProcess(
  cwd: string,
  runtime: TestProcessRuntime,
  functionalContexts: string[],
): WorkflowState {
  const state = readState(cwd);
  if (state.phase !== 'build') {
    throw new Error(
      `Cannot select a test process: current phase is ${state.phase}; expected build.`,
    );
  }
  if (!state.active_work_item) {
    throw new Error(
      'Cannot select a test process: select one US-xxx / SC-xxx work item first.',
    );
  }
  const candidates = matchingTestProcessesInDirectories(
    cwd,
    [catalogTestProcessDirectory(cwd)],
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
  if (!candidate)
    throw new Error('A uniquely matching test process was not found.');

  assertScenarioProcessSelection(
    artifactPath(cwd, state, 'artifacts/04-design/scenario-context-map.json'),
    state.active_work_item.story_id,
    state.active_work_item.scenario_id,
    runtime,
    functionalContexts,
    candidate.definition.id,
  );

  const selected = selectedTestProcesses(state.active_work_item);
  if (selected.some(({ id }) => id === candidate.definition.id)) {
    throw new Error(
      `Test process ${candidate.definition.id} is already selected for this work item.`,
    );
  }
  const selection: TestProcessSelection = {
    id: candidate.definition.id,
    path: snapshotCatalogProcess(cwd, state, candidate.path),
    runtime,
    functional_contexts: [...functionalContexts],
  };
  return writeState(cwd, {
    ...state,
    active_work_item: {
      ...state.active_work_item,
      test_plan: { version: 1, processes: [...selected, selection] },
    },
  });
}
