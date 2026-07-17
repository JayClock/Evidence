import { afterEach, describe, expect, it } from 'vitest';
import {
  finishActivityTrace,
  startActivityTrace,
} from '../../capabilities/activity-observability/trace';
import { DEFAULT_STATE } from '../../iteration/default-state';
import { writeState } from '../../iteration/state-repository';
import { cleanupWorkspaces, workspace } from '../../test-support/support';
import { statusMarkdown } from './status';

afterEach(cleanupWorkspaces);

describe('status', () => {
  it('reports native loop state without phase or gate controls', () => {
    const cwd = workspace();
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
        question: 'Who confirms the model?',
        target: 'history',
        asked_at: '2026-01-01T00:01:00.000Z',
      },
    });

    const status = statusMarkdown(cwd);

    expect(status).toContain('| Loop | understand |');
    expect(status).toContain('Q-001 · Who confirms the model?');
    expect(status).toContain('## 下一步');
    expect(status).toContain('直接回答 Q-001');
    expect(status).not.toContain('| Schema |');
    expect(status).not.toContain('| Phase |');
    expect(status).not.toContain('| Pending Gate |');
  });

  it('shows compact iteration Q/T/C without treating missing cost as zero', () => {
    const cwd = workspace();
    writeState(cwd, {
      ...DEFAULT_STATE,
      loop: 'understand',
      understand_stage: 'tqa',
      active_clarification_story: {
        story_id: 'US-001',
        selected_at: '2026-01-01T00:00:00.000Z',
      },
    });
    const span = startActivityTrace(cwd, {
      iterationId: 'ITER-0001',
      activity: 'understand',
      checkpoint: 'tqa',
      storyId: 'US-001',
      agent: 'requirements-analyst',
      requestedModel: 'provider/model',
      thinking: 'medium',
      sessionMode: 'persistent',
      task: 'Ask one TQA question.',
      toolNames: ['read'],
      startedAt: '2026-01-01T00:00:00.000Z',
    });
    finishActivityTrace(span, {
      status: 'completed',
      actualModel: 'provider/model',
      completedAt: '2026-01-01T00:00:02.000Z',
      durationMs: 2_000,
      exitCode: 0,
      stopReason: 'stop',
      usage: {
        turns: 1,
        input_tokens: 1_200,
        output_tokens: 100,
        cache_read_tokens: 900,
        cache_write_tokens: 0,
        cost_usd: null,
        context_tokens_at_end: 1_300,
      },
      toolCallCounts: { read: 1 },
    });

    const status = statusMarkdown(cwd);
    expect(status).toContain(
      '| Activity Trace | artifacts/iterations/ITER-0001/activity-trace.jsonl |',
    );
    expect(status).toContain(
      '1/1 finished · 1 turns · ↑1.2k ↓100 R900 W0 · cost:n/a · cost:n/a=1 · 2.0s',
    );
    expect(status).toContain('requirements-analyst · 1/1 finished');
    expect(status).not.toContain('$0.0000');
  });

  it('reports an idle repository without inventing an iteration', () => {
    const cwd = workspace();

    const status = statusMarkdown(cwd);

    expect(status).toContain('| Iteration | none |');
    expect(status).toContain('| Loop | idle |');
    expect(status).toContain('| Allowed Actions | /evidence-new |');
    expect(status).toContain('运行 /evidence-new');
  });
});
