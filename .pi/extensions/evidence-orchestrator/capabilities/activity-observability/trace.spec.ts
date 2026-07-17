import { readFileSync, writeFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { zeroActivityUsage } from './activity-usage';
import {
  activityTracePath,
  finishActivityTrace,
  incompleteActivitySpanIds,
  readActivityTrace,
  startActivityTrace,
  validateActivityTrace,
} from './trace';
import { cleanupWorkspaces, workspace } from '../../test-support/support';

afterEach(cleanupWorkspaces);

function start(cwd: string, overrides = {}) {
  return startActivityTrace(cwd, {
    iterationId: 'ITER-0001',
    activity: 'understand',
    checkpoint: 'tqa',
    storyId: 'US-001',
    agent: 'requirements-analyst',
    requestedModel: 'requested/model',
    thinking: 'medium',
    sessionMode: 'persistent',
    task: 'RAW TASK must only be hashed',
    toolNames: ['read', 'evidence_orchestrator_ask_question'],
    startedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  });
}

describe('activity trace', () => {
  it('appends a hash-chained start and finish without raw delegated content', () => {
    const cwd = workspace();
    const span = start(cwd);
    const finished = finishActivityTrace(span, {
      status: 'completed',
      actualModel: 'fallback/model',
      completedAt: '2026-01-01T00:00:02.500Z',
      durationMs: 2_500,
      exitCode: 0,
      stopReason: 'stop',
      output: 'RAW OUTPUT must only be hashed',
      usage: {
        turns: 2,
        input_tokens: 1_200,
        output_tokens: 200,
        cache_read_tokens: 900,
        cache_write_tokens: 0,
        cost_usd: null,
        context_tokens_at_end: 1_400,
      },
      toolCallCounts: { read: 2 },
      resultingCheckpoint: 'scenario_review',
    });

    const records = validateActivityTrace(span.path, 'ITER-0001');
    expect(records).toHaveLength(2);
    expect(records.map(({ sequence }) => sequence)).toEqual([1, 2]);
    expect(records[0]).toMatchObject({
      span_id: 'ACT-000001',
      event: 'activity_started',
      model: 'requested/model',
      actual_model: 'requested/model',
      previous_record_sha256: '0'.repeat(64),
    });
    expect(finished).toMatchObject({
      span_id: 'ACT-000001',
      event: 'activity_finished',
      model: 'fallback/model',
      requested_model: 'requested/model',
      actual_model: 'fallback/model',
      status: 'completed',
      duration_ms: 2_500,
      usage: { cost_usd: null },
      resulting_checkpoint: 'scenario_review',
    });
    expect(finished.previous_record_sha256).toBe(records[0].record_sha256);

    const serialized = readFileSync(span.path, 'utf8');
    expect(serialized).not.toContain('RAW TASK');
    expect(serialized).not.toContain('RAW OUTPUT');
    expect(serialized).not.toContain('stderr');
    expect(serialized).toMatch(/"task_sha256":"[0-9a-f]{64}"/);
    expect(serialized).toMatch(/"output_sha256":"[0-9a-f]{64}"/);
  });

  it('tracks incomplete spans without silently treating them as complete', () => {
    const cwd = workspace();
    const span = start(cwd);
    const records = readActivityTrace(span.path, 'ITER-0001');

    expect(incompleteActivitySpanIds(records)).toEqual(['ACT-000001']);
    expect(() => validateActivityTrace(span.path, 'ITER-0001')).toThrow(
      'incomplete spans: ACT-000001',
    );
  });

  it('keeps Pair parent and child spans ordered and linked', () => {
    const cwd = workspace();
    const parent = start(cwd, {
      activity: 'pair',
      checkpoint: 'plan_confirmed',
      agent: 'pair-automation',
      requestedModel: 'mixed',
      thinking: 'off',
      sessionMode: 'deterministic',
      task: 'Automate the approved Pair plan.',
      toolNames: [],
    });
    const child = start(cwd, {
      parentSpanId: parent.spanId,
      activity: 'pair',
      checkpoint: 'plan_confirmed',
      taskId: 'TASK-001',
      testId: 'TEST-001',
      processId: 'typescript-web',
      stepId: 'component',
      agent: 'test-driver',
      requestedModel: 'driver/model',
      sessionMode: 'ephemeral',
      task: 'Write one test.',
      toolNames: ['read', 'edit'],
    });

    expect(() =>
      finishActivityTrace(parent, {
        status: 'failed',
        actualModel: 'mixed',
        completedAt: '2026-01-01T00:00:01.000Z',
        stopReason: 'error',
        usage: zeroActivityUsage(),
        toolCallCounts: {},
      }),
    ).toThrow('cannot finish before child ACT-000002');

    finishActivityTrace(child, {
      status: 'completed',
      actualModel: 'driver/model',
      completedAt: '2026-01-01T00:00:01.000Z',
      exitCode: 0,
      stopReason: 'stop',
      usage: { ...zeroActivityUsage(null), turns: 1 },
      toolCallCounts: { edit: 1 },
    });
    finishActivityTrace(parent, {
      status: 'completed',
      actualModel: 'mixed',
      completedAt: '2026-01-01T00:00:02.000Z',
      exitCode: 0,
      stopReason: 'stop',
      usage: zeroActivityUsage(),
      toolCallCounts: {},
    });

    const records = validateActivityTrace(parent.path, 'ITER-0001');
    expect(records).toHaveLength(4);
    expect(records[1]).toMatchObject({
      span_id: 'ACT-000002',
      parent_span_id: 'ACT-000001',
    });
  });

  it('records deterministic controller work with known zero usage', () => {
    const cwd = workspace();
    const span = start(cwd, {
      activity: 'pair',
      agent: 'pair-controller',
      requestedModel: 'deterministic',
      thinking: 'off',
      sessionMode: 'deterministic',
      task: 'Run the locked Red command.',
      toolNames: [],
    });
    finishActivityTrace(span, {
      status: 'completed',
      actualModel: 'deterministic',
      completedAt: '2026-01-01T00:00:01.000Z',
      exitCode: 0,
      stopReason: 'stop',
      usage: zeroActivityUsage(),
      toolCallCounts: {},
      executionRecordSequences: [7],
    });

    expect(validateActivityTrace(span.path).at(-1)).toMatchObject({
      model: 'deterministic',
      usage: zeroActivityUsage(),
      execution_record_sequences: [7],
    });
  });

  it('rejects hash-chain tampering and a truncated final event', () => {
    const cwd = workspace();
    const span = start(cwd);
    finishActivityTrace(span, {
      status: 'completed',
      actualModel: 'requested/model',
      completedAt: '2026-01-01T00:00:01.000Z',
      exitCode: 0,
      stopReason: 'stop',
      usage: { ...zeroActivityUsage(null), turns: 1 },
      toolCallCounts: {},
    });
    const original = readFileSync(span.path, 'utf8');
    writeFileSync(span.path, original.replace('"sequence":2', '"sequence":9'));
    expect(() => readActivityTrace(span.path)).toThrow('sequence drifted');

    writeFileSync(span.path, `${original.split('\n')[0]}\n`);
    expect(() => validateActivityTrace(span.path)).toThrow('incomplete spans');

    writeFileSync(span.path, original.trimEnd());
    expect(() => readActivityTrace(span.path)).toThrow('truncated or empty');
    expect(activityTracePath(cwd, 'ITER-0001')).toBe(span.path);
  });

  it('requires aborted and timeout finishes to preserve distinct stop reasons', () => {
    const cwd = workspace();
    const span = start(cwd);
    expect(() =>
      finishActivityTrace(span, {
        status: 'timeout',
        actualModel: 'requested/model',
        completedAt: '2026-01-01T00:00:01.000Z',
        exitCode: 1,
        stopReason: 'aborted',
        usage: zeroActivityUsage(null),
        toolCallCounts: {},
      }),
    ).toThrow('termination reason');
  });
});
