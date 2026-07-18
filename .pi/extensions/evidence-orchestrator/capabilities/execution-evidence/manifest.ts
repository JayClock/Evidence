import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { artifactRelativePath } from '../../iteration/artifact-layout';
import {
  readState,
  selectedTestProcesses,
} from '../../iteration/state-repository';
import type {
  ActiveWorkItem,
  CommandTermination,
  PairDriverRecord,
  PairObservation,
  TaskingImplementationTask,
  TaskingTestItem,
  TestProcessSelection,
  WorkflowState,
} from '../../iteration/state';
import {
  assertLockedMaterializedPlan,
  readExecutionRecords,
  type TestExecutionRecord,
} from './observation-log';
import { verifyNoModelImpactEvidence } from '../modeling-evidence/no-model-impact';
import {
  readTestProcess,
  testProcessDefinitionSha256,
} from '../test-process/catalog';

export interface ExecutionManifest {
  version: 2;
  story_id: string;
  scenario_ids: string[];
  source: {
    execution_log: string;
    execution_log_sha256: string;
    record_count: number;
    chain_head: string;
    approved_test_plan: string;
    approved_test_plan_sha256: string;
    git_baseline: string;
    git_head: string;
    code_content_sha256: string;
    model_content_sha256: string;
    final_worktree_sha256: string;
    completed_at: string;
  };
  traceability: {
    scenarios: string[];
    model_expansion?: string;
    model_expansion_sha256?: string;
    model_decision?: string;
    functional_contexts: string[];
    q1: TaskingTestItem[];
    q2: TaskingTestItem[];
    tasks: TaskingImplementationTask[];
  };
  processes: ExecutionProcessManifest[];
  showcase: {
    q2: Array<{
      process_id: string;
      step_id: string;
      test_ids: string[];
      command: string;
      sequence: number;
      exit_code: number | null;
      termination: CommandTermination;
      stdout_summary: string;
      stderr_summary: string;
    }>;
    status: 'not_run' | 'failed' | 'passed';
  };
  changed_paths: {
    code: string[];
    tests: string[];
    production: string[];
    model: string[];
  };
  status: {
    red: 'accepted';
    green: 'passed';
    refactor: 'passed';
    quality_gates: 'passed';
    q2_showcase: 'not_run' | 'failed' | 'passed';
  };
}

export interface ExecutionProcessManifest {
  id: string;
  runtime: string;
  functional_contexts: string[];
  technical_boundaries: string[];
  definition_sha256: string;
  test_plan_sha256: string;
  project_ids: string[];
  project_catalog_sha256?: string;
  focused_commands: TestProcessSelection['focused_commands'];
  steps: Array<{
    id: string;
    quadrant: 'Q1' | 'Q2';
    purpose: string;
    real_boundaries: string[];
    replaced_boundaries: Array<{
      boundary: string;
      test_double: string;
    }>;
    tests: TaskingTestItem[];
    work_units: Array<{
      task: TaskingImplementationTask;
      test: TaskingTestItem;
      changed_paths: {
        tests: string[];
        production: string[];
      };
      red: PairObservation;
      green: Pick<TestExecutionRecord, 'sequence' | 'command' | 'exit_code'>;
      refactor: Pick<TestExecutionRecord, 'sequence' | 'command' | 'exit_code'>;
    }>;
    changed_paths: {
      tests: string[];
      production: string[];
    };
  }>;
  quality_gates: Array<{
    project_id?: string;
    target?: string;
    command: string;
    sequence: number;
    exit_code: number;
  }>;
}

export interface GeneratedExecutionEvidence {
  manifest: ExecutionManifest;
  manifestPath: string;
  summaryPath: string;
  manifestContent: string;
  summaryContent: string;
}

const SHA256 = /^[0-9a-f]{64}$/;

function digest(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
  }).trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((entry) => typeof entry === 'string')
  );
}

function isModelRefs(
  value: unknown,
): value is { entities: string[]; associations: string[] } {
  return (
    isRecord(value) &&
    isStringArray(value.entities) &&
    isStringArray(value.associations)
  );
}

function approvedPlanData(
  content: Buffer,
  workItem: ActiveWorkItem,
  selections: TestProcessSelection[],
): { tests: TaskingTestItem[]; tasks: TaskingImplementationTask[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content.toString('utf8')) as unknown;
  } catch {
    throw new Error('Approved aggregate test plan is not valid JSON.');
  }
  if (
    !isRecord(parsed) ||
    parsed.version !== 2 ||
    parsed.story_id !== workItem.story_id ||
    JSON.stringify(parsed.scenario_ids) !==
      JSON.stringify(workItem.scenario_ids) ||
    !Array.isArray(parsed.tests) ||
    !Array.isArray(parsed.tasks) ||
    !Array.isArray(parsed.processes)
  ) {
    throw new Error(
      'Approved aggregate test plan does not match the work item.',
    );
  }
  const tests = parsed.tests.filter(
    (value): value is TaskingTestItem =>
      isRecord(value) &&
      typeof value.id === 'string' &&
      (value.quadrant === 'Q1' || value.quadrant === 'Q2') &&
      typeof value.intent === 'string' &&
      typeof value.runtime_plan_id === 'string' &&
      typeof value.process_id === 'string' &&
      typeof value.step_id === 'string' &&
      (value.project_id === undefined ||
        typeof value.project_id === 'string') &&
      (value.scenario_outcome === undefined ||
        typeof value.scenario_outcome === 'string') &&
      isStringArray(value.supported_by) &&
      isStringArray(value.business_data) &&
      isModelRefs(value.model_refs),
  );
  if (tests.length !== parsed.tests.length || tests.length === 0) {
    throw new Error(
      'Approved aggregate test plan has invalid test traceability.',
    );
  }
  const tasks = parsed.tasks.filter(
    (value): value is TaskingImplementationTask =>
      isRecord(value) &&
      typeof value.id === 'string' &&
      typeof value.description === 'string' &&
      isStringArray(value.test_ids) &&
      isStringArray(value.depends_on) &&
      isModelRefs(value.model_refs),
  );
  if (tasks.length !== parsed.tasks.length || tasks.length === 0) {
    throw new Error(
      'Approved aggregate test plan has invalid task traceability.',
    );
  }
  const ownedTestIds = tasks.flatMap(({ test_ids }) => test_ids);
  if (
    ownedTestIds.length !== tests.length ||
    new Set(ownedTestIds).size !== tests.length ||
    tests.some(({ id }) => !ownedTestIds.includes(id))
  ) {
    throw new Error('Every approved TEST must belong to exactly one TASK.');
  }
  for (const task of tasks) {
    const linked = tests.filter(({ id }) => task.test_ids.includes(id));
    const expected = {
      entities: [
        ...new Set(linked.flatMap(({ model_refs }) => model_refs.entities)),
      ].sort(),
      associations: [
        ...new Set(linked.flatMap(({ model_refs }) => model_refs.associations)),
      ].sort(),
    };
    if (JSON.stringify(task.model_refs) !== JSON.stringify(expected)) {
      throw new Error(`${task.id} model traceability drifted from its TESTs.`);
    }
  }
  for (const selection of selections) {
    const approved = parsed.processes.find(
      (value) =>
        isRecord(value) &&
        value.id === selection.id &&
        value.path === selection.path,
    );
    if (
      !isRecord(approved) ||
      approved.runtime !== selection.runtime ||
      approved.definition_sha256 !== selection.definition_sha256 ||
      approved.materialized_sha256 !== selection.materialized_sha256 ||
      approved.materialized_plan_path !== selection.materialized_plan_path ||
      approved.project_catalog_sha256 !== selection.project_catalog_sha256 ||
      approved.project_catalog_path !== selection.project_catalog_path ||
      JSON.stringify(approved.functional_contexts) !==
        JSON.stringify(selection.functional_contexts) ||
      JSON.stringify(approved.technical_boundaries) !==
        JSON.stringify(selection.technical_boundaries) ||
      JSON.stringify(approved.selected_step_ids) !==
        JSON.stringify(selection.selected_step_ids) ||
      JSON.stringify(approved.project_ids) !==
        JSON.stringify(selection.project_ids) ||
      JSON.stringify(approved.command_variables_by_test) !==
        JSON.stringify(selection.command_variables_by_test) ||
      JSON.stringify(approved.focused_commands) !==
        JSON.stringify(selection.focused_commands) ||
      JSON.stringify(approved.quality_gate_commands) !==
        JSON.stringify(selection.quality_gate_commands)
    ) {
      throw new Error(
        `Selected process drifted from the approved aggregate test plan: ${selection.id}.`,
      );
    }
  }
  if (parsed.processes.length !== selections.length) {
    throw new Error('Approved aggregate test plan process count drifted.');
  }
  const selectedStepKeys = new Set(
    selections.flatMap((selection) =>
      selection.selected_step_ids.map((stepId) => `${selection.id}/${stepId}`),
    ),
  );
  const testIds = new Set(tests.map(({ id }) => id));
  if (
    tests.some(
      (test) =>
        !selectedStepKeys.has(`${test.process_id}/${test.step_id}`) ||
        test.supported_by.some((id) => !testIds.has(id)),
    )
  ) {
    throw new Error(
      'Approved test traceability does not match selected process steps.',
    );
  }
  return { tests, tasks };
}

function gitChangedContentSha256(
  cwd: string,
  baseline: string,
  roots: string[],
): string {
  const hash = createHash('sha256');
  hash.update(
    execFileSync('git', ['diff', '--binary', baseline, '--', ...roots], {
      cwd,
      maxBuffer: 50 * 1024 * 1024,
    }),
  );
  const untracked = git(cwd, [
    'ls-files',
    '--others',
    '--exclude-standard',
    '--',
    ...roots,
  ])
    .split('\n')
    .filter(Boolean)
    .sort();
  for (const path of untracked) {
    hash.update(`\0${path}\0`);
    hash.update(readFileSync(join(cwd, path)));
  }
  return hash.digest('hex');
}

function gitChangedPaths(
  cwd: string,
  baseline: string,
  roots: string[],
): string[] {
  execFileSync('git', ['cat-file', '-e', `${baseline}^{commit}`], { cwd });
  const tracked = git(cwd, [
    'diff',
    '--name-only',
    baseline,
    '--',
    ...roots,
  ]).split('\n');
  const untracked = git(cwd, [
    'ls-files',
    '--others',
    '--exclude-standard',
    '--',
    ...roots,
  ]).split('\n');
  return [...new Set([...tracked, ...untracked].filter(Boolean))].sort();
}

function selectedSteps(
  cwd: string,
  selection: TestProcessSelection,
): ReturnType<typeof readTestProcess>['steps'] {
  const definition = readTestProcess(join(cwd, selection.path));
  const ids = selection.selected_step_ids;
  const steps = definition.steps.filter(({ id }) => ids.includes(id));
  if (steps.length !== ids.length) {
    throw new Error(
      `Manifest process step selection drifted: ${selection.id}.`,
    );
  }
  return steps;
}

function executionPath(state: WorkflowState, workItem: ActiveWorkItem): string {
  return artifactRelativePath(
    state,
    `artifacts/05-code/${workItem.story_id}/execution.jsonl`,
  );
}

function manifestPath(state: WorkflowState, workItem: ActiveWorkItem): string {
  return artifactRelativePath(
    state,
    `artifacts/05-code/${workItem.story_id}/manifest.json`,
  );
}

function summaryPath(state: WorkflowState, workItem: ActiveWorkItem): string {
  return artifactRelativePath(
    state,
    `artifacts/05-code/${workItem.story_id}/summary.md`,
  );
}

function assertV2Record(
  record: TestExecutionRecord,
  workItem: ActiveWorkItem,
  approvedPlanSha256: string,
): void {
  if (
    record.version !== 2 ||
    !SHA256.test(record.stdout_sha256) ||
    !SHA256.test(record.stderr_sha256) ||
    !SHA256.test(record.worktree_sha256) ||
    !SHA256.test(record.record_sha256 ?? '') ||
    typeof record.stdout_summary !== 'string' ||
    typeof record.stderr_summary !== 'string' ||
    record.stdout_diagnostic?.sha256 !== record.stdout_sha256 ||
    record.stderr_diagnostic?.sha256 !== record.stderr_sha256 ||
    record.git_baseline !== workItem.git_baseline ||
    record.approved_plan_sha256 !== approvedPlanSha256 ||
    !record.invocation ||
    (['red', 'green', 'refactor'].includes(record.stage) &&
      (!record.task_id || !record.test_id || !record.step_id)) ||
    !record.started_at ||
    !record.completed_at
  ) {
    throw new Error(
      `Execution record ${record.sequence} lacks complete v2 observation data.`,
    );
  }
}

function recordFor(
  records: TestExecutionRecord[],
  processId: string,
  stepId: string | undefined,
  taskId: string,
  testId: string,
  stage: TestExecutionRecord['stage'],
  options: { after?: number; exitCode?: number } = {},
): TestExecutionRecord {
  const candidates = records.filter(
    (record) =>
      record.process_id === processId &&
      record.step_id === stepId &&
      record.task_id === taskId &&
      record.test_id === testId &&
      record.stage === stage &&
      record.sequence > (options.after ?? 0) &&
      (options.exitCode === undefined || record.exit_code === options.exitCode),
  );
  const record = candidates.at(-1);
  if (!record) {
    throw new Error(
      `Execution log is incomplete: ${taskId}/${testId} at ${processId}/${stepId ?? 'quality_gate'} has no ${stage}.`,
    );
  }
  return record;
}

function processStepRefactorFor(
  records: TestExecutionRecord[],
  processId: string,
  stepId: string,
  after: number,
): TestExecutionRecord {
  const record = records
    .filter(
      (candidate) =>
        candidate.process_id === processId &&
        candidate.step_id === stepId &&
        candidate.stage === 'refactor' &&
        candidate.exit_code === 0 &&
        candidate.sequence > after,
    )
    .at(-1);
  if (!record) {
    throw new Error(
      `Execution log is incomplete: ${processId}/${stepId} has no successful process-step refactor after Green.`,
    );
  }
  return record;
}

function acceptedRed(
  accepted: PairObservation[],
  records: TestExecutionRecord[],
  processId: string,
  stepId: string,
  taskId: string,
  testId: string,
): PairObservation {
  const review = accepted.find(
    (candidate) =>
      candidate.process_id === processId &&
      candidate.step_id === stepId &&
      candidate.task_id === taskId &&
      candidate.test_id === testId,
  );
  if (
    !review ||
    review.accepted !== true ||
    review.failure_kind !== 'behavior' ||
    !['human', 'red-reviewer'].includes(review.reviewed_by ?? '') ||
    !review.review_reason?.trim() ||
    review.exit_code === 0
  ) {
    throw new Error(
      `Red for ${taskId}/${testId} at ${processId}/${stepId} lacks a recorded expected-behavior classification.`,
    );
  }
  const raw = records.find(({ sequence }) => sequence === review.sequence);
  if (
    !raw ||
    raw.process_id !== processId ||
    raw.step_id !== stepId ||
    raw.task_id !== taskId ||
    raw.test_id !== testId ||
    raw.stage !== 'red' ||
    raw.command !== review.command ||
    raw.exit_code !== review.exit_code ||
    raw.exit_code === 0 ||
    raw.expected_failure !== review.expected_failure ||
    !raw.expected_failure
  ) {
    throw new Error(
      `Recorded Red classification does not match execution record ${review.sequence}.`,
    );
  }
  return review;
}

function processManifest(
  cwd: string,
  selection: TestProcessSelection,
  tests: TaskingTestItem[],
  tasks: TaskingImplementationTask[],
  accepted: PairObservation[],
  records: TestExecutionRecord[],
  driverHistory: PairDriverRecord[],
  observedCodePaths: string[],
  qualityGateAfter: number,
): ExecutionProcessManifest {
  const definition = readTestProcess(join(cwd, selection.path));
  assertLockedMaterializedPlan(cwd, selection, definition);
  if (
    testProcessDefinitionSha256(join(cwd, selection.path)) !==
    selection.definition_sha256
  ) {
    throw new Error(`Manifest process definition drifted: ${selection.id}.`);
  }
  const unitOrder = new Map(
    tasks
      .flatMap(({ test_ids }) => test_ids)
      .map((testId, index) => [testId, index]),
  );
  const steps = selectedSteps(cwd, selection).map((step) => {
    const stepTests = tests
      .filter(
        ({ process_id, step_id }) =>
          process_id === selection.id && step_id === step.id,
      )
      .sort(
        (left, right) =>
          (unitOrder.get(left.id) ?? 0) - (unitOrder.get(right.id) ?? 0),
      );
    if (stepTests.length === 0) {
      throw new Error(
        `Manifest step ${selection.id}/${step.id} has no test intent.`,
      );
    }
    const workUnits = stepTests.map((test) => {
      const owners = tasks.filter(({ test_ids }) => test_ids.includes(test.id));
      const task = owners[0];
      if (owners.length !== 1 || !task) {
        throw new Error(`${test.id} must have exactly one TASK owner.`);
      }
      const red = acceptedRed(
        accepted,
        records,
        selection.id,
        step.id,
        task.id,
        test.id,
      );
      const green = recordFor(
        records,
        selection.id,
        step.id,
        task.id,
        test.id,
        'green',
        { after: red.sequence, exitCode: 0 },
      );
      const refactor = processStepRefactorFor(
        records,
        selection.id,
        step.id,
        green.sequence,
      );
      const runs = driverHistory.filter(
        ({ task_id, test_id }) => task_id === task.id && test_id === test.id,
      );
      if (
        runs.some(
          ({ model_refs }) =>
            JSON.stringify(model_refs) !== JSON.stringify(test.model_refs),
        )
      ) {
        throw new Error(`${task.id}/${test.id} model traceability drifted.`);
      }
      const testPaths = [
        ...new Set(
          runs
            .filter(({ mode }) => mode === 'test')
            .flatMap(({ changed_paths }) => changed_paths),
        ),
      ]
        .filter((path) => observedCodePaths.includes(path))
        .sort();
      const productionPaths = [
        ...new Set(
          runs
            .filter(({ mode }) => mode !== 'test')
            .flatMap(({ changed_paths }) => changed_paths),
        ),
      ]
        .filter((path) => observedCodePaths.includes(path))
        .sort();
      if (testPaths.length === 0 || productionPaths.length === 0) {
        throw new Error(
          `Manifest unit ${task.id}/${test.id} lacks Git-observed test or production changes.`,
        );
      }
      return {
        task,
        test,
        changed_paths: { tests: testPaths, production: productionPaths },
        red,
        green: {
          sequence: green.sequence,
          command: green.command,
          exit_code: green.exit_code,
        },
        refactor: {
          sequence: refactor.sequence,
          command: refactor.command,
          exit_code: refactor.exit_code,
        },
      };
    });
    return {
      id: step.id,
      quadrant: step.quadrant,
      purpose: step.purpose,
      real_boundaries: [...step.real_boundaries],
      replaced_boundaries: step.replaced_boundaries.map(
        ({ boundary, test_double }) => ({ boundary, test_double }),
      ),
      tests: stepTests,
      work_units: workUnits,
      changed_paths: {
        tests: [
          ...new Set(
            workUnits.flatMap(({ changed_paths }) => changed_paths.tests),
          ),
        ].sort(),
        production: [
          ...new Set(
            workUnits.flatMap(({ changed_paths }) => changed_paths.production),
          ),
        ].sort(),
      },
    };
  });
  const lastStepSequence = Math.max(
    ...steps.flatMap(({ work_units }) =>
      work_units.map(({ refactor }) => refactor.sequence),
    ),
  );
  let after = Math.max(lastStepSequence, qualityGateAfter);
  const quality_gates = selection.quality_gate_commands.map((expected) => {
    const gate = records.find(
      (record) =>
        record.process_id === selection.id &&
        record.stage === 'quality_gate' &&
        record.command === expected.command &&
        record.exit_code === 0 &&
        record.sequence > after,
    );
    if (!gate) {
      throw new Error(
        `Execution log is incomplete: ${selection.id} quality gate did not pass: ${expected.command}.`,
      );
    }
    after = gate.sequence;
    return {
      ...(expected.project_id ? { project_id: expected.project_id } : {}),
      ...(expected.target ? { target: expected.target } : {}),
      command: expected.command,
      sequence: gate.sequence,
      exit_code: 0,
    };
  });
  return {
    id: selection.id,
    runtime: selection.runtime,
    functional_contexts: [...selection.functional_contexts],
    technical_boundaries: [...selection.technical_boundaries],
    definition_sha256: selection.definition_sha256,
    test_plan_sha256: selection.materialized_sha256,
    project_ids: [...selection.project_ids],
    ...(selection.project_catalog_sha256
      ? { project_catalog_sha256: selection.project_catalog_sha256 }
      : {}),
    focused_commands: selection.focused_commands,
    steps,
    quality_gates,
  };
}

function showcaseManifest(
  cwd: string,
  selections: TestProcessSelection[],
  tests: TaskingTestItem[],
  records: TestExecutionRecord[],
): ExecutionManifest['showcase'] {
  const expected = tests
    .filter(({ quadrant }) => quadrant === 'Q2')
    .map((test) => {
      const selection = selections.find(({ id }) => id === test.process_id);
      const step = selection
        ? selectedSteps(cwd, selection).find(({ id }) => id === test.step_id)
        : undefined;
      const command = selection?.focused_commands.find(
        ({ test_id }) => test_id === test.id,
      )?.command;
      if (!selection || !step || step.quadrant !== 'Q2' || !command) {
        throw new Error(
          `Showcase Q2 command drifted: ${test.process_id}/${test.step_id}/${test.id}.`,
        );
      }
      return {
        processId: selection.id,
        stepId: step.id,
        testId: test.id,
        command,
        testIds: [test.id],
      };
    });
  if (expected.length === 0) {
    throw new Error('The approved plan has no Showcase Q2 TEST intent.');
  }
  const observations = records
    .filter(({ stage }) => stage === 'showcase')
    .map((record) => {
      const match = expected.find(
        ({ processId, stepId, testId, command }) =>
          processId === record.process_id &&
          stepId === record.step_id &&
          testId === record.test_id &&
          command === record.command,
      );
      if (!match) {
        throw new Error(
          `Execution record ${record.sequence} is not an approved Showcase Q2 command.`,
        );
      }
      return {
        process_id: record.process_id,
        step_id: record.step_id ?? '',
        test_ids: match.testIds,
        command: record.command,
        sequence: record.sequence,
        exit_code: record.exit_code,
        termination: record.termination,
        stdout_summary: record.stdout_summary ?? '',
        stderr_summary: record.stderr_summary ?? '',
      };
    });
  if (observations.length === 0) return { q2: [], status: 'not_run' };
  const latestPassed = expected.every(({ processId, stepId, testId }) => {
    const latest = observations
      .filter(
        ({ process_id, step_id, test_ids }) =>
          process_id === processId &&
          step_id === stepId &&
          test_ids.includes(testId),
      )
      .at(-1);
    return latest?.exit_code === 0;
  });
  return {
    q2: observations,
    status: latestPassed ? 'passed' : 'failed',
  };
}

function buildManifest(
  cwd: string,
  state: WorkflowState,
  workItem: ActiveWorkItem,
): ExecutionManifest {
  const processes = selectedTestProcesses(workItem);
  if (processes.length === 0 || workItem.test_plan.version !== 2) {
    throw new Error('Execution manifest requires an approved v3 process plan.');
  }
  if (!state.approved_test_plan_path) {
    throw new Error('Execution manifest requires an approved Tasking plan.');
  }
  const approvedAbsolute = join(cwd, state.approved_test_plan_path);
  if (!existsSync(approvedAbsolute)) {
    throw new Error(
      `Approved test plan is missing: ${state.approved_test_plan_path}.`,
    );
  }
  const approvedPlanContent = readFileSync(approvedAbsolute);
  const approvedPlanSha256 = digest(approvedPlanContent);
  if (approvedPlanSha256 !== state.approved_test_plan_sha256) {
    throw new Error('Approved aggregate test plan hash drifted.');
  }
  const approved = approvedPlanData(approvedPlanContent, workItem, processes);
  const logPath = executionPath(state, workItem);
  const logAbsolute = join(cwd, logPath);
  const records = readExecutionRecords(logAbsolute);
  if (records.length === 0) {
    throw new Error(`Execution log is empty: ${logPath}.`);
  }
  for (const record of records) {
    assertV2Record(record, workItem, approvedPlanSha256);
    const selection = processes.find(({ id }) => id === record.process_id);
    if (
      !selection ||
      record.definition_sha256 !== selection.definition_sha256 ||
      record.test_plan_sha256 !== selection.materialized_sha256
    ) {
      throw new Error(
        `Execution record ${record.sequence} drifted from its selected process plan.`,
      );
    }
  }
  const pairSession = state.pair_session;
  if (!pairSession) {
    throw new Error('Execution manifest requires a completed Pair session.');
  }
  if (
    approved.tests.some(
      ({ id }) => !pairSession.completed_test_ids.includes(id),
    ) ||
    approved.tasks.some(
      ({ id }) => !pairSession.completed_task_ids.includes(id),
    )
  ) {
    throw new Error(
      'Execution manifest requires every approved TASK/TEST unit to complete.',
    );
  }
  const code = gitChangedPaths(cwd, workItem.git_baseline, ['apps', 'libs']);
  const qualityGateAfter = Math.max(
    0,
    ...records
      .filter(({ stage, exit_code }) => stage === 'refactor' && exit_code === 0)
      .map(({ sequence }) => sequence),
  );
  const processManifests = processes.map((selection) =>
    processManifest(
      cwd,
      selection,
      approved.tests,
      approved.tasks,
      pairSession.accepted_reds,
      records,
      pairSession.driver_history,
      code,
      qualityGateAfter,
    ),
  );
  const showcase = showcaseManifest(cwd, processes, approved.tests, records);
  const testPaths = [...new Set(pairSession.test_paths)]
    .filter((path) => code.includes(path))
    .sort();
  const productionPaths = [...new Set(pairSession.production_paths)]
    .filter((path) => code.includes(path))
    .sort();
  if (
    testPaths.length === 0 ||
    productionPaths.length === 0 ||
    code.some(
      (path) => !testPaths.includes(path) && !productionPaths.includes(path),
    )
  ) {
    throw new Error(
      'Execution manifest requires every Git-observed code path to be classified as test or production.',
    );
  }
  const modelBaseline = state.model_git_baseline ?? workItem.git_baseline;
  const model = gitChangedPaths(cwd, modelBaseline, ['.evidence']);
  if (state.model_change_proposal) {
    const expected = state.model_change_proposal.operations
      .map(({ path }) => path)
      .sort();
    const applied = state.model_change_application?.changed_paths ?? [];
    const contentDrift = state.model_change_proposal.operations.some(
      (operation) => {
        const absolute = join(cwd, operation.path);
        if (operation.action === 'remove') return existsSync(absolute);
        if (!existsSync(absolute) || operation.content === undefined)
          return true;
        return (
          readFileSync(absolute, 'utf8') !== `${operation.content.trim()}\n`
        );
      },
    );
    if (
      state.model_change_application?.git_baseline !== workItem.git_baseline ||
      JSON.stringify([...applied].sort()) !== JSON.stringify(expected) ||
      JSON.stringify(model) !== JSON.stringify(expected) ||
      contentDrift
    ) {
      throw new Error(
        'Execution manifest requires the human-confirmed model proposal to be applied on the Pair baseline.',
      );
    }
  } else if (state.model_change_application || model.length > 0) {
    throw new Error(
      'Execution manifest observed an unapproved canonical model change.',
    );
  }
  const last = records.at(-1);
  if (!last?.record_sha256 || !last.completed_at) {
    throw new Error('Execution log has no stable chain head.');
  }
  const tests = approved.tests;
  const scenarioPaths = (state.confirmed_scenarios ?? []).map(
    ({ artifact_path }) => artifact_path,
  );
  if (
    scenarioPaths.length !== workItem.scenario_ids.length ||
    scenarioPaths.some((path) => !existsSync(join(cwd, path)))
  ) {
    throw new Error('Complete confirmed Scenario Set evidence is required.');
  }
  if (
    state.model_expansion_path &&
    !existsSync(join(cwd, state.model_expansion_path))
  ) {
    throw new Error(
      `Model expansion evidence is missing: ${state.model_expansion_path}.`,
    );
  }
  const modelExpansionSha256 = state.model_expansion_path
    ? digest(readFileSync(join(cwd, state.model_expansion_path)))
    : undefined;
  let modelingDecisionPath: string;
  if (state.modeling_profile?.method === 'none') {
    modelingDecisionPath = verifyNoModelImpactEvidence(cwd, state);
  } else {
    const modelDecision = state.model_decisions?.at(-1);
    if (
      !modelDecision ||
      modelDecision.action !== 'confirm' ||
      !existsSync(join(cwd, modelDecision.artifact_path)) ||
      JSON.stringify(
        JSON.parse(
          readFileSync(join(cwd, modelDecision.artifact_path), 'utf8'),
        ) as unknown,
      ) !== JSON.stringify(modelDecision) ||
      modelDecision.model_expansion_sha256 !== modelExpansionSha256
    ) {
      throw new Error(
        'Execution manifest requires the unchanged human-confirmed model expansion.',
      );
    }
    modelingDecisionPath = modelDecision.artifact_path;
  }
  return {
    version: 2,
    story_id: workItem.story_id,
    scenario_ids: workItem.scenario_ids,
    source: {
      execution_log: logPath,
      execution_log_sha256: digest(readFileSync(logAbsolute)),
      record_count: records.length,
      chain_head: last.record_sha256,
      approved_test_plan: state.approved_test_plan_path,
      approved_test_plan_sha256: approvedPlanSha256,
      git_baseline: workItem.git_baseline,
      git_head: git(cwd, ['rev-parse', '--verify', 'HEAD']),
      code_content_sha256: gitChangedContentSha256(cwd, workItem.git_baseline, [
        'apps',
        'libs',
      ]),
      model_content_sha256: gitChangedContentSha256(cwd, modelBaseline, [
        '.evidence',
      ]),
      final_worktree_sha256: last.worktree_sha256,
      completed_at: last.completed_at,
    },
    traceability: {
      scenarios: scenarioPaths,
      ...(state.model_expansion_path && modelExpansionSha256
        ? {
            model_expansion: state.model_expansion_path,
            model_expansion_sha256: modelExpansionSha256,
            model_decision: modelingDecisionPath,
          }
        : {}),
      functional_contexts: [
        ...new Set(
          processes.flatMap(({ functional_contexts }) => functional_contexts),
        ),
      ].sort(),
      q1: tests.filter(({ quadrant }) => quadrant === 'Q1'),
      q2: tests.filter(({ quadrant }) => quadrant === 'Q2'),
      tasks: approved.tasks,
    },
    processes: processManifests,
    showcase,
    changed_paths: {
      code,
      tests: testPaths,
      production: productionPaths,
      model,
    },
    status: {
      red: 'accepted',
      green: 'passed',
      refactor: 'passed',
      quality_gates: 'passed',
      q2_showcase: showcase.status,
    },
  };
}

function renderSummary(manifest: ExecutionManifest): string {
  const processRows = manifest.processes
    .flatMap((process) =>
      process.steps.flatMap((step) =>
        step.work_units.map(
          ({ task, test, changed_paths, red, green, refactor }) =>
            `| ${task.id} | ${test.id} | ${test.project_id ?? 'n/a'} | ${test.model_refs.entities.join(', ') || 'none'} / ${test.model_refs.associations.join(', ') || 'none'} | ${process.id} | ${step.id} | ${step.quadrant} | ${[...changed_paths.tests, ...changed_paths.production].join('<br>')} | ${red.sequence} | ${red.reviewed_by ?? 'legacy-human'} | ${green.sequence} | ${refactor.sequence} |`,
        ),
      ),
    )
    .join('\n');
  const gates = manifest.processes
    .flatMap((process) =>
      process.quality_gates.map(
        ({ command, sequence }) =>
          `- ${process.id} · record ${sequence} · \`${command}\``,
      ),
    )
    .join('\n');
  const showcase = manifest.showcase.q2.length
    ? manifest.showcase.q2
        .map(
          ({ process_id, step_id, sequence, exit_code, command }) =>
            `- ${process_id}/${step_id} · record ${sequence} · exit ${exit_code} · \`${command}\``,
        )
        .join('\n')
    : '- not run';
  return `# Execution Summary — ${manifest.story_id} / [${manifest.scenario_ids.join(', ')}]

> Deterministically generated from \`${manifest.source.execution_log}\` and the approved test plan. Do not edit by hand.

## Result

- Red: independently classified expected behavior failure
- Green: passed
- Refactor: passed
- Quality gates: passed
- Git baseline: \`${manifest.source.git_baseline}\`
- Code content hash: \`${manifest.source.code_content_sha256}\`
- Model content hash: \`${manifest.source.model_content_sha256}\`
- Execution chain head: \`${manifest.source.chain_head}\`

## SC → model → TASK/TEST → process → code trace

| Task | Test | Nx project | Model refs (entities / associations) | Process | Step | Quadrant | Git-observed code | Red record | Red reviewer | Green record | Refactor record |
| --- | --- | --- | --- | --- | --- | --- | --- | ---: | --- | ---: | ---: |
${processRows}

Functional contexts: ${manifest.traceability.functional_contexts.join(', ')}

## Final quality gates

${gates}

## Showcase Q2 (${manifest.showcase.status})

${showcase}

## Git-observed changed paths

### Tests
${manifest.changed_paths.tests.map((path) => `- ${path}`).join('\n')}

### Production
${manifest.changed_paths.production.map((path) => `- ${path}`).join('\n')}

### Model
${manifest.changed_paths.model.map((path) => `- ${path}`).join('\n') || '- none'}
`;
}

export function generateExecutionEvidence(
  cwd: string,
  workItem?: ActiveWorkItem,
): GeneratedExecutionEvidence {
  const state = readState(cwd);
  const selected = workItem ?? state.active_work_item;
  if (!selected)
    throw new Error('No active work item can generate execution evidence.');
  const manifest = buildManifest(cwd, state, selected);
  const manifestContent = `${JSON.stringify(manifest, null, 2)}\n`;
  const summaryContent = renderSummary(manifest);
  const generatedManifestPath = manifestPath(state, selected);
  const generatedSummaryPath = summaryPath(state, selected);
  mkdirSync(dirname(join(cwd, generatedManifestPath)), { recursive: true });
  writeFileSync(join(cwd, generatedManifestPath), manifestContent);
  writeFileSync(join(cwd, generatedSummaryPath), summaryContent);
  return {
    manifest,
    manifestPath: generatedManifestPath,
    summaryPath: generatedSummaryPath,
    manifestContent,
    summaryContent,
  };
}

export function validateExecutionEvidence(
  cwd: string,
  workItem?: ActiveWorkItem,
): ExecutionManifest {
  const state = readState(cwd);
  const selected = workItem ?? state.active_work_item;
  if (!selected) throw new Error('No active work item has execution evidence.');
  const expected = buildManifest(cwd, state, selected);
  const expectedManifest = `${JSON.stringify(expected, null, 2)}\n`;
  const expectedSummary = renderSummary(expected);
  const generatedManifestPath = manifestPath(state, selected);
  const generatedSummaryPath = summaryPath(state, selected);
  if (
    !existsSync(join(cwd, generatedManifestPath)) ||
    readFileSync(join(cwd, generatedManifestPath), 'utf8') !== expectedManifest
  ) {
    throw new Error(
      `Generated execution manifest is missing or stale: ${generatedManifestPath}.`,
    );
  }
  if (
    existsSync(join(cwd, generatedSummaryPath)) &&
    readFileSync(join(cwd, generatedSummaryPath), 'utf8') !== expectedSummary
  ) {
    throw new Error(
      `Generated execution summary is stale: ${generatedSummaryPath}.`,
    );
  }
  return expected;
}

export function executionEvidencePaths(cwd: string): {
  log?: string;
  manifest?: string;
  summary?: string;
} {
  const state = readState(cwd);
  const workItem = state.active_work_item;
  if (!workItem) return {};
  return {
    log: executionPath(state, workItem),
    manifest: manifestPath(state, workItem),
    summary: summaryPath(state, workItem),
  };
}
