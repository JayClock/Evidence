import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { artifactRelativePath } from '../iteration/artifact-layout';
import {
  readState,
  selectedTestProcesses,
} from '../iteration/state-repository';
import type {
  ActiveWorkItem,
  PairDriverRecord,
  PairObservation,
  TaskingTestItem,
  TestProcessSelection,
  WorkflowState,
} from '../iteration/state';
import {
  assertLockedMaterializedPlan,
  readExecutionRecords,
  type TestExecutionRecord,
} from './execution-recorder';
import {
  readTestProcess,
  testProcessDefinitionSha256,
} from '../capabilities/test-process/catalog';

export interface ExecutionManifest {
  version: 1;
  story_id: string;
  scenario_id: string;
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
    scenario: string;
    model_expansion?: string;
    functional_contexts: string[];
    q1: TaskingTestItem[];
    q2: TaskingTestItem[];
  };
  processes: ExecutionProcessManifest[];
  showcase: {
    q2: Array<{
      process_id: string;
      step_id: string;
      test_ids: string[];
      command: string;
      sequence: number;
      exit_code: number;
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
    changed_paths: {
      tests: string[];
      production: string[];
    };
    red: PairObservation;
    green: Pick<TestExecutionRecord, 'sequence' | 'command' | 'exit_code'>;
    refactor: Pick<TestExecutionRecord, 'sequence' | 'command' | 'exit_code'>;
  }>;
  quality_gates: Array<{
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

function approvedPlanData(
  content: Buffer,
  workItem: ActiveWorkItem,
  selections: TestProcessSelection[],
): { tests: TaskingTestItem[] } {
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
    parsed.scenario_id !== workItem.scenario_id ||
    !Array.isArray(parsed.tests) ||
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
      (value.scenario_outcome === undefined ||
        typeof value.scenario_outcome === 'string') &&
      isStringArray(value.supported_by) &&
      isStringArray(value.business_data),
  );
  if (tests.length !== parsed.tests.length || tests.length === 0) {
    throw new Error(
      'Approved aggregate test plan has invalid test traceability.',
    );
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
      JSON.stringify(approved.functional_contexts) !==
        JSON.stringify(selection.functional_contexts) ||
      JSON.stringify(approved.technical_boundaries ?? []) !==
        JSON.stringify(selection.technical_boundaries ?? []) ||
      JSON.stringify(approved.selected_step_ids) !==
        JSON.stringify(selection.selected_step_ids)
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
      (selection.selected_step_ids ?? []).map(
        (stepId) => `${selection.id}/${stepId}`,
      ),
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
  return { tests };
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
  const ids =
    selection.selected_step_ids ?? definition.steps.map(({ id }) => id);
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
    `artifacts/05-code/${workItem.story_id}/${workItem.scenario_id}.execution.jsonl`,
  );
}

function manifestPath(state: WorkflowState, workItem: ActiveWorkItem): string {
  return artifactRelativePath(
    state,
    `artifacts/05-code/${workItem.story_id}/${workItem.scenario_id}.manifest.json`,
  );
}

function summaryPath(state: WorkflowState, workItem: ActiveWorkItem): string {
  return artifactRelativePath(
    state,
    `artifacts/05-code/${workItem.story_id}/${workItem.scenario_id}.summary.md`,
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
    record.git_baseline !== workItem.git_baseline ||
    record.approved_plan_sha256 !== approvedPlanSha256 ||
    !record.invocation ||
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
  stage: TestExecutionRecord['stage'],
  options: { after?: number; exitCode?: number } = {},
): TestExecutionRecord {
  const candidates = records.filter(
    (record) =>
      record.process_id === processId &&
      record.step_id === stepId &&
      record.stage === stage &&
      record.sequence > (options.after ?? 0) &&
      (options.exitCode === undefined || record.exit_code === options.exitCode),
  );
  const record = candidates.at(-1);
  if (!record) {
    throw new Error(
      `Execution log is incomplete: ${processId}/${stepId ?? 'quality_gate'} has no ${stage}.`,
    );
  }
  return record;
}

function acceptedRed(
  accepted: PairObservation[],
  records: TestExecutionRecord[],
  processId: string,
  stepId: string,
): PairObservation {
  const review = accepted.find(
    (candidate) =>
      candidate.process_id === processId && candidate.step_id === stepId,
  );
  if (
    !review ||
    review.accepted !== true ||
    review.failure_kind !== 'behavior' ||
    !review.review_reason?.trim() ||
    review.exit_code === 0
  ) {
    throw new Error(
      `Red for ${processId}/${stepId} lacks Navigator acceptance as an expected behavior failure.`,
    );
  }
  const raw = records.find(({ sequence }) => sequence === review.sequence);
  if (
    !raw ||
    raw.process_id !== processId ||
    raw.step_id !== stepId ||
    raw.stage !== 'red' ||
    raw.command !== review.command ||
    raw.exit_code !== review.exit_code ||
    raw.exit_code === 0 ||
    raw.expected_failure !== review.expected_failure ||
    !raw.expected_failure
  ) {
    throw new Error(
      `Navigator Red acceptance does not match execution record ${review.sequence}.`,
    );
  }
  return review;
}

function processManifest(
  cwd: string,
  selection: TestProcessSelection,
  tests: TaskingTestItem[],
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
  const steps = selectedSteps(cwd, selection).map((step) => {
    const red = acceptedRed(accepted, records, selection.id, step.id);
    const green = recordFor(records, selection.id, step.id, 'green', {
      after: red.sequence,
      exitCode: 0,
    });
    const refactor = recordFor(records, selection.id, step.id, 'refactor', {
      after: green.sequence,
      exitCode: 0,
    });
    const stepTests = tests.filter(
      ({ process_id, step_id }) =>
        process_id === selection.id && step_id === step.id,
    );
    if (stepTests.length === 0) {
      throw new Error(
        `Manifest step ${selection.id}/${step.id} has no test intent.`,
      );
    }
    const stepRuns = driverHistory.filter(
      ({ process_id, step_id }) =>
        process_id === selection.id && step_id === step.id,
    );
    const testPaths = [
      ...new Set(
        stepRuns
          .filter(({ mode }) => mode === 'test')
          .flatMap(({ changed_paths }) => changed_paths),
      ),
    ]
      .filter((path) => observedCodePaths.includes(path))
      .sort();
    const productionPaths = [
      ...new Set(
        stepRuns
          .filter(({ mode }) => mode !== 'test')
          .flatMap(({ changed_paths }) => changed_paths),
      ),
    ]
      .filter((path) => observedCodePaths.includes(path))
      .sort();
    if (testPaths.length === 0 || productionPaths.length === 0) {
      throw new Error(
        `Manifest step ${selection.id}/${step.id} lacks Git-observed test or production changes.`,
      );
    }
    return {
      id: step.id,
      quadrant: step.quadrant,
      purpose: step.purpose,
      real_boundaries: [...step.real_boundaries],
      replaced_boundaries: step.replaced_boundaries.map(
        ({ boundary, test_double }) => ({ boundary, test_double }),
      ),
      tests: stepTests,
      changed_paths: {
        tests: testPaths,
        production: productionPaths,
      },
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
  const lastStepSequence = Math.max(
    ...steps.map(({ refactor }) => refactor.sequence),
  );
  let after = Math.max(lastStepSequence, qualityGateAfter);
  const quality_gates = definition.quality_gates.map((command) => {
    const gate = records.find(
      (record) =>
        record.process_id === selection.id &&
        record.stage === 'quality_gate' &&
        record.command === command &&
        record.exit_code === 0 &&
        record.sequence > after,
    );
    if (!gate) {
      throw new Error(
        `Execution log is incomplete: ${selection.id} quality gate did not pass: ${command}.`,
      );
    }
    after = gate.sequence;
    return {
      command,
      sequence: gate.sequence,
      exit_code: gate.exit_code,
    };
  });
  return {
    id: selection.id,
    runtime: selection.runtime,
    functional_contexts: [...selection.functional_contexts],
    technical_boundaries: [...(selection.technical_boundaries ?? [])],
    definition_sha256: selection.definition_sha256,
    test_plan_sha256: selection.materialized_sha256,
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
  const expected = selections.flatMap((selection) => {
    return selectedSteps(cwd, selection)
      .filter(({ quadrant }) => quadrant === 'Q2')
      .map((step) => {
        const command = selection.focused_commands?.find(
          ({ step_id }) => step_id === step.id,
        )?.command;
        if (!command) {
          throw new Error(
            `Showcase Q2 command drifted: ${selection.id}/${step.id}.`,
          );
        }
        return {
          processId: selection.id,
          stepId: step.id,
          command,
          testIds: tests
            .filter(
              ({ quadrant, process_id, step_id }) =>
                quadrant === 'Q2' &&
                process_id === selection.id &&
                step_id === step.id,
            )
            .map(({ id }) => id),
        };
      });
  });
  if (expected.some(({ testIds }) => testIds.length === 0)) {
    throw new Error('A selected Showcase Q2 step has no approved Q2 intent.');
  }
  const observations = records
    .filter(({ stage }) => stage === 'showcase')
    .map((record) => {
      const match = expected.find(
        ({ processId, stepId, command }) =>
          processId === record.process_id &&
          stepId === record.step_id &&
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
        stdout_summary: record.stdout_summary ?? '',
        stderr_summary: record.stderr_summary ?? '',
      };
    });
  if (observations.length === 0) return { q2: [], status: 'not_run' };
  const latestPassed = expected.every(({ processId, stepId }) => {
    const latest = observations
      .filter(
        ({ process_id, step_id }) =>
          process_id === processId && step_id === stepId,
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
  if (processes.length === 0 || workItem.test_plan?.version !== 2) {
    throw new Error('Execution manifest requires an approved v2 test plan.');
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
  const last = records.at(-1);
  if (!last?.record_sha256 || !last.completed_at) {
    throw new Error('Execution log has no stable chain head.');
  }
  const tests = approved.tests;
  const scenario =
    state.confirmed_scenario?.artifact_path ??
    artifactRelativePath(
      state,
      `artifacts/01-requirements/examples/${workItem.story_id}-${workItem.scenario_id}.md`,
    );
  if (!existsSync(join(cwd, scenario))) {
    throw new Error(`Confirmed Scenario evidence is missing: ${scenario}.`);
  }
  if (
    state.model_expansion_path &&
    !existsSync(join(cwd, state.model_expansion_path))
  ) {
    throw new Error(
      `Model expansion evidence is missing: ${state.model_expansion_path}.`,
    );
  }
  return {
    version: 1,
    story_id: workItem.story_id,
    scenario_id: workItem.scenario_id,
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
      scenario,
      ...(state.model_expansion_path
        ? { model_expansion: state.model_expansion_path }
        : {}),
      functional_contexts: [
        ...new Set(
          processes.flatMap(({ functional_contexts }) => functional_contexts),
        ),
      ].sort(),
      q1: tests.filter(({ quadrant }) => quadrant === 'Q1'),
      q2: tests.filter(({ quadrant }) => quadrant === 'Q2'),
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
      process.steps.map(
        (step) =>
          `| ${process.id} | ${step.id} | ${step.quadrant} | ${step.tests.map(({ id }) => id).join(', ')} | ${[...step.changed_paths.tests, ...step.changed_paths.production].join('<br>')} | ${step.red.sequence} | ${step.green.sequence} | ${step.refactor.sequence} |`,
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
  return `# Execution Summary — ${manifest.story_id} / ${manifest.scenario_id}

> Deterministically generated from \`${manifest.source.execution_log}\` and the approved test plan. Do not edit by hand.

## Result

- Red: accepted expected behavior failure
- Green: passed
- Refactor: passed
- Quality gates: passed
- Git baseline: \`${manifest.source.git_baseline}\`
- Code content hash: \`${manifest.source.code_content_sha256}\`
- Model content hash: \`${manifest.source.model_content_sha256}\`
- Execution chain head: \`${manifest.source.chain_head}\`

## SC → Q1/Q2 → process trace

| Process | Step | Quadrant | Tests | Git-observed code | Red record | Green record | Refactor record |
| --- | --- | --- | --- | --- | ---: | ---: | ---: |
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
