import { afterEach, describe, expect, it } from 'vitest';
import { zeroActivityUsage } from './activity-usage';
import { finishActivityTrace, startActivityTrace } from './trace';
import {
  emptyIterationActivitySummary,
  iterationActivitySummary,
} from './summary';
import { cleanupWorkspaces, workspace } from '../../test-support/support';

afterEach(cleanupWorkspaces);

function start(cwd: string, agent: string, model = 'provider/model') {
  return startActivityTrace(cwd, {
    iterationId: 'ITER-0001',
    activity: 'pair',
    agent,
    requestedModel: model,
    thinking: model === 'deterministic' ? 'off' : 'medium',
    sessionMode: model === 'deterministic' ? 'deterministic' : 'ephemeral',
    task: `Run ${agent}.`,
    toolNames: model === 'deterministic' ? [] : ['read'],
    startedAt: '2026-01-01T00:00:00.000Z',
  });
}

describe('iteration activity summary', () => {
  it('aggregates finish facts, missing cost, incomplete spans, and agent totals', () => {
    const cwd = workspace();
    finishActivityTrace(start(cwd, 'driver'), {
      status: 'completed',
      actualModel: 'provider/model',
      completedAt: '2026-01-01T00:00:01.000Z',
      durationMs: 1_000,
      exitCode: 0,
      stopReason: 'stop',
      usage: {
        turns: 2,
        input_tokens: 1_000,
        output_tokens: 100,
        cache_read_tokens: 800,
        cache_write_tokens: 20,
        cost_usd: 0.1,
        context_tokens_at_end: 1_120,
      },
      toolCallCounts: { read: 1 },
    });
    finishActivityTrace(start(cwd, 'pair-controller', 'deterministic'), {
      status: 'completed',
      actualModel: 'deterministic',
      completedAt: '2026-01-01T00:00:00.500Z',
      durationMs: 500,
      exitCode: 0,
      stopReason: 'stop',
      usage: zeroActivityUsage(),
      toolCallCounts: {},
      executionRecordSequences: [1],
    });
    finishActivityTrace(start(cwd, 'driver'), {
      status: 'failed',
      actualModel: 'provider/model',
      completedAt: '2026-01-01T00:00:02.000Z',
      durationMs: 2_000,
      exitCode: 1,
      stopReason: 'error',
      usage: {
        turns: 1,
        input_tokens: 500,
        output_tokens: 50,
        cache_read_tokens: 400,
        cache_write_tokens: 0,
        cost_usd: null,
        context_tokens_at_end: 1_300,
      },
      toolCallCounts: {},
    });
    finishActivityTrace(start(cwd, 'reviewer'), {
      status: 'aborted',
      actualModel: 'provider/model',
      completedAt: '2026-01-01T00:00:00.250Z',
      durationMs: 250,
      exitCode: 1,
      stopReason: 'aborted',
      usage: zeroActivityUsage(null),
      toolCallCounts: {},
    });
    finishActivityTrace(start(cwd, 'reviewer'), {
      status: 'timeout',
      actualModel: 'provider/model',
      completedAt: '2026-01-01T00:00:03.000Z',
      durationMs: 3_000,
      exitCode: 1,
      stopReason: 'timeout',
      usage: zeroActivityUsage(null),
      toolCallCounts: {},
    });
    const incomplete = start(cwd, 'stalled-agent');

    const summary = iterationActivitySummary(cwd, 'ITER-0001');
    expect(summary).toMatchObject({
      activities_started: 6,
      activities_finished: 5,
      incomplete_spans: [incomplete.spanId],
      failed: 1,
      aborted: 1,
      timed_out: 1,
      duration_ms: 6_750,
      turns: 3,
      input_tokens: 1_500,
      output_tokens: 150,
      cache_read_tokens: 1_200,
      cache_write_tokens: 20,
      reported_cost_usd: 0.1,
      unreported_cost_activities: 3,
      peak_context_tokens: 1_300,
    });
    expect(summary.by_agent.driver).toMatchObject({
      activities_started: 2,
      activities_finished: 2,
      failed: 1,
      turns: 3,
      reported_cost_usd: 0.1,
      unreported_cost_activities: 1,
      peak_context_tokens: 1_300,
    });
    expect(summary.by_agent['stalled-agent']).toMatchObject({
      activities_started: 1,
      activities_finished: 0,
    });
  });

  it('returns an explicit zero summary before the first trace event', () => {
    const cwd = workspace();
    expect(iterationActivitySummary(cwd, 'ITER-0001')).toEqual(
      emptyIterationActivitySummary(),
    );
  });
});
