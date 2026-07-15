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
import { transitionLoopState } from '../iteration/transition-graph';
import {
  readState,
  selectedTestProcesses,
  writeState,
} from '../iteration/state-repository';
import type {
  PairDeterministicAction,
  PairDriverMode,
  PairObservation,
  PairSession,
  RedFailureKind,
  TestProcessSelection,
  WorkflowState,
} from '../iteration/state';
import {
  executeTestStep,
  type TestExecutionRecord,
} from './execution-recorder';
import { generateExecutionEvidence } from './execution-manifest';
import { readTestProcess } from './process-catalog';

interface PairStep {
  process: TestProcessSelection;
  stepId: string;
  command: string;
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
    state.workflow_version !== 5 ||
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

function currentStep(cwd: string, state: WorkflowState): PairStep {
  const session = state.pair_session;
  if (!session) throw new Error('Pair has no session.');
  const step = pairSteps(cwd, state).find(
    ({ process, stepId }) =>
      process.id === session.process_id && stepId === session.step_id,
  );
  if (!step) throw new Error('Current Pair process step is not approved.');
  return step;
}

function stepKey(step: PairStep): string {
  return `${step.process.id}/${step.stepId}`;
}

function nextIncompleteStep(
  cwd: string,
  state: WorkflowState,
): PairStep | undefined {
  const completed = new Set(state.pair_session?.completed_step_ids ?? []);
  return pairSteps(cwd, state).find((step) => !completed.has(stepKey(step)));
}

function expectedRed(state: WorkflowState, step: PairStep): string {
  const intents = state.tasking_candidate?.tests
    .filter(
      ({ process_id, step_id }) =>
        process_id === step.process.id && step_id === step.stepId,
    )
    .map(({ intent }) => intent)
    .join('；');
  if (!intents)
    throw new Error(`No approved test intent for ${stepKey(step)}.`);
  return intents;
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
    return session.completed_step_ids.includes(
      `${session.process_id}/${session.step_id}`,
    )
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
  const step = currentStep(cwd, state);
  const definition = readTestProcess(join(cwd, step.process.path));
  const processStep = definition.steps.find(({ id }) => id === step.stepId);
  if (!processStep) throw new Error(`Missing process step ${stepKey(step)}.`);
  const common = `方法：先加载并遵守 .pi/skills/evidence-pairing/SKILL.md。
当前工作项：${session.story_id} / ${session.scenario_id}
当前步骤：${stepKey(step)} · ${processStep.purpose}
Git baseline：${session.git_baseline}
确认 Scenario：${state.confirmed_scenario?.artifact_path ?? 'missing'}
模型展开：${state.model_expansion_path ?? 'missing'}
测试列表：${state.tasking_candidate?.test_list_path ?? 'missing'}
任务列表：${state.tasking_candidate?.task_list_path ?? 'missing'}
锁定计划：${state.approved_test_plan_path}
聚焦命令（Driver 不运行）：${step.command}`;
  if (mode === 'test') {
    return `执行一个且仅一个 Test Driver checkpoint。

${common}

允许的测试 roots：${processStep.nearest_test.roots.join(', ')}。预期 Red 行为：${session.expected_red}。

任务：写当前步骤的一个最小行为测试后立即停止。不得修改生产代码、配置、计划、状态或执行证据，不得运行命令或提交；报告路径、断言和预期失败。越界修改会被恢复并阻止 checkpoint。`;
  }
  if (mode === 'implementation') {
    return `执行一个且仅一个 Production Driver Green checkpoint。

${common}

已由 Navigator 接受的 Red：${session.red_observation?.review_reason ?? session.expected_red}。

读取已确认测试与 Red，只写最小生产实现；不得修改、删除、跳过或削弱任何测试，不得修改计划、状态或执行证据，不得运行聚焦命令，不得提交 Git。完成最小实现后立即停止。所有测试路径会被冻结并由确定性保护器校验。`;
  }
  return `执行一个且仅一个 Production Driver Refactor checkpoint。

${common}

Green 已观测通过。只重构生产实现以改善命名、职责或重复；不得改变行为，不得修改任何测试，不得修改计划、状态或执行证据，不得运行命令，不得提交 Git。若没有有价值的安全重构，明确说明 no-op 并立即停止。`;
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

function allowedDriverPath(
  cwd: string,
  state: WorkflowState,
  mode: PairDriverMode,
  path: string,
  snapshot: PairWorktreeSnapshot,
): boolean {
  if (mode === 'test') {
    const step = currentStep(cwd, state);
    const definition = readTestProcess(join(cwd, step.process.path));
    const roots = definition.steps.find(({ id }) => id === step.stepId)
      ?.nearest_test.roots;
    const inTestRoot = roots?.some((root) => insideRoot(path, root));
    return Boolean(
      inTestRoot &&
        (isTestPath(path) ||
          (path.endsWith('.rs') &&
            preservesRustRegion(cwd, snapshot, path, 'production'))),
    );
  }
  const process = currentStep(cwd, state).process;
  const technical = readTestProcess(
    join(cwd, process.path),
  ).technical_boundaries;
  const productionRoots =
    process.runtime === 'rust'
      ? ['apps/server', 'libs/server']
      : process.runtime === 'tauri'
        ? ['apps/desktop']
        : technical.some((boundary) => boundary.startsWith('nest-'))
          ? ['apps/server-nest', 'libs/server-nest']
          : ['apps/web', 'libs/web'];
  if (!productionRoots.some((root) => insideRoot(path, root))) return false;
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
  const step = currentStep(cwd, state);
  const record = {
    mode,
    process_id: step.process.id,
    step_id: step.stepId,
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
    stage: record.stage,
    command: record.command,
    sequence: record.sequence,
    exit_code: record.exit_code,
    expected_failure: record.expected_failure,
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
  const step = currentStep(cwd, state);
  if (action === 'run_red') {
    const record = executeTestStep(cwd, {
      processId: step.process.id,
      stepId: step.stepId,
      stage: 'red',
      command: step.command,
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
      output: `Observed Red for ${stepKey(step)}: exit=${record.exit_code}.\nExpected behavior: ${state.pair_session.expected_red}\nNavigator must run /evidence-pair accept-red <reason> only for a behavior failure, or reject-red <kind> <reason>.`,
    };
  }
  if (action === 'run_green') {
    const record = executeTestStep(cwd, {
      processId: step.process.id,
      stepId: step.stepId,
      stage: 'green',
      command: step.command,
      invocation: 'pair-controller',
    });
    const green = observation(record);
    const passed = record.exit_code === 0;
    const next = saveSession(cwd, state, {
      ...state.pair_session,
      checkpoint: passed ? 'green_observed' : 'red_observed',
      last_observation: green,
    });
    return {
      state: next,
      record,
      output: passed
        ? `Observed Green for ${stepKey(step)}. Next: /evidence-run for one bounded Refactor Driver checkpoint.`
        : `Green failed for ${stepKey(step)} with exit=${record.exit_code}; this is implementation feedback, not Refactor. Next: /evidence-run to retry the Production Driver, or /evidence-pair back-test|back-tasking <reason>.`,
    };
  }
  if (action === 'run_refactor') {
    const record = executeTestStep(cwd, {
      processId: step.process.id,
      stepId: step.stepId,
      stage: 'refactor',
      command: step.command,
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
        output: `Refactor verification failed for ${stepKey(step)} with exit=${record.exit_code}. Return to the bounded Refactor Driver; quality gates have not started.`,
      };
    }
    const completed = [
      ...new Set([...state.pair_session.completed_step_ids, stepKey(step)]),
    ];
    const withCompleted = {
      ...state,
      pair_session: {
        ...state.pair_session,
        completed_step_ids: completed,
        last_observation: refactor,
      },
    };
    const nextStep = nextIncompleteStep(cwd, withCompleted);
    if (nextStep) {
      const next = writeState(cwd, {
        ...withCompleted,
        pair_session: {
          ...withCompleted.pair_session,
          checkpoint: 'plan_confirmed',
          process_id: nextStep.process.id,
          step_id: nextStep.stepId,
          expected_red: expectedRed(state, nextStep),
          red_observation: undefined,
        },
      });
      return {
        state: next,
        record,
        output: `Refactor verified for ${stepKey(step)}. Paused before next step ${stepKey(nextStep)}; run /evidence-run to start one Test Driver checkpoint.`,
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
      output: `All focused process steps are Refactor-green. Next /evidence-run executes exactly one final quality gate.`,
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
      ? 'All final quality gates passed. Deterministic execution manifest and summary were generated; Pair is ready for Showcase.'
      : `Quality gate passed. ${gates.length - nextIndex} final gate(s) remain; /evidence-run executes only the next one.`,
  };
}

export function reviewPairRed(
  cwd: string,
  kind: RedFailureKind,
  reason: string,
  now = new Date().toISOString(),
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
      reviewed_at: now,
    };
    return saveSession(cwd, state, {
      ...state.pair_session,
      accepted_reds: [
        ...state.pair_session.accepted_reds.filter(
          ({ process_id, step_id }) =>
            process_id !== accepted.process_id || step_id !== accepted.step_id,
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
      reviewed_at: now,
    },
    feedback: [
      ...state.pair_session.feedback,
      {
        action: 'reject_red',
        reason: `${kind}: ${normalized}`,
        decided_by: 'human',
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
  const checkpoint =
    action === 'back_test'
      ? 'plan_confirmed'
      : action === 'back_implementation'
        ? 'red_observed'
        : 'refactored';
  return saveSession(cwd, state, {
    ...state.pair_session,
    checkpoint,
    completed_step_ids:
      action === 'retry_quality'
        ? state.pair_session.completed_step_ids
        : state.pair_session.completed_step_ids.filter(
            (step) => step !== currentKey,
          ),
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
  switch (session.checkpoint) {
    case 'plan_confirmed':
    case 'test_written':
    case 'implementation_written':
    case 'green_observed':
    case 'refactored':
      return '/evidence-run advances one checkpoint';
    case 'red_observed':
      return session.red_observation?.accepted
        ? '/evidence-run starts one Production Driver checkpoint'
        : '/evidence-pair accept-red <reason> or reject-red <kind> <reason>';
    case 'quality_gate_failed':
      return '/evidence-pair retry-quality|back-implementation|back-test|back-tasking <reason>';
    case 'quality_gates_passed':
      return 'Pair is ready for Showcase';
  }
}
