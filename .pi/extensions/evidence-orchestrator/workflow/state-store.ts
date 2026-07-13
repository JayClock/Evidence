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
  Phase,
  TestProcessRuntime,
  TestProcessSelection,
  WorkflowState,
} from './types';

const CONFIGURABLE_PHASES = new Set(
  PHASE_ORDER.filter((phase) => phase !== 'complete'),
);

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
  if (state.pending_clarification && phase !== 'clarify') {
    throw new Error(
      'A pending clarification is only valid while the workflow is in clarify.',
    );
  }
  if (state.pending_clarification?.answer) {
    throw new Error(
      'A pending clarification must not already contain an answer.',
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
    ...(state.pending_clarification
      ? { pending_clarification: state.pending_clarification }
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
