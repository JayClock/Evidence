import { createHash } from 'node:crypto';
import {
  activityTracePath,
  incompleteActivitySpanIds,
  readActivityTrace,
} from '../activity-observability/trace';
import type { TestExecutionRecord } from '../execution-evidence/observation-log';
import type {
  ExecutionBudgetEnvelope,
  ExecutionBudgetUsage,
  PairDriverMode,
  PairProgressMarker,
  WorkflowState,
} from '../../iteration/state';

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function commandFailureFingerprint(input: {
  record: Pick<
    TestExecutionRecord,
    | 'stage'
    | 'command'
    | 'exit_code'
    | 'termination'
    | 'stdout_sha256'
    | 'stderr_sha256'
  >;
  failureKind: string;
  currentTest: string;
  changedDiffSha256: string;
}): string {
  return digest(
    JSON.stringify({
      stage: input.record.stage,
      command: input.record.command,
      exit_or_termination: input.record.termination,
      exit_code: input.record.exit_code,
      stdout_sha256: input.record.stdout_sha256,
      stderr_sha256: input.record.stderr_sha256,
      failure_kind: input.failureKind,
      current_test: input.currentTest,
      changed_diff_sha256: input.changedDiffSha256,
    }),
  );
}

export function driverFailureFingerprint(input: {
  mode: PairDriverMode | 'red-reviewer';
  taskId: string;
  testId: string;
  blockedReason: string;
  changedPaths: string[];
  output: string;
}): string {
  return digest(
    JSON.stringify({
      mode: input.mode,
      task: input.taskId,
      test: input.testId,
      blocked_reason: input.blockedReason,
      changed_paths: [...new Set(input.changedPaths)].sort(),
      output_sha256: digest(input.output),
    }),
  );
}

const CHECKPOINT_RANK: Record<
  NonNullable<WorkflowState['pair_session']>['checkpoint'],
  number
> = {
  plan_confirmed: 0,
  test_written: 1,
  red_observed: 2,
  implementation_written: 4,
  green_observed: 5,
  refactored: 6,
  quality_gate_failed: 6,
  quality_gates_passed: 7,
};

export function pairProgressMarker(state: WorkflowState): PairProgressMarker {
  const session = state.pair_session;
  const candidate = state.tasking_candidate;
  if (!session || !candidate) {
    throw new Error('Pair progress requires an approved Pair session.');
  }
  const orderedTestIds = candidate.tasks.flatMap(({ test_ids }) => test_ids);
  const currentWorkUnitIndex = orderedTestIds.indexOf(session.test_id);
  if (currentWorkUnitIndex < 0) {
    throw new Error(`Pair progress cannot locate ${session.test_id}.`);
  }
  const acceptedBehavior =
    session.checkpoint === 'red_observed' &&
    session.red_observation?.accepted === true;
  return {
    completed_test_count: session.completed_test_ids.length,
    completed_step_count: session.completed_step_ids.length,
    quality_gate_index: session.quality_gate_index,
    current_work_unit_index: currentWorkUnitIndex,
    checkpoint_rank:
      CHECKPOINT_RANK[session.checkpoint] + (acceptedBehavior ? 1 : 0),
  };
}

/** Compare irreversible milestones first; rank may reset when the TEST index advances. */
export function pairProgressAdvanced(
  previous: PairProgressMarker,
  current: PairProgressMarker,
): boolean {
  for (const field of [
    'completed_test_count',
    'completed_step_count',
    'quality_gate_index',
    'current_work_unit_index',
    'checkpoint_rank',
  ] as const) {
    if (current[field] > previous[field]) return true;
    if (current[field] < previous[field]) return false;
  }
  return false;
}

export class ExecutionBudgetObservabilityGapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExecutionBudgetObservabilityGapError';
  }
}

const PAIR_AGENT_NAMES = new Set([
  'test-driver',
  'production-driver',
  'red-reviewer',
]);

/** Read cumulative usage from the validated trace without storing token mirrors in state. */
export function executionBudgetUsageFromTrace(
  cwd: string,
  state: Pick<WorkflowState, 'iteration_id'>,
  options: {
    now?: string;
    allowedIncompleteSpanIds?: string[];
  } = {},
): ExecutionBudgetUsage {
  const records = readActivityTrace(
    activityTracePath(cwd, state.iteration_id),
    state.iteration_id,
  );
  const allowed = new Set(options.allowedIncompleteSpanIds ?? []);
  const incomplete = incompleteActivitySpanIds(records);
  const unexpected = incomplete.filter((spanId) => !allowed.has(spanId));
  const missing = [...allowed].filter((spanId) => !incomplete.includes(spanId));
  if (unexpected.length > 0 || missing.length > 0) {
    throw new ExecutionBudgetObservabilityGapError(
      `Budget trace has unexpected incomplete spans=${unexpected.join(',') || 'none'} and missing allowed spans=${missing.join(',') || 'none'}.`,
    );
  }

  const nowMs = Date.parse(options.now ?? new Date().toISOString());
  if (!Number.isFinite(nowMs)) {
    throw new ExecutionBudgetObservabilityGapError(
      'Budget evaluation requires a valid current timestamp.',
    );
  }
  const finishes = new Map(
    records
      .filter(({ event }) => event === 'activity_finished')
      .map((event) => [event.span_id, event]),
  );
  let durationMs = 0;
  for (const started of records.filter(
    ({ event, parent_span_id }) =>
      event === 'activity_started' && parent_span_id === undefined,
  )) {
    const finished = finishes.get(started.span_id);
    if (finished) durationMs += finished.duration_ms ?? 0;
    else {
      durationMs += Math.max(0, nowMs - Date.parse(started.started_at));
    }
  }

  let inputTokens = 0;
  let outputTokens = 0;
  let reportedCostUsd = 0;
  let costUnknown = false;
  for (const finished of finishes.values()) {
    const usage = finished.usage;
    if (!usage) {
      throw new ExecutionBudgetObservabilityGapError(
        `Budget trace finish ${finished.span_id} has no usage.`,
      );
    }
    inputTokens += usage.input_tokens;
    outputTokens += usage.output_tokens;
    const modelActivity =
      finished.session_mode !== 'deterministic' &&
      finished.requested_model !== 'deterministic' &&
      finished.requested_model !== 'mixed';
    if (modelActivity && usage.cost_usd === null) costUnknown = true;
    else if (usage.cost_usd !== null) reportedCostUsd += usage.cost_usd;
  }

  const starts = records.filter(({ event }) => event === 'activity_started');
  return {
    duration_ms: durationMs,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    reported_cost_usd: costUnknown ? null : reportedCostUsd,
    cost_status: costUnknown ? 'unknown' : 'reported',
    pair_agent_calls: starts.filter(
      ({ activity, agent }) =>
        activity === 'pair' && PAIR_AGENT_NAMES.has(agent),
    ).length,
    pair_checkpoints: starts.filter(
      ({ activity, agent, parent_span_id }) =>
        activity === 'pair' &&
        agent !== 'pair-automation' &&
        parent_span_id !== undefined,
    ).length,
  };
}

export type ExecutionBudgetMetric =
  | 'duration_ms'
  | 'input_tokens'
  | 'output_tokens'
  | 'reported_cost_usd'
  | 'pair_agent_calls'
  | 'pair_checkpoints';

export interface ExecutionBudgetTrigger {
  metric: ExecutionBudgetMetric;
  actual: number;
  limit: number;
  soft_limit: number;
}

export interface ExecutionBudgetEvaluation {
  level: 'ok' | 'soft' | 'hard';
  usage: ExecutionBudgetUsage;
  hard: ExecutionBudgetTrigger[];
  soft: ExecutionBudgetTrigger[];
  shadow_metrics: ExecutionBudgetMetric[];
  cost_status: 'reported' | 'unknown';
}

export function evaluateExecutionBudget(
  envelope: ExecutionBudgetEnvelope,
  usage: ExecutionBudgetUsage,
  projection: {
    pairAgentCalls?: number;
    pairCheckpoints?: number;
  } = {},
): ExecutionBudgetEvaluation {
  const actual: Record<ExecutionBudgetMetric, number | null> = {
    duration_ms: usage.duration_ms,
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    reported_cost_usd: usage.reported_cost_usd,
    pair_agent_calls: usage.pair_agent_calls + (projection.pairAgentCalls ?? 0),
    pair_checkpoints:
      usage.pair_checkpoints + (projection.pairCheckpoints ?? 0),
  };
  const limits: Record<ExecutionBudgetMetric, number | null> = {
    duration_ms: envelope.max_duration_ms,
    input_tokens: envelope.max_input_tokens,
    output_tokens: envelope.max_output_tokens,
    reported_cost_usd: envelope.max_reported_cost_usd,
    pair_agent_calls: envelope.max_pair_agent_calls,
    pair_checkpoints: envelope.emergency_max_checkpoints,
  };
  const hard: ExecutionBudgetTrigger[] = [];
  const soft: ExecutionBudgetTrigger[] = [];
  const shadowMetrics: ExecutionBudgetMetric[] = [];
  for (const metric of Object.keys(limits) as ExecutionBudgetMetric[]) {
    const limit = limits[metric];
    const value = actual[metric];
    if (limit === null) {
      shadowMetrics.push(metric);
      continue;
    }
    if (value === null) continue;
    const trigger = {
      metric,
      actual: value,
      limit,
      soft_limit: limit * envelope.soft_ratio,
    };
    if (value > limit) hard.push(trigger);
    else if (value >= trigger.soft_limit) soft.push(trigger);
  }
  return {
    level: hard.length > 0 ? 'hard' : soft.length > 0 ? 'soft' : 'ok',
    usage,
    hard,
    soft,
    shadow_metrics: shadowMetrics,
    cost_status: usage.cost_status,
  };
}
