import { isAbsolute } from 'node:path';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const RELATIVE_PATH =
  /^(?!\/)(?![A-Za-z]:[\\/])(?!.*(?:^|[\\/])\.\.(?:[\\/]|$))[^\0]+$/;

export type PairDriverRole = 'test' | 'production' | 'refactor';
export type PairDriverMode =
  | 'write_test'
  | 'repair_test'
  | 'implement'
  | 'repair_implementation'
  | 'refactor'
  | 'repair_refactor'
  | 'repair_quality_gate';

export interface PairDriverWorkUnit {
  index: number;
  stepKey: string;
  task: { id: string; description: string };
  test: {
    id: string;
    quadrant: 'Q1' | 'Q2';
    intent: string;
    scenarioIds: string[];
    scenarioOutcome: string | null;
    businessData: string[];
  };
  process: { processId: string; runtimePlanId: string };
  step: {
    id: string;
    purpose: string;
    red: {
      expectedFailureKind: 'behavior';
      expectedFailure: string;
    };
    greenDoneWhen: string;
    refactorDoneWhen: string;
  };
}

export interface PairDriverRuntimeRequest {
  id: string;
  role: PairDriverRole;
  mode: PairDriverMode;
  worktreeRoot: string;
  timeoutMs: number;
  authority: {
    pairRunId: string;
    approvedTaskingPlanSha256: string;
    storyRevisionSha256: string;
    baseCommitSha: string;
  };
  story: {
    reference: 'US-001';
    title: string;
    problem: string;
    role: string;
    goal: string;
    value: string;
  };
  workUnit: PairDriverWorkUnit;
  allowedTestRoots: string[];
  allowedProductionRoots: string[];
  frozenTestPaths: string[];
  diagnostic: {
    stage: 'red' | 'green' | 'refactor' | 'quality_gate' | 'human_review';
    summary: string;
    stdout: string;
    stderr: string;
  } | null;
}

export type PairDriverEvent =
  | {
      id: string;
      event: 'progress' | 'tool-start' | 'tool-end' | 'error';
      data: string;
    }
  | {
      id: string;
      event: 'complete';
      data: string;
      details: {
        summary: string;
        agentCallCount: 1;
      };
    };

export function parsePairDriverRuntimeRequest(
  value: unknown,
): PairDriverRuntimeRequest {
  const input = object(value, 'Pair Driver request');
  const authority = object(input.authority, 'Pair authority');
  const story = object(input.story, 'Pair Story');
  const workUnit = parseWorkUnit(input.workUnit);
  const diagnostic =
    input.diagnostic === null || input.diagnostic === undefined
      ? null
      : parseDiagnostic(input.diagnostic);
  const role = oneOf(input.role, 'Pair Driver role', [
    'test',
    'production',
    'refactor',
  ] as const);
  const mode = oneOf(input.mode, 'Pair Driver mode', [
    'write_test',
    'repair_test',
    'implement',
    'repair_implementation',
    'refactor',
    'repair_refactor',
    'repair_quality_gate',
  ] as const);
  assertRoleMode(role, mode);
  assertRepairDiagnostic(mode, diagnostic);
  return {
    id: identifier(input.id, 'request id'),
    role,
    mode,
    worktreeRoot: absolutePath(input.worktreeRoot),
    timeoutMs: boundedInteger(input.timeoutMs, 'Driver timeout', 1, 900_000),
    authority: {
      pairRunId: identifier(authority.pairRunId, 'Pair Run id'),
      approvedTaskingPlanSha256: sha256(
        authority.approvedTaskingPlanSha256,
        'Approved Plan SHA-256',
      ),
      storyRevisionSha256: sha256(
        authority.storyRevisionSha256,
        'Story Revision SHA-256',
      ),
      baseCommitSha: gitSha(authority.baseCommitSha, 'base commit SHA'),
    },
    story: {
      reference: literal(story.reference, 'US-001', 'Story reference'),
      title: text(story.title, 'Story title', 2_000),
      problem: text(story.problem, 'Story problem', 5_000),
      role: text(story.role, 'Story role', 2_000),
      goal: text(story.goal, 'Story goal', 2_000),
      value: text(story.value, 'Story value', 2_000),
    },
    workUnit,
    allowedTestRoots: paths(input.allowedTestRoots, 'allowed test roots'),
    allowedProductionRoots: paths(
      input.allowedProductionRoots,
      'allowed production roots',
    ),
    frozenTestPaths: paths(input.frozenTestPaths, 'frozen test paths'),
    diagnostic,
  };
}

export function parsePairDriverEvent(value: unknown): PairDriverEvent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const event = value as Partial<PairDriverEvent>;
  if (
    typeof event.id !== 'string' ||
    !ID.test(event.id) ||
    typeof event.event !== 'string' ||
    typeof event.data !== 'string'
  ) {
    return null;
  }
  if (
    event.event === 'progress' ||
    event.event === 'tool-start' ||
    event.event === 'tool-end' ||
    event.event === 'error'
  ) {
    return { id: event.id, event: event.event, data: event.data };
  }
  if (event.event !== 'complete') return null;
  const details = (event as { details?: unknown }).details;
  if (!details || typeof details !== 'object' || Array.isArray(details)) {
    return null;
  }
  const summary = (details as { summary?: unknown }).summary;
  const agentCallCount = (details as { agentCallCount?: unknown })
    .agentCallCount;
  if (
    typeof summary !== 'string' ||
    !summary.trim() ||
    summary.length > 2_000 ||
    agentCallCount !== 1
  ) {
    return null;
  }
  return {
    id: event.id,
    event: 'complete',
    data: event.data,
    details: { summary, agentCallCount: 1 },
  };
}

function parseWorkUnit(value: unknown): PairDriverWorkUnit {
  const unit = object(value, 'Pair work unit');
  const task = object(unit.task, 'Pair TASK');
  const test = object(unit.test, 'Pair TEST');
  const process = object(unit.process, 'Pair process');
  const step = object(unit.step, 'Pair process step');
  const red = object(step.red, 'Pair Red contract');
  const quadrant = oneOf(test.quadrant, 'TEST quadrant', ['Q1', 'Q2'] as const);
  return {
    index: boundedInteger(unit.index, 'work unit index', 0, 10_000),
    stepKey: text(unit.stepKey, 'process step key', 500),
    task: {
      id: identifier(task.id, 'TASK id'),
      description: text(task.description, 'TASK description', 2_000),
    },
    test: {
      id: identifier(test.id, 'TEST id'),
      quadrant,
      intent: text(test.intent, 'TEST intent', 2_000),
      scenarioIds: stringArray(test.scenarioIds, 'Scenario ids', 1, 5),
      scenarioOutcome: optionalText(
        test.scenarioOutcome,
        'Scenario outcome',
        2_000,
      ),
      businessData: stringArray(test.businessData, 'business data', 0, 50),
    },
    process: {
      processId: identifier(process.processId, 'process id'),
      runtimePlanId: identifier(process.runtimePlanId, 'runtime plan id'),
    },
    step: {
      id: identifier(step.id, 'process step id'),
      purpose: text(step.purpose, 'process step purpose', 2_000),
      red: {
        expectedFailureKind: literal(
          red.expectedFailureKind,
          'behavior',
          'expected failure kind',
        ),
        expectedFailure: text(red.expectedFailure, 'expected failure', 2_000),
      },
      greenDoneWhen: text(step.greenDoneWhen, 'Green done condition', 2_000),
      refactorDoneWhen: text(
        step.refactorDoneWhen,
        'Refactor done condition',
        2_000,
      ),
    },
  };
}

function parseDiagnostic(
  value: unknown,
): NonNullable<PairDriverRuntimeRequest['diagnostic']> {
  const diagnostic = object(value, 'Pair diagnostic');
  return {
    stage: oneOf(diagnostic.stage, 'diagnostic stage', [
      'red',
      'green',
      'refactor',
      'quality_gate',
      'human_review',
    ] as const),
    summary: text(diagnostic.summary, 'diagnostic summary', 2_000),
    stdout: boundedOutput(diagnostic.stdout, 'diagnostic stdout'),
    stderr: boundedOutput(diagnostic.stderr, 'diagnostic stderr'),
  };
}

function assertRoleMode(role: PairDriverRole, mode: PairDriverMode): void {
  const valid =
    (role === 'test' && ['write_test', 'repair_test'].includes(mode)) ||
    (role === 'production' &&
      ['implement', 'repair_implementation', 'repair_quality_gate'].includes(
        mode,
      )) ||
    (role === 'refactor' && ['refactor', 'repair_refactor'].includes(mode));
  if (!valid) throw new Error(`Pair ${role} Driver cannot run ${mode}.`);
}

function assertRepairDiagnostic(
  mode: PairDriverMode,
  diagnostic: PairDriverRuntimeRequest['diagnostic'],
): void {
  if (!mode.startsWith('repair_')) {
    if (diagnostic) {
      throw new Error(`Pair ${mode} Driver cannot receive repair evidence.`);
    }
    return;
  }
  if (!diagnostic) {
    throw new Error(`Pair ${mode} Driver requires exact repair evidence.`);
  }
  const repairMode = mode as Extract<PairDriverMode, `repair_${string}`>;
  const allowedStages: Record<
    Extract<PairDriverMode, `repair_${string}`>,
    string[]
  > = {
    repair_test: ['red'],
    repair_implementation: ['green', 'quality_gate', 'human_review'],
    repair_refactor: ['refactor'],
    repair_quality_gate: ['quality_gate'],
  };
  if (!allowedStages[repairMode].includes(diagnostic.stage)) {
    throw new Error(
      `Pair ${mode} Driver cannot receive ${diagnostic.stage} evidence.`,
    );
  }
}

function paths(value: unknown, label: string): string[] {
  return stringArray(value, label, 0, 100).map((entry) => {
    const normalized = entry.replace(/\\/g, '/').replace(/^\.\//, '');
    if (!RELATIVE_PATH.test(normalized)) {
      throw new Error(`${label} contains a non-relative path.`);
    }
    return normalized;
  });
}

function stringArray(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): string[] {
  if (
    !Array.isArray(value) ||
    value.length < minimum ||
    value.length > maximum
  ) {
    throw new Error(`${label} is invalid.`);
  }
  const result = value.map((entry) => text(entry, label, 2_000));
  if (new Set(result).size !== result.length) {
    throw new Error(`${label} must be unique.`);
  }
  return result;
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function identifier(value: unknown, label: string): string {
  const normalized = text(value, label, 500);
  if (!ID.test(normalized)) throw new Error(`${label} is invalid.`);
  return normalized;
}

function text(value: unknown, label: string, maximum: number): string {
  if (typeof value !== 'string') throw new Error(`${label} is invalid.`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) {
    throw new Error(`${label} is invalid.`);
  }
  return normalized;
}

function optionalText(
  value: unknown,
  label: string,
  maximum: number,
): string | null {
  return value === null || value === undefined || value === ''
    ? null
    : text(value, label, maximum);
}

function boundedOutput(value: unknown, label: string): string {
  if (typeof value !== 'string' || Buffer.byteLength(value) > 50 * 1024) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

function oneOf<const T extends readonly string[]>(
  value: unknown,
  label: string,
  options: T,
): T[number] {
  if (typeof value === 'string' && options.includes(value)) {
    return value;
  }
  throw new Error(`${label} is invalid.`);
}

function literal<const T extends string>(
  value: unknown,
  expected: T,
  label: string,
): T {
  if (value !== expected) throw new Error(`${label} is invalid.`);
  return expected;
}

function boundedInteger(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): number {
  if (
    !Number.isSafeInteger(value) ||
    Number(value) < minimum ||
    Number(value) > maximum
  ) {
    throw new Error(`${label} is invalid.`);
  }
  return Number(value);
}

function sha256(value: unknown, label: string): string {
  const normalized =
    typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!SHA256.test(normalized)) throw new Error(`${label} is invalid.`);
  return normalized;
}

function gitSha(value: unknown, label: string): string {
  const normalized =
    typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(normalized)) {
    throw new Error(`${label} is invalid.`);
  }
  return normalized;
}

function absolutePath(value: unknown): string {
  if (typeof value !== 'string' || !isAbsolute(value)) {
    throw new Error('Pair worktree root must be absolute.');
  }
  return value;
}
