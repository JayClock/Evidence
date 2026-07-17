import { afterEach, describe, expect, it } from 'vitest';
import {
  finishActivityTrace,
  startActivityTrace,
} from '../../capabilities/activity-observability/trace';
import { DEFAULT_STATE } from '../../iteration/default-state';
import { writeState } from '../../iteration/state-repository';
import {
  cleanupWorkspaces,
  workspace,
  write,
} from '../../test-support/support';
import {
  MAX_STATUS_PAGE_SIZE,
  MAX_STATUS_SUMMARY_BYTES,
  projectStatusSummary,
  statusCommandMarkdown,
  statusDetailPage,
  statusMarkdown,
  statusToolResult,
} from './status';

afterEach(cleanupWorkspaces);

describe('status', () => {
  it('projects idle status without scanning or listing repository code files', () => {
    const cwd = workspace();
    write(cwd, 'apps/web/src/large-context-surface.ts');
    write(cwd, 'libs/web/feature/src/also-hidden.tsx');

    const status = statusMarkdown(cwd);

    expect(Buffer.byteLength(status, 'utf8')).toBeLessThanOrEqual(
      MAX_STATUS_SUMMARY_BYTES,
    );
    expect(status).toContain('- Iteration: none');
    expect(status).toContain('- Loop: idle');
    expect(status).toContain('运行 /evidence-new');
    expect(status).not.toContain('apps/web');
    expect(status).not.toContain('libs/web');
    expect(status).not.toContain('Code Files');
  });

  it('keeps one pending TQA question intact in a bounded active projection', () => {
    const cwd = workspace();
    const question = 'Who confirms the model before another editor opens it?';
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
    write(
      cwd,
      'artifacts/iterations/ITER-0001/01-requirements/stories/US-001.md',
    );

    const status = statusMarkdown(cwd);

    expect(Buffer.byteLength(status, 'utf8')).toBeLessThanOrEqual(
      MAX_STATUS_SUMMARY_BYTES,
    );
    expect(status).toContain('- Loop: understand');
    expect(status).toContain(`Q-001 · ${question}`);
    expect(status).toContain('直接回答 Q-001');
    expect(status).toContain('total=1');
    expect(status).not.toContain('## Artifacts');
  });

  it('is a pure projection over already-resolved workflow facts', () => {
    const projection = projectStatusSummary({
      state: {
        ...DEFAULT_STATE,
        loop: 'tasking',
        tasking_stage: 'desk_check',
      },
      nextAction: '/evidence-desk-check',
      artifactCounts: { total: 7, '04-planning': 3 },
    });

    expect(projection).toEqual(
      expect.objectContaining({
        iteration_id: 'ITER-0001',
        loop: 'tasking',
        stage: 'desk_check',
        next_action: '/evidence-desk-check',
        artifact_counts: { total: 7, '04-planning': 3 },
      }),
    );
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
      '- Activity: 1 calls · ↑1.2k · ↓100 · cost:n/a · cost:n/a=1 · 2.0s',
    );
    expect(status).not.toContain('$0.0000');
    expect(status).not.toContain('requirements-analyst ·');
  });

  it('paginates human artifact and code-file details at no more than 50 items', () => {
    const cwd = workspace();
    writeState(cwd, DEFAULT_STATE);
    for (let index = 0; index < 55; index += 1) {
      const suffix = String(index).padStart(2, '0');
      write(
        cwd,
        `artifacts/iterations/ITER-0001/01-requirements/item-${suffix}.md`,
      );
      write(cwd, `apps/web/src/item-${suffix}.ts`);
    }

    const artifacts = statusDetailPage(cwd, 'artifacts');
    const files = statusDetailPage(cwd, 'files');

    expect(artifacts.items).toHaveLength(MAX_STATUS_PAGE_SIZE);
    expect(files.items).toHaveLength(MAX_STATUS_PAGE_SIZE);
    expect(artifacts.total).toBe(55);
    expect(files.total).toBe(55);
    expect(artifacts.next_cursor).toBeTruthy();
    expect(files.next_cursor).toBeTruthy();
    expect(
      statusDetailPage(cwd, 'artifacts', {
        cursor: artifacts.next_cursor,
      }).items,
    ).toHaveLength(5);
    expect(statusCommandMarkdown(cwd, 'files')).toContain(
      'apps/web/src/item-00.ts',
    );
    expect(statusMarkdown(cwd)).not.toContain('apps/web/src/item-00.ts');
  });

  it('rejects malformed, out-of-range, cross-view, and drifted cursors', () => {
    const cwd = workspace();
    writeState(cwd, DEFAULT_STATE);
    for (let index = 0; index < 3; index += 1) {
      write(
        cwd,
        `artifacts/iterations/ITER-0001/01-requirements/item-${index}.md`,
      );
    }
    const first = statusDetailPage(cwd, 'artifacts', { limit: 1 });
    if (!first.next_cursor) throw new Error('Expected a next cursor.');

    expect(() =>
      statusDetailPage(cwd, 'artifacts', { cursor: 'not-a-cursor' }),
    ).toThrow('Invalid Evidence status cursor');
    expect(() =>
      statusDetailPage(cwd, 'files', { cursor: first.next_cursor }),
    ).toThrow('does not belong');

    const decoded = JSON.parse(
      Buffer.from(first.next_cursor, 'base64url').toString('utf8'),
    ) as { offset: number };
    decoded.offset = 99;
    const beyond = Buffer.from(JSON.stringify(decoded), 'utf8').toString(
      'base64url',
    );
    expect(() =>
      statusDetailPage(cwd, 'artifacts', { cursor: beyond }),
    ).toThrow('beyond the inventory');

    write(cwd, 'artifacts/iterations/ITER-0001/01-requirements/drifted.md');
    expect(() =>
      statusDetailPage(cwd, 'artifacts', { cursor: first.next_cursor }),
    ).toThrow('inventory changed');
  });

  it('keeps model status details on the same bounded projection without state or inventories', () => {
    const cwd = workspace();
    writeState(cwd, DEFAULT_STATE);
    write(cwd, 'artifacts/iterations/ITER-0001/01-requirements/story.md');
    write(cwd, 'apps/web/src/never-model-visible.ts');

    const summary = statusToolResult(cwd);
    const artifacts = statusToolResult(cwd, {
      view: 'artifacts',
      limit: 1,
    });

    expect(Buffer.byteLength(summary.content, 'utf8')).toBeLessThanOrEqual(
      MAX_STATUS_SUMMARY_BYTES,
    );
    expect(summary.details).toEqual({
      view: 'summary',
      projection: expect.objectContaining({ loop: 'kickoff' }),
    });
    expect(artifacts.content).toContain(
      'artifacts/iterations/ITER-0001/01-requirements/story.md',
    );
    expect(artifacts.details).toEqual(
      expect.objectContaining({
        view: 'artifacts',
        projection: summary.details.projection,
        page: expect.objectContaining({ total: 1, count: 1 }),
      }),
    );
    expect(JSON.stringify(summary.details)).not.toContain('"state"');
    expect(JSON.stringify(artifacts.details)).not.toContain('"items"');
    expect(JSON.stringify(artifacts.details)).not.toContain(
      'never-model-visible',
    );
  });
});
