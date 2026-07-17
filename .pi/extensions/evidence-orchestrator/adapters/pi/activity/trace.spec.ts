import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  activityTracePath,
  readActivityTrace,
  validateActivityTrace,
} from '../../../capabilities/activity-observability/trace';
import { DEFAULT_STATE } from '../../../iteration/default-state';
import { cleanupWorkspaces, workspace } from '../../../test-support/support';
import {
  ActivityAgentAbortedError,
  type ActivityAgentResult,
} from '../../node/activity-agent-process';
import { ActivityObservabilityGapError, withActivityTrace } from './trace';

afterEach(cleanupWorkspaces);

function result(
  overrides: Partial<ActivityAgentResult> = {},
): ActivityAgentResult {
  return {
    agent: 'requirements-analyst',
    model: 'actual/model',
    requestedModel: 'requested/model',
    actualModel: 'actual/model',
    thinking: 'medium',
    sessionMode: 'ephemeral',
    toolNames: ['read'],
    output: 'Candidate prepared.',
    messages: [],
    exitCode: 0,
    stderr: '',
    usage: {
      turns: 1,
      input_tokens: 100,
      output_tokens: 20,
      cache_read_tokens: 80,
      cache_write_tokens: 0,
      cost_usd: null,
      context_tokens_at_end: 120,
    },
    stopReason: 'stop',
    startedAt: '2026-01-01T00:00:00.000Z',
    completedAt: '2026-01-01T00:00:01.000Z',
    durationMs: 1_000,
    toolCallCounts: { read: 1 },
    ...overrides,
  };
}

function descriptor() {
  return {
    state: {
      ...DEFAULT_STATE,
      active_clarification_story: {
        story_id: 'US-001',
        selected_at: '2026-01-01T00:00:00.000Z',
      },
    },
    activity: 'kickoff' as const,
    task: 'Prepare the frozen Story candidate.',
    agent: 'requirements-analyst',
    requestedModel: 'requested/model',
    thinking: 'medium' as const,
    sessionMode: 'ephemeral' as const,
    toolNames: ['read'],
  };
}

describe('activity trace adapter', () => {
  it('finishes a successful agent activity with actual model and unreported cost', async () => {
    const cwd = workspace();
    const times = ['2026-01-01T00:00:00.000Z', '2026-01-01T00:00:01.000Z'];

    await expect(
      withActivityTrace(cwd, descriptor(), async () => result(), {
        now: () => times.shift() ?? '2026-01-01T00:00:01.000Z',
        resultingState: () => ({
          ...descriptor().state,
          kickoff_candidate: {} as never,
        }),
      }),
    ).resolves.toMatchObject({ output: 'Candidate prepared.' });

    const records = validateActivityTrace(
      activityTracePath(cwd, 'ITER-0001'),
      'ITER-0001',
    );
    expect(records.at(-1)).toMatchObject({
      story_id: 'US-001',
      model: 'actual/model',
      requested_model: 'requested/model',
      status: 'completed',
      resulting_checkpoint: 'candidate_ready',
      usage: { cost_usd: null },
    });
  });

  it('distinguishes caller abort from timeout and ordinary failure', async () => {
    const cwd = workspace();
    const controller = new AbortController();
    controller.abort();

    await expect(
      withActivityTrace(
        cwd,
        descriptor(),
        async () => {
          throw new ActivityAgentAbortedError(
            result({
              stopReason: 'aborted',
              errorMessage: 'Activity agent was aborted.',
              usage: {
                ...result().usage,
                turns: 2,
                input_tokens: 180,
              },
            }),
          );
        },
        { signal: controller.signal },
      ),
    ).rejects.toThrow('Activity agent was aborted');

    expect(
      readActivityTrace(activityTracePath(cwd, 'ITER-0001')).at(-1),
    ).toMatchObject({
      status: 'aborted',
      stop_reason: 'aborted',
      usage: expect.objectContaining({
        turns: 2,
        input_tokens: 180,
        cost_usd: null,
      }),
    });

    await expect(
      withActivityTrace(cwd, descriptor(), async () => {
        throw new Error('Activity timed out at the controller deadline.');
      }),
    ).rejects.toThrow('timed out');
    expect(
      readActivityTrace(activityTracePath(cwd, 'ITER-0001')).at(-1),
    ).toMatchObject({ status: 'timeout', stop_reason: 'timeout' });
  });

  it('does not launch an activity when the started append cannot validate the chain', async () => {
    const cwd = workspace();
    const operation = vi.fn(async () => result());
    const path = activityTracePath(cwd, 'ITER-0001');
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, '{not-json}\n');

    await expect(
      withActivityTrace(cwd, descriptor(), operation),
    ).rejects.toThrow('not valid append-only JSONL');
    expect(operation).not.toHaveBeenCalled();
  });

  it('preserves the activity error when finishing the span exposes an observability gap', async () => {
    const cwd = workspace();
    const path = activityTracePath(cwd, 'ITER-0001');
    let caught: unknown;
    try {
      await withActivityTrace(cwd, descriptor(), async () => {
        appendFileSync(path, '{corrupt}\n');
        throw new Error('original activity failure');
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ActivityObservabilityGapError);
    expect(caught).toMatchObject({
      message: expect.stringContaining('original activity failure'),
      cause: expect.objectContaining({ message: 'original activity failure' }),
      traceError: expect.anything(),
    });
  });
});
