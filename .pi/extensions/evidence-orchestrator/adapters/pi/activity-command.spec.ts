import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_STATE } from '../../iteration/default-state';
import { writeState } from '../../iteration/state-repository';
import { cleanupWorkspaces, workspace } from '../../test-support/support';
import {
  MAX_MODEL_VISIBLE_ACTIVITY_BYTES,
  type ActivityResultEntryData,
} from './activity/activity-agent-renderer';
import type { ActivityExecutionDetails } from './activity/execution';
import { publishActivityCommandResult } from './activity-command';

function details(
  overrides: Partial<ActivityExecutionDetails> = {},
): ActivityExecutionDetails {
  return {
    activity: 'kickoff',
    task: '# Evidence Activity Context Capsule v1',
    status: 'completed',
    agent: 'requirements-analyst',
    model: 'provider/model',
    requestedModel: 'provider/model',
    actualModel: 'provider/model',
    thinking: 'high',
    sessionMode: 'ephemeral',
    toolNames: ['read'],
    output: 'Kickoff candidate recorded.\n\nNext: /evidence-kickoff.',
    messages: [
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'child transcript' }],
      } as never,
    ],
    exitCode: 0,
    stderr: '',
    usage: {
      turns: 1,
      input_tokens: 1_000,
      output_tokens: 100,
      cache_read_tokens: 800,
      cache_write_tokens: 0,
      cost_usd: 0.01,
      context_tokens_at_end: 1_100,
    },
    stopReason: 'stop',
    startedAt: '2026-01-01T00:00:00.000Z',
    completedAt: '2026-01-01T00:00:01.000Z',
    durationMs: 1_000,
    toolCallCounts: { read: 1 },
    ...overrides,
  };
}

function extension() {
  return {
    appendEntry: vi.fn(),
    sendMessage: vi.fn(),
  };
}

afterEach(cleanupWorkspaces);

describe('activity command publication', () => {
  it('publishes an ordinary successful activity as a bounded TUI-only entry', () => {
    const cwd = workspace();
    writeState(cwd, DEFAULT_STATE);
    const pi = extension();

    expect(publishActivityCommandResult(pi as never, cwd, details())).toBe(
      'entry',
    );

    expect(pi.sendMessage).not.toHaveBeenCalled();
    expect(pi.appendEntry).toHaveBeenCalledOnce();
    expect(pi.appendEntry.mock.calls[0][0]).toBe(
      'evidence-orchestrator-activity-result-entry',
    );
    const data = pi.appendEntry.mock.calls[0][1] as ActivityResultEntryData;
    expect(data).toEqual(
      expect.objectContaining({
        activity: 'kickoff',
        status: 'completed',
        child_event_count: 1,
      }),
    );
    expect(data.references).toContain(
      'artifacts/iterations/ITER-0001/activity-trace.jsonl',
    );
    expect(data).not.toHaveProperty('messages');
    expect(data).not.toHaveProperty('task');
  });

  it('publishes an all-green Pair summary and HTML explanation as entries', () => {
    const cwd = workspace();
    writeState(cwd, DEFAULT_STATE);
    const pi = extension();

    publishActivityCommandResult(
      pi as never,
      cwd,
      details({
        activity: 'pair',
        agent: 'pair-automation',
        output:
          'All quality gates passed. Human approval: /evidence-pair approve <reason>.',
      }),
    );
    publishActivityCommandResult(
      pi as never,
      cwd,
      details({
        activity: 'pair',
        agent: 'change-explainer',
        output: 'HTML explanation generated.',
      }),
      ['/tmp/US-001-explanation.html'],
    );

    expect(pi.sendMessage).not.toHaveBeenCalled();
    expect(pi.appendEntry).toHaveBeenCalledTimes(2);
    expect(
      (pi.appendEntry.mock.calls[0][1] as ActivityResultEntryData)
        .output_summary,
    ).toContain('/evidence-pair approve');
    expect(
      (pi.appendEntry.mock.calls[1][1] as ActivityResultEntryData).references,
    ).toContain('/tmp/US-001-explanation.html');
  });

  it('keeps one complete pending TQA question model-visible and directly answerable', () => {
    const cwd = workspace();
    const question = 'Which role confirms version v3?';
    writeState(cwd, {
      ...DEFAULT_STATE,
      loop: 'understand',
      understand_stage: 'tqa',
      active_clarification_story: {
        story_id: 'US-001',
        selected_at: '2026-01-01T00:00:00.000Z',
      },
      pending_clarification: {
        question_id: 'Q-001',
        story_id: 'US-001',
        question,
        target: 'history',
        asked_at: '2026-01-01T00:01:00.000Z',
      },
    });
    const pi = extension();

    expect(
      publishActivityCommandResult(
        pi as never,
        cwd,
        details({ activity: 'understand' }),
      ),
    ).toBe('tqa-message');

    expect(pi.appendEntry).not.toHaveBeenCalled();
    const message = pi.sendMessage.mock.calls[0][0] as {
      content: string;
      details: ActivityExecutionDetails;
    };
    expect(message.content).toContain(`Q-001 · US-001\n\n${question}`);
    expect(message.content).toContain('请直接回复此问题');
    expect(Buffer.byteLength(message.content, 'utf8')).toBeLessThanOrEqual(
      MAX_MODEL_VISIBLE_ACTIVITY_BYTES,
    );
    expect(message.details.messages).toHaveLength(1);
  });

  it('bounds an exceptional failure message while retaining local child details', () => {
    const cwd = workspace();
    writeState(cwd, DEFAULT_STATE);
    const pi = extension();
    const failed = details({
      status: 'failed',
      exitCode: 1,
      stopReason: 'error',
      output: `Driver failed.\n${'diagnostic '.repeat(1_000)}`,
      stderr: 'full local stderr',
    });

    expect(publishActivityCommandResult(pi as never, cwd, failed)).toBe(
      'failure-message',
    );

    expect(pi.appendEntry).not.toHaveBeenCalled();
    const message = pi.sendMessage.mock.calls[0][0] as {
      content: string;
      details: ActivityExecutionDetails;
    };
    expect(Buffer.byteLength(message.content, 'utf8')).toBeLessThanOrEqual(
      MAX_MODEL_VISIBLE_ACTIVITY_BYTES,
    );
    expect(message.content).toContain('requires human exception routing');
    expect(message.content).toContain('activity-trace.jsonl');
    expect(message.details.stderr).toBe('full local stderr');
  });
});
