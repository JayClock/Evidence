import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  artifactPath,
  artifactRelativePath,
} from '../../iteration/artifact-layout';
import {
  readState,
  selectedTestProcesses,
} from '../../iteration/state-repository';
import {
  materializeFocusedCommands,
  materializedProcessSha256,
  readTestProcess,
  testProcessDefinitionSha256,
} from '../test-process/catalog';

export type TestExecutionStage =
  | 'red'
  | 'green'
  | 'refactor'
  | 'quality_gate'
  | 'showcase';

export interface TestExecutionRequest {
  processId: string;
  stage: TestExecutionStage;
  stepId?: string;
  command: string;
  invocation?:
    | 'pair-controller'
    | 'showcase-controller'
    | 'model-tool'
    | 'command'
    | 'test-tool';
}

export interface TestExecutionRecord {
  version: 2;
  process_id: string;
  stage: TestExecutionStage;
  step_id?: string;
  command: string;
  sequence: number;
  exit_code: number;
  expected_failure: boolean;
  started_at: string;
  completed_at: string;
  stdout_sha256: string;
  stderr_sha256: string;
  stdout_summary?: string;
  stderr_summary?: string;
  git_head: string;
  git_baseline?: string;
  worktree_sha256: string;
  definition_sha256?: string;
  test_plan_sha256?: string;
  approved_plan_sha256?: string;
  invocation?: string;
  previous_record_sha256?: string;
  record_sha256?: string;
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function git(cwd: string, args: string[]): string {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8' });
  } catch {
    return 'unavailable';
  }
}

function worktreeDigest(cwd: string): string {
  return digest(
    `${git(cwd, ['status', '--porcelain=v1', '--untracked-files=all'])}\n${git(cwd, ['diff', '--binary', 'HEAD'])}`,
  );
}

function unsignedRecordSha256(record: TestExecutionRecord): string {
  const { record_sha256: ignored, ...unsigned } = record;
  void ignored;
  return digest(JSON.stringify(unsigned));
}

export function readExecutionRecords(path: string): TestExecutionRecord[] {
  if (!existsSync(path)) return [];
  let records: TestExecutionRecord[];
  try {
    records = readFileSync(path, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as TestExecutionRecord);
  } catch {
    throw new Error(`Execution log is not valid append-only JSONL: ${path}.`);
  }
  let previous = '0'.repeat(64);
  for (const [index, record] of records.entries()) {
    if (record.version !== 2) {
      throw new Error(`Execution record ${index + 1} must use version 2.`);
    }
    if (record.sequence !== index + 1) {
      throw new Error(`Execution log sequence drifted at record ${index + 1}.`);
    }
    if (
      record.previous_record_sha256 !== previous ||
      record.record_sha256 !== unsignedRecordSha256(record)
    ) {
      throw new Error(
        `Execution log hash chain failed at record ${index + 1}.`,
      );
    }
    previous = record.record_sha256;
  }
  return records;
}

function outputSummary(value: string): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, 512);
}

export function assertLockedMaterializedPlan(
  cwd: string,
  selection: ReturnType<typeof selectedTestProcesses>[number],
  process: ReturnType<typeof readTestProcess>,
): void {
  if (!selection.materialized_plan_path) {
    throw new Error(
      `Selected v2 process has no immutable test plan: ${selection.id}.`,
    );
  }
  const path = join(cwd, selection.materialized_plan_path);
  if (!existsSync(path)) {
    throw new Error(
      `Materialized test plan is missing: ${selection.materialized_plan_path}.`,
    );
  }
  let plan: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      throw new Error('not an object');
    }
    plan = parsed as Record<string, unknown>;
  } catch {
    throw new Error(
      `Materialized test plan is not valid JSON: ${selection.materialized_plan_path}.`,
    );
  }
  const locked = {
    process_id: plan.process_id,
    process_path: plan.process_path,
    definition_sha256: plan.definition_sha256,
    runtime: plan.runtime,
    functional_contexts: plan.functional_contexts,
    technical_boundaries: plan.technical_boundaries,
    selected_step_ids: plan.selected_step_ids,
    command_variables: plan.command_variables,
    focused_commands: plan.focused_commands,
    quality_gates: plan.quality_gates,
    materialized_sha256: plan.materialized_sha256,
  };
  const expected = {
    process_id: selection.id,
    process_path: selection.path,
    definition_sha256: selection.definition_sha256,
    runtime: selection.runtime,
    functional_contexts: selection.functional_contexts,
    technical_boundaries: selection.technical_boundaries,
    selected_step_ids: selection.selected_step_ids,
    command_variables: selection.command_variables,
    focused_commands: selection.focused_commands,
    quality_gates: process.quality_gates,
    materialized_sha256: selection.materialized_sha256,
  };
  if (JSON.stringify(locked) !== JSON.stringify(expected)) {
    throw new Error(`Materialized test plan drifted: ${selection.id}.`);
  }
}

function assertV2ExecutionOrder(
  request: TestExecutionRequest,
  process: ReturnType<typeof readTestProcess>,
  records: TestExecutionRecord[],
  selectedStepIds?: string[],
): void {
  const steps = selectedStepIds
    ? process.steps.filter(({ id }) => selectedStepIds.includes(id))
    : process.steps;
  if (selectedStepIds && steps.length !== selectedStepIds.length) {
    throw new Error(`Selected step list drifted for ${request.processId}.`);
  }
  const processRecords = records.filter(
    ({ process_id }) => process_id === request.processId,
  );
  if (request.stage === 'showcase') {
    if (!request.stepId) {
      throw new Error('A Showcase execution requires one selected Q2 step.');
    }
    const step = steps.find(({ id }) => id === request.stepId);
    if (!step || step.quadrant !== 'Q2') {
      throw new Error(
        `Showcase can execute only a selected Q2 step: ${request.processId}/${request.stepId}.`,
      );
    }
    const missingGates = process.quality_gates.filter(
      (command) =>
        !processRecords.some(
          ({ stage, command: observed, exit_code }) =>
            stage === 'quality_gate' && observed === command && exit_code === 0,
        ),
    );
    if (missingGates.length > 0) {
      throw new Error(
        `Showcase requires passed final quality gates: ${missingGates.join(', ')}.`,
      );
    }
    return;
  }
  if (request.stage === 'quality_gate') {
    const latestPass = processRecords
      .filter(
        ({ stage, command, exit_code }) =>
          stage === 'quality_gate' &&
          command === request.command &&
          exit_code === 0,
      )
      .at(-1);
    const revisedAfterPass = latestPass
      ? records.some(
          ({ stage, sequence }) =>
            ['red', 'green', 'refactor'].includes(stage) &&
            sequence > latestPass.sequence,
        )
      : false;
    if (latestPass && !revisedAfterPass) {
      throw new Error(`Quality gate was already executed: ${request.command}`);
    }
    const incomplete = steps.filter(
      ({ id }) =>
        !processRecords.some(
          ({ step_id, stage, exit_code }) =>
            step_id === id &&
            (stage === 'green' || stage === 'refactor') &&
            exit_code === 0,
        ),
    );
    if (incomplete.length > 0) {
      throw new Error(
        `Quality gates require completed focused steps: ${incomplete.map(({ id }) => id).join(', ')}.`,
      );
    }
    return;
  }
  if (!request.stepId) {
    throw new Error(`A v2 ${request.stage} execution requires stepId.`);
  }
  const stepIndex = steps.findIndex(({ id }) => id === request.stepId);
  if (stepIndex < 0) {
    throw new Error(
      `Test process ${request.processId} does not declare step ${request.stepId}.`,
    );
  }
  const previous = steps[stepIndex - 1];
  if (
    previous &&
    !processRecords.some(
      ({ step_id, stage, exit_code }) =>
        step_id === previous.id &&
        (stage === 'green' || stage === 'refactor') &&
        exit_code === 0,
    )
  ) {
    throw new Error(
      `Test process step ${request.stepId} cannot run before ${previous.id} is green.`,
    );
  }
  const stepRecords = processRecords.filter(
    ({ step_id }) => step_id === request.stepId,
  );
  if (
    request.stage === 'green' &&
    !stepRecords.some(({ stage, expected_failure }) =>
      stage === 'red' ? expected_failure : false,
    )
  ) {
    throw new Error(
      `Green requires an observed failing Red for ${request.stepId}.`,
    );
  }
  if (
    request.stage === 'refactor' &&
    !stepRecords.some(
      ({ stage, exit_code }) => stage === 'green' && exit_code === 0,
    )
  ) {
    throw new Error(
      `Refactor requires a successful Green for ${request.stepId}.`,
    );
  }
}

/**
 * Execute only a command locked by a selected process definition.
 * The append-only record is the source of truth for later TDD evidence validation.
 */
export function executeTestStep(
  cwd: string,
  request: TestExecutionRequest,
): TestExecutionRecord {
  const state = readState(cwd);
  const showcaseExecution =
    request.stage === 'showcase' && state.loop === 'showcase';
  if (
    (!showcaseExecution && state.loop !== 'pair') ||
    !state.active_work_item
  ) {
    throw new Error(
      'A selected coding work item is required to execute a test step.',
    );
  }
  if (
    showcaseExecution &&
    state.pair_session?.checkpoint !== 'quality_gates_passed'
  ) {
    throw new Error(
      'Showcase Q2 requires a Pair session with passed final quality gates.',
    );
  }
  const selection = selectedTestProcesses(state.active_work_item).find(
    ({ id }) => id === request.processId,
  );
  if (!selection) {
    throw new Error(
      `Test process ${request.processId} is not selected for this work item.`,
    );
  }
  const definitionPath = join(cwd, selection.path);
  const process = readTestProcess(definitionPath);
  const root = artifactPath(
    cwd,
    state,
    `artifacts/05-code/${state.active_work_item.story_id}`,
  );
  mkdirSync(root, { recursive: true });
  const logPath = `${root}/${state.active_work_item.scenario_id}.execution.jsonl`;
  const priorRecords = readExecutionRecords(logPath);
  assertLockedMaterializedPlan(cwd, selection, process);
  const actualHash = testProcessDefinitionSha256(definitionPath);
  if (selection.definition_sha256 !== actualHash) {
    throw new Error(
      `Selected test process definition drifted: ${request.processId}.`,
    );
  }
  const allMaterialized = materializeFocusedCommands(
    process,
    selection.command_variables,
  );
  const rematerialized = allMaterialized.filter(({ step_id }) =>
    selection.selected_step_ids.includes(step_id),
  );
  const materializedSha256 = materializedProcessSha256(
    request.processId,
    actualHash,
    selection.command_variables,
    rematerialized,
  );
  if (
    selection.materialized_sha256 !== materializedSha256 ||
    JSON.stringify(selection.focused_commands) !==
      JSON.stringify(rematerialized)
  ) {
    throw new Error(
      `Selected focused commands drifted after materialization: ${request.processId}.`,
    );
  }
  if (request.stage === 'quality_gate') {
    if (!process.quality_gates.includes(request.command)) {
      throw new Error(
        `Command is not a final quality gate of ${request.processId}: ${request.command}`,
      );
    }
  } else if (
    !selection.focused_commands.some(
      ({ step_id, command }) =>
        step_id === request.stepId && command === request.command,
    )
  ) {
    throw new Error(
      `Command is not the locked focused command for ${request.processId}/${request.stepId ?? 'missing-step'}: ${request.command}`,
    );
  }
  assertV2ExecutionOrder(
    request,
    process,
    priorRecords,
    selection.selected_step_ids,
  );

  const approvedPlanSha256 =
    state.approved_test_plan_path &&
    existsSync(join(cwd, state.approved_test_plan_path))
      ? digest(readFileSync(join(cwd, state.approved_test_plan_path), 'utf8'))
      : undefined;
  if (
    state.approved_test_plan_sha256 &&
    approvedPlanSha256 !== state.approved_test_plan_sha256
  ) {
    throw new Error('Approved aggregate test plan drifted before execution.');
  }
  const startedAt = new Date().toISOString();
  const result = spawnSync(request.command, {
    cwd,
    shell: true,
    encoding: 'utf8',
    timeout: 10 * 60 * 1000,
  });
  const exitCode = result.status ?? (result.error ? 1 : 0);
  const sequence = priorRecords.length + 1;
  const stdout = result.stdout ?? '';
  const stderr = `${result.stderr ?? ''}${result.error?.message ?? ''}`;
  const unsigned: TestExecutionRecord = {
    version: 2,
    process_id: request.processId,
    stage: request.stage,
    ...(request.stepId ? { step_id: request.stepId } : {}),
    command: request.command,
    sequence,
    exit_code: exitCode,
    expected_failure: request.stage === 'red' && exitCode !== 0,
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    stdout_sha256: digest(stdout),
    stderr_sha256: digest(stderr),
    stdout_summary: outputSummary(stdout),
    stderr_summary: outputSummary(stderr),
    git_head: git(cwd, ['rev-parse', '--verify', 'HEAD']).trim(),
    git_baseline: state.active_work_item.git_baseline,
    worktree_sha256: worktreeDigest(cwd),
    ...(selection.definition_sha256
      ? { definition_sha256: selection.definition_sha256 }
      : {}),
    ...(selection.materialized_sha256
      ? { test_plan_sha256: selection.materialized_sha256 }
      : {}),
    ...(approvedPlanSha256 ? { approved_plan_sha256: approvedPlanSha256 } : {}),
    invocation: request.invocation ?? 'test-tool',
    previous_record_sha256:
      priorRecords.at(-1)?.record_sha256 ?? '0'.repeat(64),
  };
  const record: TestExecutionRecord = {
    ...unsigned,
    record_sha256: unsignedRecordSha256(unsigned),
  };
  appendFileSync(logPath, `${JSON.stringify(record)}\n`);
  return record;
}

export function executionLogPath(cwd: string): string | undefined {
  const state = readState(cwd);
  if (!state.active_work_item) return undefined;
  return artifactRelativePath(
    state,
    `artifacts/05-code/${state.active_work_item.story_id}/${state.active_work_item.scenario_id}.execution.jsonl`,
  );
}
