import { createHash } from 'node:crypto';
import {
  execFileSync,
  spawnSync,
  type SpawnSyncReturns,
} from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { artifactPath } from '../../iteration/artifact-layout';
import type { CommandTermination, WorkflowState } from '../../iteration/state';
import {
  readState,
  selectedTestProcesses,
} from '../../iteration/state-repository';
import { assertPairExecutionBudgetLocked } from '../execution-budget/policy';
import {
  materializeFocusedCommands,
  materializeQualityGates,
  materializedProcessSha256,
  readTestProcess,
  testProcessDefinitionSha256,
} from '../test-process/catalog';
import { readNxProjectCatalogSnapshot } from '../test-process/project-catalog';

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
  taskId?: string;
  testId?: string;
  command: string;
  invocation?:
    | 'pair-controller'
    | 'showcase-controller'
    | 'model-tool'
    | 'command'
    | 'test-tool';
}

export interface OutputDiagnostic {
  sha256: string;
  bytes: number;
  lines: number;
  head: string;
  tail: string;
  truncated: boolean;
}

export interface TestExecutionRecord {
  version: 2;
  process_id: string;
  stage: TestExecutionStage;
  step_id?: string;
  task_id?: string;
  test_id?: string;
  command: string;
  sequence: number;
  exit_code: number | null;
  termination: CommandTermination;
  expected_failure: boolean;
  started_at: string;
  completed_at: string;
  stdout_sha256: string;
  stderr_sha256: string;
  stdout_summary?: string;
  stderr_summary?: string;
  stdout_diagnostic: OutputDiagnostic;
  stderr_diagnostic: OutputDiagnostic;
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

export function classifyCommandTermination(
  result: Pick<SpawnSyncReturns<string>, 'status' | 'signal' | 'error'>,
  timeoutMs: number,
): CommandTermination {
  const error = result.error as NodeJS.ErrnoException | undefined;
  if (
    error?.code === 'ETIMEDOUT' ||
    error?.message.toLowerCase().includes('timed out')
  ) {
    return {
      kind: 'timeout',
      timeout_ms: timeoutMs,
      ...(result.signal ? { signal: result.signal } : {}),
    };
  }
  if (error) {
    return {
      kind: 'spawn_error',
      ...(error.code ? { error_code: error.code } : {}),
    };
  }
  if (result.signal) return { kind: 'signal', signal: result.signal };
  if (typeof result.status === 'number') {
    return { kind: 'exit', exit_code: result.status };
  }
  return { kind: 'spawn_error' };
}

function validCommandTermination(
  termination: CommandTermination | undefined,
  exitCode: number | null,
): boolean {
  if (!termination) return false;
  if (termination.kind === 'exit') {
    return (
      Number.isSafeInteger(termination.exit_code) &&
      termination.exit_code === exitCode
    );
  }
  if (exitCode !== null) return false;
  if (termination.kind === 'timeout') {
    return (
      Number.isSafeInteger(termination.timeout_ms) &&
      termination.timeout_ms > 0 &&
      (termination.signal === undefined ||
        typeof termination.signal === 'string')
    );
  }
  if (termination.kind === 'signal') return Boolean(termination.signal);
  return (
    termination.kind === 'spawn_error' &&
    (termination.error_code === undefined ||
      typeof termination.error_code === 'string')
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
    if (
      !validCommandTermination(record.termination, record.exit_code) ||
      !validOutputDiagnostic(record.stdout_diagnostic, record.stdout_sha256) ||
      !validOutputDiagnostic(record.stderr_diagnostic, record.stderr_sha256)
    ) {
      throw new Error(
        `Execution record ${index + 1} lacks bounded output diagnostics.`,
      );
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

const DIAGNOSTIC_HEAD_BYTES = 2 * 1024;
const DIAGNOSTIC_TAIL_BYTES = 4 * 1024;
const SUMMARY_BYTES = 2 * 1024;
// ANSI terminal escapes intentionally begin with the ESC control character.
// eslint-disable-next-line no-control-regex
const ANSI_SEQUENCE = new RegExp('\\u001b\\[[0-?]*[ -/]*[@-~]', 'g');

function byteBoundedHead(value: string, maxBytes: number): string {
  let result = '';
  let bytes = 0;
  for (const character of value) {
    const size = Buffer.byteLength(character, 'utf8');
    if (bytes + size > maxBytes) break;
    result += character;
    bytes += size;
  }
  return result;
}

function byteBoundedTail(value: string, maxBytes: number): string {
  let result = '';
  let bytes = 0;
  const characters = [...value];
  for (let index = characters.length - 1; index >= 0; index -= 1) {
    const character = characters[index] ?? '';
    const size = Buffer.byteLength(character, 'utf8');
    if (bytes + size > maxBytes) break;
    result = character + result;
    bytes += size;
  }
  return result;
}

function sanitizedOutput(value: string): string {
  return value.replace(ANSI_SEQUENCE, '').replaceAll('\r\n', '\n').trim();
}

export function outputDiagnostic(value: string): OutputDiagnostic {
  const sanitized = sanitizedOutput(value);
  const boundedBytes = DIAGNOSTIC_HEAD_BYTES + DIAGNOSTIC_TAIL_BYTES;
  const truncated = Buffer.byteLength(sanitized, 'utf8') > boundedBytes;
  return {
    sha256: digest(value),
    bytes: Buffer.byteLength(value, 'utf8'),
    lines: value.length === 0 ? 0 : value.split(/\r?\n/).length,
    head: truncated
      ? byteBoundedHead(sanitized, DIAGNOSTIC_HEAD_BYTES)
      : sanitized,
    tail: truncated ? byteBoundedTail(sanitized, DIAGNOSTIC_TAIL_BYTES) : '',
    truncated,
  };
}

export function formatOutputDiagnostic(
  diagnostic: OutputDiagnostic,
  maxBytes = SUMMARY_BYTES,
): string {
  if (!diagnostic.truncated) return byteBoundedHead(diagnostic.head, maxBytes);
  const marker = `\n\n[… ${diagnostic.bytes} bytes / ${diagnostic.lines} lines; sha256=${diagnostic.sha256} …]\n\n`;
  const markerBytes = Buffer.byteLength(marker, 'utf8');
  const available = Math.max(0, maxBytes - markerBytes);
  const headBudget = Math.floor(available / 3);
  const tailBudget = available - headBudget;
  return `${byteBoundedHead(diagnostic.head, headBudget)}${marker}${byteBoundedTail(diagnostic.tail, tailBudget)}`;
}

function validOutputDiagnostic(
  diagnostic: OutputDiagnostic | undefined,
  expectedSha256: string,
): boolean {
  return Boolean(
    diagnostic &&
      diagnostic.sha256 === expectedSha256 &&
      diagnostic.bytes >= 0 &&
      diagnostic.lines >= 0 &&
      typeof diagnostic.head === 'string' &&
      typeof diagnostic.tail === 'string' &&
      typeof diagnostic.truncated === 'boolean' &&
      Buffer.byteLength(diagnostic.head, 'utf8') <= DIAGNOSTIC_HEAD_BYTES &&
      Buffer.byteLength(diagnostic.tail, 'utf8') <= DIAGNOSTIC_TAIL_BYTES,
  );
}

export function assertLockedMaterializedPlan(
  cwd: string,
  selection: ReturnType<typeof selectedTestProcesses>[number],
  process: ReturnType<typeof readTestProcess>,
): void {
  if (!selection.materialized_plan_path) {
    throw new Error(
      `Selected v3 process has no immutable test plan: ${selection.id}.`,
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
    project_ids: plan.project_ids,
    project_catalog_sha256: plan.project_catalog_sha256,
    project_catalog_path: plan.project_catalog_path,
    command_variables_by_test: plan.command_variables_by_test,
    focused_commands: plan.focused_commands,
    quality_gate_commands: plan.quality_gate_commands,
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
    project_ids: selection.project_ids,
    project_catalog_sha256: selection.project_catalog_sha256,
    project_catalog_path: selection.project_catalog_path,
    command_variables_by_test: selection.command_variables_by_test,
    focused_commands: selection.focused_commands,
    quality_gate_commands: selection.quality_gate_commands,
    materialized_sha256: selection.materialized_sha256,
  };
  if (
    process.version !== 3 ||
    plan.version !== 3 ||
    JSON.stringify(locked) !== JSON.stringify(expected)
  ) {
    throw new Error(`Materialized test plan drifted: ${selection.id}.`);
  }
  if (selection.project_ids.length > 0) {
    if (!selection.project_catalog_path || !selection.project_catalog_sha256) {
      throw new Error(
        `Selected Nx process has no locked catalog: ${selection.id}.`,
      );
    }
    const catalog = readNxProjectCatalogSnapshot(
      join(cwd, selection.project_catalog_path),
    );
    if (
      catalog.project_catalog_sha256 !== selection.project_catalog_sha256 ||
      JSON.stringify(catalog.projects.map(({ name }) => name)) !==
        JSON.stringify([...selection.project_ids].sort())
    ) {
      throw new Error(`Locked Nx project catalog drifted: ${selection.id}.`);
    }
  }
}

function assertV3ExecutionOrder(
  request: TestExecutionRequest,
  process: ReturnType<typeof readTestProcess>,
  selection: ReturnType<typeof selectedTestProcesses>[number],
  records: TestExecutionRecord[],
): void {
  const selectedStepIds = selection.selected_step_ids;
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
    if (!request.stepId || !request.testId) {
      throw new Error('A Showcase execution requires one selected Q2 TEST.');
    }
    const step = steps.find(({ id }) => id === request.stepId);
    if (!step || step.quadrant !== 'Q2') {
      throw new Error(
        `Showcase can execute only a selected Q2 step: ${request.processId}/${request.stepId}.`,
      );
    }
    const missingGates = selection.quality_gate_commands.filter(
      ({ command }) =>
        !processRecords.some(
          ({ stage, command: observed, exit_code }) =>
            stage === 'quality_gate' && observed === command && exit_code === 0,
        ),
    );
    if (missingGates.length > 0) {
      throw new Error(
        `Showcase requires passed final quality gates: ${missingGates.map(({ command }) => command).join(', ')}.`,
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
  if (!request.stepId || !request.taskId || !request.testId) {
    throw new Error(
      `A v2 ${request.stage} execution requires stepId, taskId, and testId.`,
    );
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
    ({ step_id, task_id, test_id }) =>
      step_id === request.stepId &&
      task_id === request.taskId &&
      test_id === request.testId,
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

export function approvedCommandTimeoutMs(state: WorkflowState): number {
  const timeoutMs =
    state.pair_session?.execution_budget.command_timeout_ms ??
    state.completed_work_items?.at(-1)?.pair.execution_budget
      .command_timeout_ms;
  if (!Number.isSafeInteger(timeoutMs) || (timeoutMs ?? 0) <= 0) {
    throw new Error(
      'Deterministic command execution requires the Desk Check budget envelope.',
    );
  }
  return timeoutMs as number;
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
  if (
    request.stage === 'quality_gate' &&
    state.tasking_candidate?.tests.some(
      ({ id }) => !state.pair_session?.completed_test_ids.includes(id),
    )
  ) {
    throw new Error(
      'Quality gates require every approved TEST to be completed.',
    );
  }
  if (
    !showcaseExecution &&
    request.stage !== 'quality_gate' &&
    (state.pair_session?.task_id !== request.taskId ||
      state.pair_session?.test_id !== request.testId ||
      state.pair_session?.process_id !== request.processId ||
      state.pair_session?.step_id !== request.stepId)
  ) {
    throw new Error(
      'The execution request does not match the active TASK/TEST unit.',
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
  const logPath = `${root}/execution.jsonl`;
  const priorRecords = readExecutionRecords(logPath);
  assertLockedMaterializedPlan(cwd, selection, process);
  const actualHash = testProcessDefinitionSha256(definitionPath);
  if (selection.definition_sha256 !== actualHash) {
    throw new Error(
      `Selected test process definition drifted: ${request.processId}.`,
    );
  }
  const rematerialized = materializeFocusedCommands(
    process,
    selection.focused_commands.map(({ test_id, step_id }) => {
      const variables = selection.command_variables_by_test[test_id];
      if (!variables) {
        throw new Error(`${test_id} has no locked command variables.`);
      }
      return { test_id, step_id, variables };
    }),
  );
  const qualityGateCommands = materializeQualityGates(
    process,
    selection.project_ids,
    selection.focused_commands.flatMap(({ project_id }) =>
      project_id ? [project_id] : [],
    ),
  );
  const materializedSha256 = materializedProcessSha256({
    processId: request.processId,
    definitionSha256: actualHash,
    projectIds: selection.project_ids,
    projectCatalogSha256: selection.project_catalog_sha256,
    commandVariablesByTest: selection.command_variables_by_test,
    focusedCommands: rematerialized,
    qualityGateCommands,
  });
  if (
    selection.materialized_sha256 !== materializedSha256 ||
    JSON.stringify(selection.focused_commands) !==
      JSON.stringify(rematerialized) ||
    JSON.stringify(selection.quality_gate_commands) !==
      JSON.stringify(qualityGateCommands)
  ) {
    throw new Error(
      `Selected commands drifted after materialization: ${request.processId}.`,
    );
  }
  if (request.stage === 'quality_gate') {
    if (
      !selection.quality_gate_commands.some(
        ({ command }) => command === request.command,
      )
    ) {
      throw new Error(
        `Command is not a locked final quality gate of ${request.processId}: ${request.command}`,
      );
    }
  } else if (
    !request.testId ||
    !selection.focused_commands.some(
      ({ test_id, step_id, command }) =>
        test_id === request.testId &&
        step_id === request.stepId &&
        command === request.command,
    )
  ) {
    throw new Error(
      `Command is not the locked focused command for ${request.processId}/${request.stepId ?? 'missing-step'}/${request.testId ?? 'missing-test'}: ${request.command}`,
    );
  }
  assertV3ExecutionOrder(request, process, selection, priorRecords);

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
  assertPairExecutionBudgetLocked(cwd, state);
  const startedAt = new Date().toISOString();
  const timeoutMs = approvedCommandTimeoutMs(state);
  const result = spawnSync(request.command, {
    cwd,
    shell: true,
    encoding: 'utf8',
    timeout: timeoutMs,
  });
  const termination = classifyCommandTermination(result, timeoutMs);
  const exitCode = termination.kind === 'exit' ? termination.exit_code : null;
  const sequence = priorRecords.length + 1;
  const stdout = result.stdout ?? '';
  const stderr = `${result.stderr ?? ''}${result.error?.message ?? ''}`;
  const stdoutDiagnostic = outputDiagnostic(stdout);
  const stderrDiagnostic = outputDiagnostic(stderr);
  const unsigned: TestExecutionRecord = {
    version: 2,
    process_id: request.processId,
    stage: request.stage,
    ...(request.stepId ? { step_id: request.stepId } : {}),
    ...(request.taskId ? { task_id: request.taskId } : {}),
    ...(request.testId ? { test_id: request.testId } : {}),
    command: request.command,
    sequence,
    exit_code: exitCode,
    termination,
    expected_failure:
      request.stage === 'red' && termination.kind === 'exit' && exitCode !== 0,
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    stdout_sha256: stdoutDiagnostic.sha256,
    stderr_sha256: stderrDiagnostic.sha256,
    stdout_summary: formatOutputDiagnostic(stdoutDiagnostic),
    stderr_summary: formatOutputDiagnostic(stderrDiagnostic),
    stdout_diagnostic: stdoutDiagnostic,
    stderr_diagnostic: stderrDiagnostic,
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
