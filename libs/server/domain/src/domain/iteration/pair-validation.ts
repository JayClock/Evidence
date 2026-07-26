import { DomainError } from '../error';
import type {
  DecidePairInput,
  PairCommandObservationDescription,
  PairDecisionAction,
  PairDriverMode,
  PairDriverRole,
  PairExceptionKind,
  PairQualityGate,
  PairRedClassification,
  PairTermination,
  PairWorkUnit,
  RecordPairCommandObservationInput,
  RecordPairDriverAttemptInput,
  RecordPairExceptionInput,
  RecordPairRedReviewInput,
  StartPairInput,
} from './pair';
import type { TaskingCandidateDescription } from './tasking';
import {
  TASKING_PROCESS_CATALOG,
  type TaskingProcessDefinition,
} from './tasking-catalog';

const SHA256 = /^sha256:[a-f0-9]{64}$/;
const GIT_SHA = /^[a-f0-9]{40,64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const RELATIVE_PATH =
  /^(?!\/)(?![A-Za-z]:[\\/])(?!.*(?:^|[\\/])\.\.(?:[\\/]|$))[^\0]+$/;
const DRIVER_ROLES = new Set<PairDriverRole>([
  'test',
  'production',
  'refactor',
]);
const DRIVER_MODES = new Set<PairDriverMode>([
  'write_test',
  'repair_test',
  'implement',
  'repair_implementation',
  'refactor',
  'repair_refactor',
  'repair_quality_gate',
]);
const TERMINATIONS = new Set<PairTermination>([
  'exited',
  'timed_out',
  'signaled',
  'spawn_error',
]);
const RED_CLASSIFICATIONS = new Set<PairRedClassification>([
  'behavior',
  'compile',
  'dependency',
  'configuration',
  'network',
  'fixture',
  'other',
]);
const EXCEPTION_KINDS = new Set<PairExceptionKind>([
  'unexpected_green',
  'pseudo_red',
  'green_failed',
  'refactor_failed',
  'quality_gate_failed',
  'path_violation',
  'git_head_changed',
  'project_ownership_changed',
  'lease_expired',
  'interrupted',
  'budget_exhausted',
  'no_progress',
  'evidence_mismatch',
  'runtime_failure',
]);
const DECISION_ACTIONS = new Set<PairDecisionAction>([
  'approve',
  'back_test',
  'back_implementation',
  'back_tasking',
  'retry_quality',
  'cancel',
]);

export interface PairExecutionPlan {
  workUnits: PairWorkUnit[];
  qualityGates: PairQualityGate[];
}

export function materializePairExecutionPlan(
  plan: TaskingCandidateDescription,
  catalog: TaskingProcessDefinition[] = TASKING_PROCESS_CATALOG,
): PairExecutionPlan {
  if (plan.planVersion !== 2) {
    throw DomainError.conflict('Pair requires an Approved Tasking Plan v2');
  }
  const projects = new Map(
    plan.projectCatalog.projects.map((project) => [project.id, project]),
  );
  const processes = new Map(
    plan.processes.map((process) => [process.runtimePlanId, process]),
  );
  const tests = new Map(plan.tests.map((test) => [test.id, test]));
  const workUnits: PairWorkUnit[] = [];
  const seenTests = new Set<string>();

  for (const task of plan.tasks) {
    for (const testId of task.testIds) {
      if (seenTests.has(testId)) {
        throw DomainError.conflict(`${testId} appears twice in the Pair plan`);
      }
      seenTests.add(testId);
      const test = tests.get(testId);
      if (!test) {
        throw DomainError.conflict(`${testId} is missing from the Pair plan`);
      }
      const process = processes.get(test.runtimePlanId);
      if (!process || process.processId !== test.processId) {
        throw DomainError.conflict(`${testId} lost its selected process`);
      }
      const definition = catalog.find(({ id }) => id === process.processId);
      const step = definition?.steps.find(({ id }) => id === test.stepId);
      if (!definition || !step || !process.selectedStepIds.includes(step.id)) {
        throw DomainError.conflict(`${testId} lost its process step`);
      }
      const commands = process.focusedCommands.filter(
        (command) => command.testId === test.id && command.stepId === step.id,
      );
      if (commands.length !== 1 || !commands[0]) {
        throw DomainError.conflict(
          `${testId} must have one locked focused command`,
        );
      }
      const productionRoots = process.projectIds.map((projectId) => {
        const project = projects.get(projectId);
        if (!project) {
          throw DomainError.conflict(
            `${process.runtimePlanId} lost Nx project ${projectId}`,
          );
        }
        return project.root;
      });
      workUnits.push({
        index: workUnits.length,
        stepKey: `${process.runtimePlanId}:${step.id}`,
        task,
        test,
        process,
        step,
        focusedCommand: {
          command: commands[0].command,
          projectId: commands[0].projectId,
        },
        testRoots: [...step.nearestTestRoots],
        productionRoots: unique(productionRoots),
      });
    }
  }

  if (workUnits.length !== tests.size) {
    throw DomainError.conflict('Every Pair TEST must belong to one TASK');
  }

  const qualityGates: PairQualityGate[] = [];
  const seenGates = new Set<string>();
  for (const process of plan.processes) {
    for (const gate of process.qualityGates) {
      const key = JSON.stringify([
        process.processId,
        gate.projectId,
        gate.target,
        gate.command,
      ]);
      if (seenGates.has(key)) continue;
      seenGates.add(key);
      qualityGates.push({
        index: qualityGates.length,
        processId: process.processId,
        projectId: gate.projectId,
        target: gate.target,
        command: gate.command,
      });
    }
  }
  if (qualityGates.length === 0) {
    throw DomainError.conflict('Pair requires locked quality gates');
  }
  return { workUnits, qualityGates };
}

export function normalizeStartPairInput(input: StartPairInput): StartPairInput {
  return {
    expectedIterationVersion: positive(
      input.expectedIterationVersion,
      'Iteration version',
    ),
    approvedTaskingPlanId: identifier(
      input.approvedTaskingPlanId,
      'Approved Tasking Plan id',
    ),
    approvedTaskingPlanSha256: sha256(
      input.approvedTaskingPlanSha256,
      'Approved Tasking Plan SHA-256',
    ),
    executorId: identifier(input.executorId, 'Pair executor id'),
  };
}

export function normalizePairDriverAttemptInput(
  input: RecordPairDriverAttemptInput,
): RecordPairDriverAttemptInput {
  const authority = normalizeAuthority(input);
  if (!DRIVER_ROLES.has(input.role)) {
    throw DomainError.validation(`unsupported Pair Driver role: ${input.role}`);
  }
  if (!DRIVER_MODES.has(input.mode)) {
    throw DomainError.validation(`unsupported Pair Driver mode: ${input.mode}`);
  }
  return {
    ...authority,
    role: input.role,
    mode: input.mode,
    summary: text(input.summary, 'Pair Driver summary', 2_000),
    changedPaths: unique(
      input.changedPaths.map((path) => relativePath(path, 'changed path')),
    ).sort(),
    beforeWorktreeSha256: sha256(
      input.beforeWorktreeSha256,
      'before worktree SHA-256',
    ),
    afterWorktreeSha256: sha256(
      input.afterWorktreeSha256,
      'after worktree SHA-256',
    ),
    diffSha256: sha256(input.diffSha256, 'Pair diff SHA-256'),
    agentCallCount: positive(input.agentCallCount, 'Agent call count'),
    inputTokens: nullableNonnegative(input.inputTokens, 'input tokens'),
    outputTokens: nullableNonnegative(input.outputTokens, 'output tokens'),
  };
}

export function normalizePairCommandObservationInput(
  input: RecordPairCommandObservationInput,
): RecordPairCommandObservationInput {
  const authority = normalizeAuthority(input);
  if (!TERMINATIONS.has(input.termination)) {
    throw DomainError.validation(
      `unsupported Pair command termination: ${input.termination}`,
    );
  }
  const exitCode = nullableInteger(input.exitCode, 'command exit code');
  const signal = input.signal?.trim() || null;
  if (input.termination === 'exited' && exitCode === null) {
    throw DomainError.validation('Exited Pair command requires an exit code');
  }
  if (input.termination !== 'exited' && exitCode !== null) {
    throw DomainError.validation(
      'Non-exited Pair command cannot report an exit code',
    );
  }
  if (input.termination === 'signaled' && !signal) {
    throw DomainError.validation('Signaled Pair command requires a signal');
  }
  return {
    ...authority,
    stage: input.stage,
    command: text(input.command, 'Pair command', 2_000),
    termination: input.termination,
    exitCode,
    signal,
    durationMs: nonnegative(input.durationMs, 'command duration'),
    stdoutSha256: sha256(input.stdoutSha256, 'stdout SHA-256'),
    stdoutBytes: nonnegative(input.stdoutBytes, 'stdout bytes'),
    stdoutLines: nonnegative(input.stdoutLines, 'stdout lines'),
    stderrSha256: sha256(input.stderrSha256, 'stderr SHA-256'),
    stderrBytes: nonnegative(input.stderrBytes, 'stderr bytes'),
    stderrLines: nonnegative(input.stderrLines, 'stderr lines'),
    worktreeSha256: sha256(input.worktreeSha256, 'worktree SHA-256'),
    diffSha256: sha256(input.diffSha256, 'Pair diff SHA-256'),
  };
}

export function normalizePairRedReviewInput(
  input: RecordPairRedReviewInput,
): RecordPairRedReviewInput {
  const authority = normalizeAuthority(input);
  if (!RED_CLASSIFICATIONS.has(input.classification)) {
    throw DomainError.validation(
      `unsupported Red classification: ${input.classification}`,
    );
  }
  return {
    ...authority,
    observationId: identifier(input.observationId, 'Red observation id'),
    classification: input.classification,
    reason: text(input.reason, 'Red review reason', 2_000),
  };
}

export function normalizePairExceptionInput(
  input: RecordPairExceptionInput,
): RecordPairExceptionInput {
  const authority = normalizeAuthority(input);
  if (!EXCEPTION_KINDS.has(input.kind)) {
    throw DomainError.validation(`unsupported Pair exception: ${input.kind}`);
  }
  return {
    ...authority,
    kind: input.kind,
    summary: text(input.summary, 'Pair exception summary', 2_000),
    failureFingerprint: input.failureFingerprint
      ? sha256(input.failureFingerprint, 'failure fingerprint')
      : null,
  };
}

export function normalizeDecidePairInput(
  input: DecidePairInput,
): DecidePairInput {
  if (!DECISION_ACTIONS.has(input.action)) {
    throw DomainError.validation(`unsupported Pair decision: ${input.action}`);
  }
  const normalized: DecidePairInput = {
    expectedPairVersion: positive(input.expectedPairVersion, 'Pair version'),
    action: input.action,
    reason: text(input.reason, 'Pair decision reason', 2_000),
    manifestSha256: input.manifestSha256
      ? sha256(input.manifestSha256, 'Pair Manifest SHA-256')
      : null,
    diffSha256: input.diffSha256
      ? sha256(input.diffSha256, 'Pair diff SHA-256')
      : null,
    commitSha: input.commitSha
      ? gitSha(input.commitSha, 'Pair commit SHA')
      : null,
  };
  if (
    input.action === 'approve' &&
    (!normalized.manifestSha256 ||
      !normalized.diffSha256 ||
      !normalized.commitSha)
  ) {
    throw DomainError.validation(
      'Pair approval requires Manifest, diff, and commit hashes',
    );
  }
  if (
    input.action !== 'approve' &&
    (normalized.manifestSha256 || normalized.diffSha256 || normalized.commitSha)
  ) {
    throw DomainError.validation(
      'Only Pair approval can record Manifest, diff, and commit hashes',
    );
  }
  return normalized;
}

export function pairCommandPassed(
  observation: Pick<
    PairCommandObservationDescription,
    'termination' | 'exitCode'
  >,
): boolean {
  return observation.termination === 'exited' && observation.exitCode === 0;
}

export function allowedPairExceptionRoutes(
  kind: PairExceptionKind,
): PairDecisionAction[] {
  switch (kind) {
    case 'unexpected_green':
    case 'pseudo_red':
      return ['back_test', 'back_tasking', 'cancel'];
    case 'green_failed':
      return ['back_implementation', 'back_tasking', 'cancel'];
    case 'refactor_failed':
      return ['back_implementation', 'back_tasking', 'cancel'];
    case 'quality_gate_failed':
      return ['retry_quality', 'back_implementation', 'back_tasking', 'cancel'];
    case 'path_violation':
    case 'git_head_changed':
    case 'project_ownership_changed':
    case 'evidence_mismatch':
      return ['back_tasking', 'cancel'];
    case 'lease_expired':
    case 'interrupted':
    case 'runtime_failure':
      return ['back_test', 'back_implementation', 'retry_quality', 'cancel'];
    case 'budget_exhausted':
    case 'no_progress':
      return ['back_tasking', 'cancel'];
  }
}

function normalizeAuthority(input: {
  pairRunId: string;
  actionId: string;
  expectedPairVersion: number;
  leaseToken: string;
}) {
  return {
    pairRunId: identifier(input.pairRunId, 'Pair Run id'),
    actionId: identifier(input.actionId, 'Pair action id'),
    expectedPairVersion: positive(input.expectedPairVersion, 'Pair version'),
    leaseToken: text(input.leaseToken, 'Pair lease token', 500),
  };
}

function relativePath(value: string, label: string): string {
  const normalized = text(value, label, 2_000).replace(/\\/g, '/');
  if (!RELATIVE_PATH.test(normalized)) {
    throw DomainError.validation(`${label} must be repository-relative`);
  }
  return normalized.replace(/^\.\//, '');
}

function identifier(value: string, label: string): string {
  const normalized = text(value, label, 500);
  if (!IDENTIFIER.test(normalized)) {
    throw DomainError.validation(`${label} is invalid`);
  }
  return normalized;
}

function sha256(value: string, label: string): string {
  const normalized =
    typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!SHA256.test(normalized)) {
    throw DomainError.validation(`${label} is invalid`);
  }
  return normalized;
}

function gitSha(value: string, label: string): string {
  const normalized =
    typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!GIT_SHA.test(normalized)) {
    throw DomainError.validation(`${label} is invalid`);
  }
  return normalized;
}

function text(value: string, label: string, maximum: number): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized || normalized.length > maximum) {
    throw DomainError.validation(`${label} is invalid`);
  }
  return normalized;
}

function positive(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw DomainError.validation(`${label} must be a positive integer`);
  }
  return value;
}

function nonnegative(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw DomainError.validation(`${label} must be a non-negative integer`);
  }
  return value;
}

function nullableNonnegative(
  value: number | null | undefined,
  label: string,
): number | null {
  return value === null || value === undefined
    ? null
    : nonnegative(value, label);
}

function nullableInteger(value: number | null, label: string): number | null {
  if (value === null) return null;
  if (!Number.isSafeInteger(value)) {
    throw DomainError.validation(`${label} must be an integer or null`);
  }
  return value;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
