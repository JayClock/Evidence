import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';
import type { ExecutionBudgetEnvelope } from '../../iteration/state';

export type { ExecutionBudgetEnvelope } from '../../iteration/state';

export const EXECUTION_BUDGET_POLICY_PATH =
  'engineering/evidence-orchestrator/execution-budget.json';

const MAX_TIMEOUT_MS = 24 * 60 * 60 * 1000;
const MAX_PAIR_CHECKPOINTS = 10_000;
const MAX_FAILURE_RETRIES = 100;
const MAX_EXTRA_AGENT_CALL_RATIO = 10;
const MAX_TOKEN_BUDGET = 1_000_000_000;
const MAX_REPORTED_COST_USD = 1_000_000;

export interface ExecutionBudgetPolicy {
  version: 1;
  activity: {
    timeout_ms: number;
  };
  command: {
    timeout_ms: number;
  };
  pair: {
    emergency_max_checkpoints: number;
    max_retries_per_failure_fingerprint: number;
    max_no_progress_checkpoints: number | null;
    extra_agent_call_ratio: number | null;
  };
  iteration: {
    soft_ratio: number;
    max_duration_ms: number | null;
    max_input_tokens: number | null;
    max_output_tokens: number | null;
    max_reported_cost_usd: number | null;
  };
}

export interface ExecutionBudgetPolicySnapshot {
  path: string;
  sha256: string;
  policy: ExecutionBudgetPolicy;
}

function digest(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function object(value: unknown, subject: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${subject} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function exactFields(
  value: Record<string, unknown>,
  expected: readonly string[],
  subject: string,
): void {
  const actual = Object.keys(value).sort();
  const fields = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(fields)) {
    throw new Error(`${subject} fields must be exactly: ${fields.join(', ')}.`);
  }
}

function integer(
  value: unknown,
  subject: string,
  options: { min: number; max: number; nullable?: boolean },
): number | null {
  if (value === null && options.nullable) return null;
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < options.min ||
    (value as number) > options.max
  ) {
    throw new Error(
      `${subject} must be ${options.nullable ? 'null or ' : ''}an integer from ${options.min} to ${options.max}.`,
    );
  }
  return value as number;
}

function finite(
  value: unknown,
  subject: string,
  options: { min: number; max: number; nullable?: boolean },
): number | null {
  if (value === null && options.nullable) return null;
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < options.min ||
    value > options.max
  ) {
    throw new Error(
      `${subject} must be ${options.nullable ? 'null or ' : ''}a finite number from ${options.min} to ${options.max}.`,
    );
  }
  return value;
}

/** Strictly parse the human-owned policy; defaults and unknown fields fail closed. */
export function parseExecutionBudgetPolicy(
  value: unknown,
): ExecutionBudgetPolicy {
  const root = object(value, 'Execution budget policy');
  exactFields(
    root,
    ['version', 'activity', 'command', 'pair', 'iteration'],
    'Execution budget policy',
  );
  if (root.version !== 1) {
    throw new Error('Execution budget policy version must be 1.');
  }

  const activity = object(root.activity, 'activity budget');
  exactFields(activity, ['timeout_ms'], 'activity budget');
  const command = object(root.command, 'command budget');
  exactFields(command, ['timeout_ms'], 'command budget');
  const pair = object(root.pair, 'Pair budget');
  exactFields(
    pair,
    [
      'emergency_max_checkpoints',
      'max_retries_per_failure_fingerprint',
      'max_no_progress_checkpoints',
      'extra_agent_call_ratio',
    ],
    'Pair budget',
  );
  const iteration = object(root.iteration, 'iteration budget');
  exactFields(
    iteration,
    [
      'soft_ratio',
      'max_duration_ms',
      'max_input_tokens',
      'max_output_tokens',
      'max_reported_cost_usd',
    ],
    'iteration budget',
  );

  const softRatio = finite(iteration.soft_ratio, 'iteration.soft_ratio', {
    min: Number.EPSILON,
    max: 1 - Number.EPSILON,
  });
  return {
    version: 1,
    activity: {
      timeout_ms: integer(activity.timeout_ms, 'activity.timeout_ms', {
        min: 1,
        max: MAX_TIMEOUT_MS,
      }) as number,
    },
    command: {
      timeout_ms: integer(command.timeout_ms, 'command.timeout_ms', {
        min: 1,
        max: MAX_TIMEOUT_MS,
      }) as number,
    },
    pair: {
      emergency_max_checkpoints: integer(
        pair.emergency_max_checkpoints,
        'pair.emergency_max_checkpoints',
        { min: 1, max: MAX_PAIR_CHECKPOINTS },
      ) as number,
      max_retries_per_failure_fingerprint: integer(
        pair.max_retries_per_failure_fingerprint,
        'pair.max_retries_per_failure_fingerprint',
        { min: 0, max: MAX_FAILURE_RETRIES },
      ) as number,
      max_no_progress_checkpoints: integer(
        pair.max_no_progress_checkpoints,
        'pair.max_no_progress_checkpoints',
        { min: 1, max: MAX_PAIR_CHECKPOINTS, nullable: true },
      ),
      extra_agent_call_ratio: finite(
        pair.extra_agent_call_ratio,
        'pair.extra_agent_call_ratio',
        { min: 0, max: MAX_EXTRA_AGENT_CALL_RATIO, nullable: true },
      ),
    },
    iteration: {
      soft_ratio: softRatio as number,
      max_duration_ms: integer(
        iteration.max_duration_ms,
        'iteration.max_duration_ms',
        { min: 1, max: MAX_TIMEOUT_MS * 365, nullable: true },
      ),
      max_input_tokens: integer(
        iteration.max_input_tokens,
        'iteration.max_input_tokens',
        { min: 1, max: MAX_TOKEN_BUDGET, nullable: true },
      ),
      max_output_tokens: integer(
        iteration.max_output_tokens,
        'iteration.max_output_tokens',
        { min: 1, max: MAX_TOKEN_BUDGET, nullable: true },
      ),
      max_reported_cost_usd: finite(
        iteration.max_reported_cost_usd,
        'iteration.max_reported_cost_usd',
        { min: Number.EPSILON, max: MAX_REPORTED_COST_USD, nullable: true },
      ),
    },
  };
}

export function readExecutionBudgetPolicy(
  cwd: string,
): ExecutionBudgetPolicySnapshot {
  const absolute = isAbsolute(cwd)
    ? join(cwd, EXECUTION_BUDGET_POLICY_PATH)
    : join(process.cwd(), cwd, EXECUTION_BUDGET_POLICY_PATH);
  if (!existsSync(absolute) || !statSync(absolute).isFile()) {
    throw new Error(`Execution budget policy is missing: ${absolute}.`);
  }
  const content = readFileSync(absolute);
  let parsed: unknown;
  try {
    parsed = JSON.parse(content.toString('utf8')) as unknown;
  } catch {
    throw new Error(`Execution budget policy is not valid JSON: ${absolute}.`);
  }
  return {
    path: relative(cwd, absolute).replaceAll('\\', '/'),
    sha256: digest(content),
    policy: parseExecutionBudgetPolicy(parsed),
  };
}

export function createExecutionBudgetEnvelope(
  snapshot: ExecutionBudgetPolicySnapshot,
  shape: {
    testCount: number;
    selectedProcessStepCount: number;
    approvedAt: string;
  },
): ExecutionBudgetEnvelope {
  if (
    !Number.isSafeInteger(shape.testCount) ||
    shape.testCount < 1 ||
    !Number.isSafeInteger(shape.selectedProcessStepCount) ||
    shape.selectedProcessStepCount < 1 ||
    !Number.isFinite(Date.parse(shape.approvedAt))
  ) {
    throw new Error('Execution budget envelope requires a valid Pair shape.');
  }
  const expectedPairAgentCalls =
    3 * shape.testCount + shape.selectedProcessStepCount;
  const extraRatio = snapshot.policy.pair.extra_agent_call_ratio;
  return {
    version: 1,
    policy_path: snapshot.path,
    policy_sha256: snapshot.sha256,
    activity_timeout_ms: snapshot.policy.activity.timeout_ms,
    command_timeout_ms: snapshot.policy.command.timeout_ms,
    expected_pair_agent_calls: expectedPairAgentCalls,
    max_pair_agent_calls:
      extraRatio === null
        ? null
        : Math.ceil(expectedPairAgentCalls * (1 + extraRatio)),
    emergency_max_checkpoints: snapshot.policy.pair.emergency_max_checkpoints,
    max_retries_per_failure_fingerprint:
      snapshot.policy.pair.max_retries_per_failure_fingerprint,
    max_no_progress_checkpoints:
      snapshot.policy.pair.max_no_progress_checkpoints,
    max_duration_ms: snapshot.policy.iteration.max_duration_ms,
    max_input_tokens: snapshot.policy.iteration.max_input_tokens,
    max_output_tokens: snapshot.policy.iteration.max_output_tokens,
    max_reported_cost_usd: snapshot.policy.iteration.max_reported_cost_usd,
    soft_ratio: snapshot.policy.iteration.soft_ratio,
    approved_at: shape.approvedAt,
  };
}

export function executionBudgetEnvelopeSha256(
  envelope: ExecutionBudgetEnvelope,
): string {
  return digest(JSON.stringify(envelope));
}

export function executionBudgetEnvelopeMode(
  envelope: ExecutionBudgetEnvelope,
): 'shadow' | 'enforced' {
  return [
    envelope.max_pair_agent_calls,
    envelope.max_no_progress_checkpoints,
    envelope.max_duration_ms,
    envelope.max_input_tokens,
    envelope.max_output_tokens,
    envelope.max_reported_cost_usd,
  ].every((value) => value !== null)
    ? 'enforced'
    : 'shadow';
}

/** Formal activation is a human action and rejects every shadow-only hard budget. */
export function assertExecutionBudgetEnvelopeActivated(
  envelope: ExecutionBudgetEnvelope,
): void {
  if (executionBudgetEnvelopeMode(envelope) !== 'enforced') {
    throw new Error(
      'Execution budget envelope is shadow-only; formal activation requires non-null call, no-progress, duration, token, and cost hard budgets.',
    );
  }
}
