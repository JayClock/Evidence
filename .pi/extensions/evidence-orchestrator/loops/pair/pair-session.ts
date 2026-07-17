import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { artifactPath } from '../../iteration/artifact-layout';
import { transitionLoopState } from '../../iteration/transition-graph';
import {
  readState,
  selectedTestProcesses,
  writeState,
} from '../../iteration/state-repository';
import type {
  PairDeterministicAction,
  PairDriverMode,
  PairObservation,
  PairSession,
  RedFailureKind,
  TaskingImplementationTask,
  TaskingTestItem,
  TestProcessSelection,
  WorkflowState,
} from '../../iteration/state';
import {
  executeTestStep,
  readExecutionRecords,
  type OutputDiagnostic,
  type TestExecutionRecord,
} from '../../capabilities/execution-evidence/observation-log';
import { generateExecutionEvidence } from '../../capabilities/execution-evidence/manifest';
import { readTestProcess } from '../../capabilities/test-process/catalog';

interface PairStep {
  process: TestProcessSelection;
  stepId: string;
  command: string;
}

interface PairWorkUnit extends PairStep {
  task: TaskingImplementationTask;
  test: TaskingTestItem;
}

interface PairQualityGate {
  processId: string;
  command: string;
}

interface SnapshotFile {
  content: Buffer;
  mode: number;
}

export interface PairWorktreeSnapshot {
  head: string;
  tracked: Set<string>;
  files: Map<string, SnapshotFile>;
  untracked: Set<string>;
}

export interface PairDriverCompletion {
  state: WorkflowState;
  blocked: boolean;
  changedPaths: string[];
  diff: string;
  output: string;
}

export interface PairActionResult {
  state: WorkflowState;
  output: string;
  record?: TestExecutionRecord;
}

export interface PairRedReviewResult {
  failureKind: RedFailureKind;
  reason: string;
}

const RED_FAILURE_KINDS = new Set<RedFailureKind>([
  'behavior',
  'compile',
  'dependency',
  'configuration',
  'network',
  'fixture',
  'other',
]);

function digest(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function nulPaths(cwd: string, args: string[]): string[] {
  const output = execFileSync('git', args, { cwd, encoding: 'buffer' });
  return output.toString('utf8').split('\0').filter(Boolean);
}

function pairState(
  cwd: string,
  requireCurrentHead = true,
): WorkflowState & { pair_session: PairSession } {
  const state = readState(cwd);
  if (
    state.loop !== 'pair' ||
    state.tasking_stage !== 'approved' ||
    !state.active_work_item ||
    !state.pair_session
  ) {
    throw new Error('Navigator-driven Pair requires an approved Pair session.');
  }
  if (
    state.active_work_item.git_baseline !== state.pair_session.git_baseline ||
    (requireCurrentHead &&
      git(cwd, ['rev-parse', '--verify', 'HEAD']) !==
        state.pair_session.git_baseline)
  ) {
    throw new Error(
      'Pair must remain on the same human-approved Git baseline; Driver commits are forbidden.',
    );
  }
  return state as WorkflowState & { pair_session: PairSession };
}

function pairSteps(cwd: string, state: WorkflowState): PairStep[] {
  const workItem = state.active_work_item;
  if (!workItem) throw new Error('Pair has no active work item.');
  return selectedTestProcesses(workItem).flatMap((process) => {
    const definition = readTestProcess(join(cwd, process.path));
    const selected =
      process.selected_step_ids ?? definition.steps.map(({ id }) => id);
    return selected.map((stepId) => {
      const command = process.focused_commands?.find(
        ({ step_id }) => step_id === stepId,
      )?.command;
      if (!definition.steps.some(({ id }) => id === stepId) || !command) {
        throw new Error(`Approved Pair step drifted: ${process.id}/${stepId}.`);
      }
      return { process, stepId, command };
    });
  });
}

function qualityGates(cwd: string, state: WorkflowState): PairQualityGate[] {
  const workItem = state.active_work_item;
  if (!workItem) throw new Error('Pair has no active work item.');
  return selectedTestProcesses(workItem).flatMap((process) =>
    readTestProcess(join(cwd, process.path)).quality_gates.map((command) => ({
      processId: process.id,
      command,
    })),
  );
}

function pairWorkUnits(cwd: string, state: WorkflowState): PairWorkUnit[] {
  const candidate = state.tasking_candidate;
  if (!candidate || !state.approved_test_plan_path) {
    throw new Error('Pair has no approved Tasking candidate.');
  }
  const approvedContent = readFileSync(
    join(cwd, state.approved_test_plan_path),
    'utf8',
  );
  const approved = JSON.parse(approvedContent) as {
    tests?: unknown;
    tasks?: unknown;
  };
  if (
    digest(approvedContent) !== state.approved_test_plan_sha256 ||
    JSON.stringify(approved.tests) !== JSON.stringify(candidate.tests) ||
    JSON.stringify(approved.tasks) !== JSON.stringify(candidate.tasks)
  ) {
    throw new Error('Approved TASK/TEST traceability drifted before Pair.');
  }
  const steps = new Map(
    pairSteps(cwd, state).map((step) => [
      `${step.process.id}/${step.stepId}`,
      step,
    ]),
  );
  const tests = new Map(candidate.tests.map((test) => [test.id, test]));
  const seen = new Set<string>();
  const units = candidate.tasks.flatMap((task) =>
    task.test_ids.map((testId) => {
      if (seen.has(testId)) {
        throw new Error(`${testId} belongs to more than one Pair task.`);
      }
      seen.add(testId);
      const test = tests.get(testId);
      if (!test) throw new Error(`${task.id} references missing ${testId}.`);
      const step = steps.get(`${test.process_id}/${test.step_id}`);
      if (!step) {
        throw new Error(`${testId} references an unapproved process step.`);
      }
      return { ...step, task, test };
    }),
  );
  if (units.length !== candidate.tests.length) {
    throw new Error(
      'Every approved test must belong to exactly one Pair task.',
    );
  }
  return units;
}

function currentWorkUnit(cwd: string, state: WorkflowState): PairWorkUnit {
  const session = state.pair_session;
  if (!session) throw new Error('Pair has no session.');
  const unit = pairWorkUnits(cwd, state).find(
    ({ task, test, process, stepId }) =>
      task.id === session.task_id &&
      test.id === session.test_id &&
      process.id === session.process_id &&
      stepId === session.step_id,
  );
  if (!unit) throw new Error('Current Pair TASK/TEST unit is not approved.');
  return unit;
}

function stepKey(step: PairStep): string {
  return `${step.process.id}/${step.stepId}`;
}

function unitKey(unit: PairWorkUnit): string {
  return `${unit.task.id}/${unit.test.id}`;
}

function nextIncompleteWorkUnit(
  cwd: string,
  state: WorkflowState,
): PairWorkUnit | undefined {
  const completed = new Set(state.pair_session?.completed_test_ids ?? []);
  return pairWorkUnits(cwd, state).find(({ test }) => !completed.has(test.id));
}

function sameProcessStep(left: PairWorkUnit, right: PairWorkUnit): boolean {
  return left.process.id === right.process.id && left.stepId === right.stepId;
}

function expectedRed(unit: PairWorkUnit): string {
  if (!unit.test.intent.trim()) {
    throw new Error(`No approved test intent for ${unitKey(unit)}.`);
  }
  return unit.test.intent;
}

export function buildPairRedReviewTask(
  cwd: string,
  state: WorkflowState,
): string {
  const session = state.pair_session;
  const workItem = state.active_work_item;
  const red = session?.red_observation;
  if (
    state.loop !== 'pair' ||
    !session ||
    session.checkpoint !== 'red_observed' ||
    !red ||
    red.accepted === true ||
    !workItem
  ) {
    throw new Error('AI Red review requires one unclassified Pair Red.');
  }
  const logPath = artifactPath(
    cwd,
    state,
    `artifacts/05-code/${workItem.story_id}/execution.jsonl`,
  );
  const record = readExecutionRecords(logPath).find(
    ({ sequence }) => sequence === red.sequence,
  );
  if (!record || record.stage !== 'red') {
    throw new Error(`Red execution record ${red.sequence} is missing.`);
  }
  const diagnosticTail = (value: OutputDiagnostic): string =>
    value.tail || value.head || '(empty)';
  const diagnosticHead = (value: OutputDiagnostic): string =>
    value.tail ? value.head || '(empty)' : '(same as tail)';
  const diagnosticMetadata = (value: OutputDiagnostic): string =>
    `bytes=${value.bytes} lines=${value.lines} truncated=${value.truncated} sha256=${value.sha256}`;
  return `独立分类一个 Evidence Pair Red，不执行命令也不修改任何文件。

当前工作项：${session.story_id} / ${session.task_id}/${session.test_id}
工序：${session.process_id}/${session.step_id}
测试意图：${session.expected_red}
命令：${record.command}
退出码：${record.exit_code}
stderr tail：${diagnosticTail(record.stderr_diagnostic)}
stdout tail：${diagnosticTail(record.stdout_diagnostic)}
stderr head：${diagnosticHead(record.stderr_diagnostic)}
stdout head：${diagnosticHead(record.stdout_diagnostic)}
stderr metadata：${diagnosticMetadata(record.stderr_diagnostic)}
stdout metadata：${diagnosticMetadata(record.stdout_diagnostic)}

只判断失败的直接原因：
- behavior：测试到达业务断言，且仅因计划中的行为尚未实现而失败；
- compile、dependency、configuration、network、fixture、other：任何伪 Red。

最终响应必须只有一行 JSON，不得使用 Markdown：{"failureKind":"behavior|compile|dependency|configuration|network|fixture|other","reason":"基于实际输出的具体判断依据"}`;
}

export function parsePairRedReview(output: string): PairRedReviewResult {
  const candidates = [
    output.trim(),
    ...(output.match(/\{[^{}]*\}/g) ?? []).reverse(),
  ];
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as {
        failureKind?: unknown;
        reason?: unknown;
      };
      const failureKind = parsed.failureKind as RedFailureKind;
      const reason =
        typeof parsed.reason === 'string' ? parsed.reason.trim() : '';
      if (RED_FAILURE_KINDS.has(failureKind) && reason) {
        return { failureKind, reason };
      }
    } catch {
      // Try the next JSON object from the reviewer response.
    }
  }
  throw new Error(
    'AI Red Reviewer did not return one valid classification JSON object.',
  );
}

export function pairDriverMode(
  state: WorkflowState,
): PairDriverMode | undefined {
  const session = state.pair_session;
  if (!session) return undefined;
  if (session.checkpoint === 'plan_confirmed') return 'test';
  if (
    session.checkpoint === 'red_observed' &&
    session.red_observation?.accepted === true
  ) {
    return 'implementation';
  }
  if (session.checkpoint === 'green_observed') return 'refactor';
  return undefined;
}

export function pairDeterministicAction(
  cwd: string,
  state: WorkflowState,
): PairDeterministicAction | undefined {
  const session = state.pair_session;
  if (!session) return undefined;
  if (session.checkpoint === 'test_written') return 'run_red';
  if (session.checkpoint === 'implementation_written') return 'run_green';
  if (session.checkpoint === 'refactored') {
    return session.completed_test_ids.includes(session.test_id)
      ? 'run_quality_gate'
      : 'run_refactor';
  }
  return undefined;
}

export function buildPairDriverTask(
  cwd: string,
  state: WorkflowState,
  mode: PairDriverMode,
): string {
  const session = state.pair_session;
  if (!session || !state.approved_test_plan_path) {
    throw new Error('Pair Driver requires an approved plan and session.');
  }
  const unit = currentWorkUnit(cwd, state);
  const definition = readTestProcess(join(cwd, unit.process.path));
  const processStep = definition.steps.find(({ id }) => id === unit.stepId);
  if (!processStep) throw new Error(`Missing process step ${stepKey(unit)}.`);
  const common = `方法：先加载并遵守 .pi/skills/evidence-pairing/SKILL.md。
当前工作项：${session.story_id} / [${session.scenario_ids.join(', ')}]
当前 TASK：${unit.task.id} · ${unit.task.description}
当前 TEST：${unit.test.id} · ${unit.test.intent}
模型追踪：entities=${unit.test.model_refs.entities.join(',') || 'none'}；associations=${unit.test.model_refs.associations.join(',') || 'none'}
当前步骤：${stepKey(unit)} · ${processStep.purpose}
Git baseline：${session.git_baseline}
确认 Scenario Set：${state.confirmed_scenarios?.map(({ artifact_path }) => artifact_path).join(', ') ?? 'missing'}
建模证据：${state.model_expansion_path ?? 'missing'}
人工建模决定：${state.modeling_profile?.method === 'none' ? (state.model_expansion_path ?? 'missing') : (state.model_decisions?.at(-1)?.artifact_path ?? 'missing')}
测试列表：${state.tasking_candidate?.test_list_path ?? 'missing'}
任务列表：${state.tasking_candidate?.task_list_path ?? 'missing'}
锁定计划：${state.approved_test_plan_path}
聚焦命令（Driver 不运行）：${unit.command}`;
  if (mode === 'test') {
    return `执行一个且仅一个 Test Driver checkpoint。

${common}

允许的测试 roots：${processStep.nearest_test.roots.join(', ')}。预期 Red 行为：${session.expected_red}。

任务：写当前步骤的一个最小行为测试后立即停止。不得修改生产代码、配置、计划、状态或执行证据，不得运行命令或提交；报告路径、断言和预期失败。越界修改会被恢复并阻止 checkpoint。`;
  }
  if (mode === 'implementation') {
    return `执行一个且仅一个 Production Driver Green checkpoint。

${common}

已由独立 Red Reviewer 分类的预期行为失败：${session.red_observation?.review_reason ?? session.expected_red}。
${session.last_observation && session.last_observation.stage !== 'red' && session.last_observation.exit_code !== 0 ? `当前自动修复反馈：${session.last_observation.stage} exit=${session.last_observation.exit_code} · ${session.last_observation.command}\nstdout=${session.last_observation.stdout_summary ?? '(empty)'}\nstderr=${session.last_observation.stderr_summary ?? '(empty)'}` : ''}

读取已确认测试与 Red，只写最小生产实现；不得修改、删除、跳过或削弱任何测试，不得修改计划、状态或执行证据，不得运行聚焦命令，不得提交 Git。完成最小实现后立即停止。所有测试路径会被冻结并由确定性保护器校验。`;
  }
  const stepTestIds = pairWorkUnits(cwd, state)
    .filter((candidate) => sameProcessStep(candidate, unit))
    .map(({ test }) => test.id);
  return `执行一个且仅一个 process-step Refactor checkpoint。

${common}

当前步骤已 Green 的 TEST：${stepTestIds.join(', ')}。只对整个 ${stepKey(unit)} 步骤的生产实现做一次有界重构，以改善命名、职责或重复；不得改变行为，不得修改任何测试，不得修改计划、状态或执行证据，不得运行命令，不得提交 Git。若没有有价值的安全重构，明确说明 no-op 并立即停止。`;
}

function readSnapshotFile(cwd: string, path: string): SnapshotFile | undefined {
  const absolute = join(cwd, path);
  if (!existsSync(absolute) || !statSync(absolute).isFile()) return undefined;
  return { content: readFileSync(absolute), mode: statSync(absolute).mode };
}

export function capturePairWorktree(cwd: string): PairWorktreeSnapshot {
  const state = pairState(cwd);
  const tracked = nulPaths(cwd, ['ls-files', '-z']);
  const untracked = new Set(
    nulPaths(cwd, ['ls-files', '--others', '--exclude-standard', '-z']),
  );
  const pairPaths = [
    ...(state.pair_session.test_paths ?? []),
    ...(state.pair_session.production_paths ?? []),
  ];
  const files = new Map<string, SnapshotFile>();
  for (const path of new Set([...tracked, ...pairPaths, ...untracked])) {
    const snapshot = readSnapshotFile(cwd, path);
    if (snapshot) files.set(path, snapshot);
  }
  return {
    head: git(cwd, ['rev-parse', '--verify', 'HEAD']),
    tracked: new Set(tracked),
    files,
    untracked,
  };
}

function changedSinceSnapshot(
  cwd: string,
  snapshot: PairWorktreeSnapshot,
): string[] {
  const changed = new Set<string>();
  for (const path of snapshot.tracked) {
    const before = snapshot.files.get(path);
    const after = readSnapshotFile(cwd, path);
    if (
      (!before && after) ||
      (before &&
        (!after ||
          !after.content.equals(before.content) ||
          after.mode !== before.mode))
    ) {
      changed.add(path);
    }
  }
  for (const path of snapshot.files.keys()) {
    if (snapshot.tracked.has(path)) continue;
    const before = snapshot.files.get(path);
    const after = readSnapshotFile(cwd, path);
    if (
      before &&
      (!after ||
        !after.content.equals(before.content) ||
        after.mode !== before.mode)
    ) {
      changed.add(path);
    }
  }
  const afterUntracked = new Set(
    nulPaths(cwd, ['ls-files', '--others', '--exclude-standard', '-z']),
  );
  for (const path of afterUntracked) {
    if (!snapshot.untracked.has(path)) changed.add(path);
  }
  return [...changed].sort();
}

function restorePaths(
  cwd: string,
  snapshot: PairWorktreeSnapshot,
  paths: string[],
): void {
  for (const path of paths) {
    const before = snapshot.files.get(path);
    const absolute = join(cwd, path);
    if (!before) {
      rmSync(absolute, { recursive: true, force: true });
      continue;
    }
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, before.content);
    chmodSync(absolute, before.mode);
  }
}

function isTestPath(path: string): boolean {
  return (
    /(^|\/)(__tests__|tests?)(\/|$)/.test(path) ||
    /\.(test|spec)\.[^/]+$/.test(path) ||
    /(^|\/)(test_[^/]+|[^/]+_test)\.rs$/.test(path)
  );
}

function insideRoot(path: string, root: string): boolean {
  const normalized = root.replace(/^\.\//, '').replace(/\/$/, '');
  return path === normalized || path.startsWith(`${normalized}/`);
}

function rustSections(content: Buffer | undefined): {
  production: string;
  tests: string;
} {
  const text = content?.toString('utf8') ?? '';
  const marker = text.search(/^\s*#\[cfg\(test\)\]/m);
  return marker < 0
    ? { production: text, tests: '' }
    : { production: text.slice(0, marker), tests: text.slice(marker) };
}

function preservesRustRegion(
  cwd: string,
  snapshot: PairWorktreeSnapshot,
  path: string,
  region: 'production' | 'tests',
): boolean {
  const before = rustSections(snapshot.files.get(path)?.content);
  const after = rustSections(readSnapshotFile(cwd, path)?.content);
  return before[region] === after[region];
}

export function pairDriverWriteRoots(
  cwd: string,
  state: WorkflowState,
  mode: PairDriverMode,
): string[] {
  if (mode === 'test') {
    const step = currentWorkUnit(cwd, state);
    const definition = readTestProcess(join(cwd, step.process.path));
    return (
      definition.steps.find(({ id }) => id === step.stepId)?.nearest_test
        .roots ?? []
    );
  }
  const process = currentWorkUnit(cwd, state).process;
  const technical = readTestProcess(
    join(cwd, process.path),
  ).technical_boundaries;
  return process.runtime === 'rust'
    ? ['apps/server', 'libs/server']
    : process.runtime === 'tauri'
      ? ['apps/desktop']
      : technical.some((boundary) => boundary.startsWith('nest-'))
        ? ['apps/server-nest', 'libs/server-nest']
        : ['apps/web', 'libs/web'];
}

function allowedDriverPath(
  cwd: string,
  state: WorkflowState,
  mode: PairDriverMode,
  path: string,
  snapshot: PairWorktreeSnapshot,
): boolean {
  const roots = pairDriverWriteRoots(cwd, state, mode);
  if (mode === 'test') {
    const inTestRoot = roots.some((root) => insideRoot(path, root));
    return Boolean(
      inTestRoot &&
        (isTestPath(path) ||
          (path.endsWith('.rs') &&
            preservesRustRegion(cwd, snapshot, path, 'production'))),
    );
  }
  if (!roots.some((root) => insideRoot(path, root))) return false;
  if (isTestPath(path)) return false;
  if (!state.pair_session?.test_paths.includes(path)) return true;
  return (
    path.endsWith('.rs') && preservesRustRegion(cwd, snapshot, path, 'tests')
  );
}

function isTracked(cwd: string, path: string): boolean {
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', '--', path], {
      cwd,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

function diffForPaths(cwd: string, paths: string[]): string {
  if (paths.length === 0) return '(no diff)';
  const trackedDiff = execFileSync(
    'git',
    ['diff', '--no-ext-diff', '--', ...paths],
    { cwd, encoding: 'utf8' },
  );
  const untracked = paths
    .filter((path) => !isTracked(cwd, path))
    .filter((path) => existsSync(join(cwd, path)))
    .map(
      (path) =>
        `--- /dev/null\n+++ b/${path}\n${readFileSync(join(cwd, path), 'utf8')}`,
    )
    .join('\n');
  return (
    `${trackedDiff}${untracked}`.slice(0, 20_000) ||
    '(binary or mode-only diff)'
  );
}

function blockedDriver(
  cwd: string,
  state: WorkflowState & { pair_session: PairSession },
  snapshot: PairWorktreeSnapshot,
  mode: PairDriverMode,
  changedPaths: string[],
  reason: string,
  now: string,
): PairDriverCompletion {
  restorePaths(cwd, snapshot, changedPaths);
  const next = writeState(cwd, {
    ...state,
    pair_session: {
      ...state.pair_session,
      feedback: [
        ...state.pair_session.feedback,
        {
          action: 'driver_blocked',
          reason,
          decided_by: 'system',
          recorded_at: now,
        },
      ],
    },
  });
  return {
    state: next,
    blocked: true,
    changedPaths,
    diff: '(unauthorized changes restored)',
    output: `${mode} Driver blocked: ${reason}\nRestored paths: ${changedPaths.join(', ') || 'none'}.`,
  };
}

export function failPairDriver(
  cwd: string,
  mode: PairDriverMode,
  snapshot: PairWorktreeSnapshot,
  reason: string,
  now = new Date().toISOString(),
): PairDriverCompletion {
  const state = pairState(cwd, false);
  const changedPaths = changedSinceSnapshot(cwd, snapshot);
  return blockedDriver(
    cwd,
    state,
    snapshot,
    mode,
    changedPaths,
    `Driver process failed: ${reason.trim() || 'no diagnostic output'}`,
    now,
  );
}

export function completePairDriver(
  cwd: string,
  mode: PairDriverMode,
  snapshot: PairWorktreeSnapshot,
  summary: string,
  now = new Date().toISOString(),
): PairDriverCompletion {
  const state = pairState(cwd, false);
  if (pairDriverMode(state) !== mode) {
    throw new Error(`Pair checkpoint does not allow ${mode} Driver.`);
  }
  const changedPaths = changedSinceSnapshot(cwd, snapshot);
  if (git(cwd, ['rev-parse', '--verify', 'HEAD']) !== snapshot.head) {
    return blockedDriver(
      cwd,
      state,
      snapshot,
      mode,
      changedPaths,
      'Driver changed Git HEAD; commits are forbidden during Pair.',
      now,
    );
  }
  const unauthorized = changedPaths.filter(
    (path) => !allowedDriverPath(cwd, state, mode, path, snapshot),
  );
  if (unauthorized.length > 0) {
    return blockedDriver(
      cwd,
      state,
      snapshot,
      mode,
      changedPaths,
      `Driver crossed its path boundary: ${unauthorized.join(', ')}.`,
      now,
    );
  }
  const existingAllowed = changedPaths.filter((path) =>
    existsSync(join(cwd, path)),
  );
  if (mode === 'test' && existingAllowed.length === 0) {
    return blockedDriver(
      cwd,
      state,
      snapshot,
      mode,
      changedPaths,
      'Test Driver must leave at least one focused test file.',
      now,
    );
  }
  if (mode === 'implementation' && changedPaths.length === 0) {
    return blockedDriver(
      cwd,
      state,
      snapshot,
      mode,
      changedPaths,
      'Production Driver must make a minimal production-code change.',
      now,
    );
  }
  const diff = diffForPaths(cwd, changedPaths);
  const unit = currentWorkUnit(cwd, state);
  const record = {
    mode,
    task_id: unit.task.id,
    test_id: unit.test.id,
    process_id: unit.process.id,
    step_id: unit.stepId,
    model_refs: unit.test.model_refs,
    changed_paths: changedPaths,
    diff_sha256: digest(diff),
    summary: summary.trim() || `${mode} Driver completed.`,
    completed_at: now,
  };
  const session: PairSession = {
    ...state.pair_session,
    checkpoint:
      mode === 'test'
        ? 'test_written'
        : mode === 'implementation'
          ? 'implementation_written'
          : 'refactored',
    test_paths:
      mode === 'test'
        ? [...new Set([...state.pair_session.test_paths, ...existingAllowed])]
        : state.pair_session.test_paths,
    production_paths:
      mode === 'test'
        ? state.pair_session.production_paths
        : [
            ...new Set([
              ...state.pair_session.production_paths,
              ...changedPaths,
            ]),
          ],
    driver_history: [...state.pair_session.driver_history, record],
  };
  const next = writeState(cwd, { ...state, pair_session: session });
  return {
    state: next,
    blocked: false,
    changedPaths,
    diff,
    output: `${mode} Driver completed one checkpoint.\nChanged paths: ${changedPaths.join(', ') || 'none'}\n\n${diff}\n\nNext: ${pairNextInstruction(next)}.`,
  };
}

function observation(record: TestExecutionRecord): PairObservation {
  if (record.stage === 'showcase') {
    throw new Error('Showcase observations do not belong to a Pair session.');
  }
  return {
    process_id: record.process_id,
    ...(record.step_id ? { step_id: record.step_id } : {}),
    ...(record.task_id ? { task_id: record.task_id } : {}),
    ...(record.test_id ? { test_id: record.test_id } : {}),
    stage: record.stage,
    command: record.command,
    sequence: record.sequence,
    exit_code: record.exit_code,
    expected_failure: record.expected_failure,
    ...(record.stdout_summary ? { stdout_summary: record.stdout_summary } : {}),
    ...(record.stderr_summary ? { stderr_summary: record.stderr_summary } : {}),
  };
}

function saveSession(
  cwd: string,
  state: WorkflowState & { pair_session: PairSession },
  session: PairSession,
): WorkflowState {
  return writeState(cwd, { ...state, pair_session: session });
}

export function executePairAction(
  cwd: string,
  action: PairDeterministicAction,
): PairActionResult {
  const state = pairState(cwd);
  const expectedAction = pairDeterministicAction(cwd, state);
  if (expectedAction !== action) {
    throw new Error(
      `Pair checkpoint ${state.pair_session.checkpoint} requires ${expectedAction ?? 'human navigation'}, not ${action}.`,
    );
  }
  const unit = currentWorkUnit(cwd, state);
  if (action === 'run_red') {
    const record = executeTestStep(cwd, {
      processId: unit.process.id,
      stepId: unit.stepId,
      taskId: unit.task.id,
      testId: unit.test.id,
      stage: 'red',
      command: unit.command,
      invocation: 'pair-controller',
    });
    const red = observation(record);
    const next = saveSession(cwd, state, {
      ...state.pair_session,
      checkpoint: 'red_observed',
      red_observation: red,
      last_observation: red,
    });
    return {
      state: next,
      record,
      output: `Observed Red for ${unitKey(unit)} at ${stepKey(unit)}: exit=${record.exit_code}.\nExpected behavior: ${state.pair_session.expected_red}\nThe independent AI Red Reviewer will classify this observation before automation continues.`,
    };
  }
  if (action === 'run_green') {
    const record = executeTestStep(cwd, {
      processId: unit.process.id,
      stepId: unit.stepId,
      taskId: unit.task.id,
      testId: unit.test.id,
      stage: 'green',
      command: unit.command,
      invocation: 'pair-controller',
    });
    const green = observation(record);
    const passed = record.exit_code === 0;
    if (!passed) {
      const next = saveSession(cwd, state, {
        ...state.pair_session,
        checkpoint: 'red_observed',
        last_observation: green,
      });
      return {
        state: next,
        record,
        output: `Green failed for ${unitKey(unit)} with exit=${record.exit_code}; this is implementation feedback, not Refactor. Next: /evidence-run to retry the Production Driver, or /evidence-pair back-test|back-tasking <reason>.`,
      };
    }
    const completedTestIds = [
      ...new Set([...state.pair_session.completed_test_ids, unit.test.id]),
    ];
    const withGreen = {
      ...state,
      pair_session: {
        ...state.pair_session,
        completed_test_ids: completedTestIds,
        last_observation: green,
      },
    };
    const nextUnit = nextIncompleteWorkUnit(cwd, withGreen);
    if (nextUnit && sameProcessStep(unit, nextUnit)) {
      const next = writeState(cwd, {
        ...withGreen,
        pair_session: {
          ...withGreen.pair_session,
          checkpoint: 'plan_confirmed',
          task_id: nextUnit.task.id,
          test_id: nextUnit.test.id,
          process_id: nextUnit.process.id,
          step_id: nextUnit.stepId,
          expected_red: expectedRed(nextUnit),
          red_observation: undefined,
        },
      });
      return {
        state: next,
        record,
        output: `Observed Green for ${unitKey(unit)}. Refactor is deferred until all TESTs in ${stepKey(unit)} are Green. Paused before ${unitKey(nextUnit)}; run /evidence-run to start its Test Driver checkpoint.`,
      };
    }
    const next = saveSession(cwd, state, {
      ...state.pair_session,
      checkpoint: 'green_observed',
      last_observation: green,
    });
    return {
      state: next,
      record,
      output: `Observed Green for ${unitKey(unit)}. All TESTs in ${stepKey(unit)} are Green; next /evidence-run starts one bounded process-step Refactor Driver checkpoint.`,
    };
  }
  if (action === 'run_refactor') {
    const record = executeTestStep(cwd, {
      processId: unit.process.id,
      stepId: unit.stepId,
      taskId: unit.task.id,
      testId: unit.test.id,
      stage: 'refactor',
      command: unit.command,
      invocation: 'pair-controller',
    });
    const refactor = observation(record);
    if (record.exit_code !== 0) {
      const next = saveSession(cwd, state, {
        ...state.pair_session,
        checkpoint: 'green_observed',
        last_observation: refactor,
      });
      return {
        state: next,
        record,
        output: `Refactor verification failed for ${stepKey(unit)} with exit=${record.exit_code}. Return to the bounded process-step Refactor Driver; quality gates have not started.`,
      };
    }
    const completedTestIds = [
      ...new Set([...state.pair_session.completed_test_ids, unit.test.id]),
    ];
    const allUnits = pairWorkUnits(cwd, state);
    const completedTaskIds = [
      ...new Set([
        ...state.pair_session.completed_task_ids,
        ...allUnits
          .map(({ task }) => task)
          .filter(
            (task, index, tasks) =>
              tasks.findIndex(({ id }) => id === task.id) === index &&
              task.test_ids.every((id) => completedTestIds.includes(id)),
          )
          .map(({ id }) => id),
      ]),
    ];
    const stepCompleted = allUnits
      .filter(
        ({ process, stepId }) =>
          process.id === unit.process.id && stepId === unit.stepId,
      )
      .every(({ test }) => completedTestIds.includes(test.id));
    const completedStepIds = [
      ...new Set([
        ...state.pair_session.completed_step_ids,
        ...(stepCompleted ? [stepKey(unit)] : []),
      ]),
    ];
    const completedSession: PairSession = {
      ...state.pair_session,
      completed_task_ids: completedTaskIds,
      completed_test_ids: completedTestIds,
      completed_step_ids: completedStepIds,
      last_observation: refactor,
    };
    const withCompleted = { ...state, pair_session: completedSession };
    const nextUnit = nextIncompleteWorkUnit(cwd, withCompleted);
    if (nextUnit) {
      const next = writeState(cwd, {
        ...withCompleted,
        pair_session: {
          ...withCompleted.pair_session,
          checkpoint: 'plan_confirmed',
          task_id: nextUnit.task.id,
          test_id: nextUnit.test.id,
          process_id: nextUnit.process.id,
          step_id: nextUnit.stepId,
          expected_red: expectedRed(nextUnit),
          red_observation: undefined,
        },
      });
      return {
        state: next,
        record,
        output: `Refactor verified once for ${stepKey(unit)}. Paused before next unit ${unitKey(nextUnit)} at ${stepKey(nextUnit)}; run /evidence-run to start one Test Driver checkpoint.`,
      };
    }
    const next = writeState(cwd, {
      ...withCompleted,
      pair_session: {
        ...withCompleted.pair_session,
        checkpoint: 'refactored',
      },
    });
    return {
      state: next,
      record,
      output: `All approved TASK/TEST units are Green and every process step is Refactor-green. Next /evidence-run executes exactly one final quality gate.`,
    };
  }

  const gates = qualityGates(cwd, state);
  const gate = gates[state.pair_session.quality_gate_index];
  if (!gate) {
    throw new Error('Pair has no remaining declared quality gate.');
  }
  const record = executeTestStep(cwd, {
    processId: gate.processId,
    stage: 'quality_gate',
    command: gate.command,
    invocation: 'pair-controller',
  });
  const gateObservation = observation(record);
  if (record.exit_code !== 0) {
    const next = saveSession(cwd, state, {
      ...state.pair_session,
      checkpoint: 'quality_gate_failed',
      last_observation: gateObservation,
    });
    return {
      state: next,
      record,
      output: `Quality gate failed (exit=${record.exit_code}): ${gate.command}. This is quality-gate feedback, not a Refactor failure. Choose /evidence-pair retry-quality, back-implementation, back-test, or back-tasking with a reason.`,
    };
  }
  const nextIndex = state.pair_session.quality_gate_index + 1;
  const complete = nextIndex === gates.length;
  const next = saveSession(cwd, state, {
    ...state.pair_session,
    checkpoint: complete ? 'quality_gates_passed' : 'refactored',
    quality_gate_index: nextIndex,
    last_observation: gateObservation,
  });
  if (complete) generateExecutionEvidence(cwd);
  return {
    state: next,
    record,
    output: complete
      ? 'All final quality gates passed for the complete Story Scenario Set. Automated coding evidence is ready; /evidence-explain-diff can generate an optional HTML review aid before the one human Story-level approval.'
      : `Quality gate passed. ${gates.length - nextIndex} final gate(s) remain; Pair automation will execute the next one.`,
  };
}

export function reviewPairRed(
  cwd: string,
  kind: RedFailureKind,
  reason: string,
  now = new Date().toISOString(),
  reviewedBy: 'human' | 'red-reviewer' = 'human',
): WorkflowState {
  const state = pairState(cwd);
  const red = state.pair_session.red_observation;
  const normalized = reason.trim();
  if (state.pair_session.checkpoint !== 'red_observed' || !red || !normalized) {
    throw new Error('A Red observation and review reason are required.');
  }
  if (kind === 'behavior' && !red.expected_failure) {
    throw new Error('A passing command cannot be accepted as Red.');
  }
  if (kind === 'behavior') {
    const accepted: PairObservation = {
      ...red,
      accepted: true,
      failure_kind: kind,
      review_reason: normalized,
      reviewed_by: reviewedBy,
      reviewed_at: now,
    };
    return saveSession(cwd, state, {
      ...state.pair_session,
      accepted_reds: [
        ...state.pair_session.accepted_reds.filter(
          ({ test_id }) => test_id !== accepted.test_id,
        ),
        accepted,
      ],
      red_observation: accepted,
    });
  }
  return saveSession(cwd, state, {
    ...state.pair_session,
    checkpoint: 'plan_confirmed',
    red_observation: {
      ...red,
      accepted: false,
      failure_kind: kind,
      review_reason: normalized,
      reviewed_by: reviewedBy,
      reviewed_at: now,
    },
    feedback: [
      ...state.pair_session.feedback,
      {
        action: 'reject_red',
        reason: `${kind}: ${normalized}`,
        decided_by: reviewedBy === 'human' ? 'human' : 'system',
        recorded_at: now,
      },
    ],
  });
}

export type PairNavigationAction =
  | 'back_test'
  | 'back_implementation'
  | 'back_tasking'
  | 'retry_quality';

export function navigatePair(
  cwd: string,
  action: PairNavigationAction,
  reason: string,
  now = new Date().toISOString(),
): WorkflowState {
  const state = pairState(cwd);
  const normalized = reason.trim();
  if (!normalized) throw new Error('Pair navigation requires a reason.');
  if (action === 'back_tasking') {
    const routed = transitionLoopState(
      state,
      {
        to: 'tasking',
        feedback: {
          target: 'test_strategy',
          reason: normalized,
          decided_by: 'human',
        },
      },
      now,
    );
    return writeState(cwd, {
      ...routed,
      tasking_stage: 'drafting',
      tasking_candidate: undefined,
      tasking_gap: {
        kind: 'process_gap',
        reason: normalized,
        recorded_at: now,
      },
      approved_test_plan_path: undefined,
      approved_test_plan_sha256: undefined,
      active_work_item: undefined,
      pair_session: undefined,
    });
  }
  if (
    action === 'retry_quality' &&
    state.pair_session.checkpoint !== 'quality_gate_failed'
  ) {
    throw new Error('retry_quality requires a failed quality gate.');
  }
  if (
    action === 'back_implementation' &&
    !state.pair_session.red_observation?.accepted
  ) {
    throw new Error('back_implementation requires a human-accepted Red.');
  }
  const currentKey = `${state.pair_session.process_id}/${state.pair_session.step_id}`;
  const keepCompletion = action === 'retry_quality';
  const checkpoint =
    action === 'back_test'
      ? 'plan_confirmed'
      : action === 'back_implementation'
        ? 'red_observed'
        : 'refactored';
  return saveSession(cwd, state, {
    ...state.pair_session,
    checkpoint,
    completed_task_ids: keepCompletion
      ? state.pair_session.completed_task_ids
      : state.pair_session.completed_task_ids.filter(
          (taskId) => taskId !== state.pair_session.task_id,
        ),
    completed_test_ids: keepCompletion
      ? state.pair_session.completed_test_ids
      : state.pair_session.completed_test_ids.filter(
          (testId) => testId !== state.pair_session.test_id,
        ),
    completed_step_ids: keepCompletion
      ? state.pair_session.completed_step_ids
      : state.pair_session.completed_step_ids.filter(
          (step) => step !== currentKey,
        ),
    quality_gate_index: keepCompletion
      ? state.pair_session.quality_gate_index
      : 0,
    automation_exception: undefined,
    ...(action === 'back_test' ? { red_observation: undefined } : {}),
    feedback: [
      ...state.pair_session.feedback,
      {
        action,
        reason: normalized,
        decided_by: 'human',
        recorded_at: now,
      },
    ],
  });
}

export function pairNextInstruction(state: WorkflowState): string {
  const session = state.pair_session;
  if (!session) return 'return to Tasking';
  if (session.automation_exception) {
    return '/evidence-pair back-test|back-implementation|back-tasking|retry-quality <reason> routes the recorded automation exception';
  }
  switch (session.checkpoint) {
    case 'plan_confirmed':
    case 'test_written':
    case 'implementation_written':
    case 'green_observed':
    case 'refactored':
      return '/evidence-run continues automated Pair coding';
    case 'red_observed':
      return session.red_observation?.accepted
        ? '/evidence-run continues with the Production Driver'
        : '/evidence-run invokes the independent AI Red Reviewer';
    case 'quality_gate_failed':
      return '/evidence-run attempts bounded automated repair; explicit back-* routing remains available after an exception';
    case 'quality_gates_passed':
      return '/evidence-explain-diff optionally creates a read-only HTML explanation; /evidence-pair approve <reason> records the one human Story coding decision and enters Showcase';
  }
}
