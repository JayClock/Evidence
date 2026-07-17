import {
  activityTracePath,
  incompleteActivitySpanIds,
  readActivityTrace,
  type ActivityTraceEvent,
} from './trace';

export interface ActivityAggregate {
  activities_started: number;
  activities_finished: number;
  failed: number;
  aborted: number;
  timed_out: number;
  duration_ms: number;
  turns: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  reported_cost_usd: number;
  unreported_cost_activities: number;
  peak_context_tokens: number | null;
}

export interface IterationActivitySummary extends ActivityAggregate {
  incomplete_spans: string[];
  by_agent: Record<string, ActivityAggregate>;
}

function emptyAggregate(): ActivityAggregate {
  return {
    activities_started: 0,
    activities_finished: 0,
    failed: 0,
    aborted: 0,
    timed_out: 0,
    duration_ms: 0,
    turns: 0,
    input_tokens: 0,
    output_tokens: 0,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    reported_cost_usd: 0,
    unreported_cost_activities: 0,
    peak_context_tokens: null,
  };
}

export function emptyIterationActivitySummary(): IterationActivitySummary {
  return {
    ...emptyAggregate(),
    incomplete_spans: [],
    by_agent: {},
  };
}

function agentAggregate(
  summary: IterationActivitySummary,
  agent: string,
): ActivityAggregate {
  return (summary.by_agent[agent] ??= emptyAggregate());
}

function incrementStarted(aggregate: ActivityAggregate): void {
  aggregate.activities_started += 1;
}

function incrementFinished(
  aggregate: ActivityAggregate,
  event: ActivityTraceEvent,
): void {
  const usage = event.usage;
  if (!usage || event.duration_ms === undefined) {
    throw new Error(
      `Activity trace finish ${event.span_id} has no aggregate usage.`,
    );
  }
  aggregate.activities_finished += 1;
  if (event.status === 'failed') aggregate.failed += 1;
  if (event.status === 'aborted') aggregate.aborted += 1;
  if (event.status === 'timeout') aggregate.timed_out += 1;
  aggregate.duration_ms += event.duration_ms;
  aggregate.turns += usage.turns;
  aggregate.input_tokens += usage.input_tokens;
  aggregate.output_tokens += usage.output_tokens;
  aggregate.cache_read_tokens += usage.cache_read_tokens;
  aggregate.cache_write_tokens += usage.cache_write_tokens;
  if (usage.cost_usd === null) aggregate.unreported_cost_activities += 1;
  else aggregate.reported_cost_usd += usage.cost_usd;
  if (usage.context_tokens_at_end !== null) {
    aggregate.peak_context_tokens = Math.max(
      aggregate.peak_context_tokens ?? 0,
      usage.context_tokens_at_end,
    );
  }
}

/** Deterministically aggregate validated finish events; incomplete starts stay explicit. */
export function summarizeActivityTrace(
  records: readonly ActivityTraceEvent[],
): IterationActivitySummary {
  const summary = emptyIterationActivitySummary();
  summary.incomplete_spans = incompleteActivitySpanIds(records);
  for (const event of records) {
    const byAgent = agentAggregate(summary, event.agent);
    if (event.event === 'activity_started') {
      incrementStarted(summary);
      incrementStarted(byAgent);
      continue;
    }
    incrementFinished(summary, event);
    incrementFinished(byAgent, event);
  }
  return summary;
}

export function iterationActivitySummary(
  cwd: string,
  iterationId: string,
): IterationActivitySummary {
  const path = activityTracePath(cwd, iterationId);
  return summarizeActivityTrace(readActivityTrace(path, iterationId));
}
