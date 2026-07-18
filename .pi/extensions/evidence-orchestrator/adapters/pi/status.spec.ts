import { afterEach, describe, expect, it } from 'vitest';
import { workflowStateSha256 } from '../../capabilities/flow-control/admission';
import {
  finishActivityTrace,
  startActivityTrace,
} from '../../capabilities/activity-observability/trace';
import { provisionWorkItem } from '../../capabilities/work-item-worktree/provisioner';
import { mutateBoard } from '../../iteration/board-repository';
import { DEFAULT_STATE } from '../../iteration/default-state';
import type { WorkflowState } from '../../iteration/state';
import { writeState } from '../../iteration/state-repository';
import {
  cleanupWorkspaces,
  initializeGitRepository,
  workspace,
  write,
} from '../../test-support/support';
import {
  MAX_STATUS_PAGE_SIZE,
  MAX_STATUS_SUMMARY_BYTES,
  projectStatusSummary,
  renderStatusSummary,
  statusCommandMarkdown,
  statusDetailPage,
  statusMarkdown,
  statusToolResult,
} from './status';

afterEach(cleanupWorkspaces);

function provision(
  cwd: string,
  candidateId = 'CAND-0001',
  state: WorkflowState = DEFAULT_STATE,
) {
  return provisionWorkItem(
    cwd,
    candidateId,
    ({ iterationId, worktreeRoot }) => {
      writeState(worktreeRoot, { ...state, iteration_id: iterationId });
    },
  );
}

describe('multi-Story status', () => {
  it('projects an idle Board without scanning repository code files', () => {
    const cwd = workspace();
    initializeGitRepository(cwd);
    write(cwd, 'apps/web/src/large-context-surface.ts');
    write(cwd, 'libs/web/feature/src/also-hidden.tsx');

    const status = statusMarkdown(cwd);

    expect(Buffer.byteLength(status, 'utf8')).toBeLessThanOrEqual(
      MAX_STATUS_SUMMARY_BYTES,
    );
    expect(status).toContain('# Evidence Story Board');
    expect(status).toContain('- Active: 0/3');
    expect(status).toContain('No active Story Work Items');
    expect(status).not.toContain('apps/web');
    expect(status).not.toContain('libs/web');
  });

  it('keeps three interleaved Board cards bounded with lane and condition', () => {
    const cwd = workspace();
    initializeGitRepository(cwd);
    const first = provision(cwd, 'CAND-0001', {
      ...DEFAULT_STATE,
      loop: 'understand',
      understand_stage: 'tqa',
      active_clarification_story: {
        story_id: 'US-001',
        selected_at: '2026-01-01T00:00:00.000Z',
      },
      pending_clarification: {
        question_id: 'Q-002',
        story_id: 'US-001',
        question: 'Who confirms the model?',
        target: 'history',
        asked_at: '2026-01-01T00:01:00.000Z',
      },
    });
    provision(cwd, 'CAND-0002');
    mutateBoard(cwd, (draft) => {
      draft.items[0].admitted_lane = 'review';
      draft.items[1].admitted_lane = 'ready';
      draft.items[1].pending_lane = 'delivery';
      draft.items[1].pending_lane_requested_at = '2026-01-01T00:00:00.000Z';
      draft.items[1].pending_state_sha256 = workflowStateSha256({
        ...DEFAULT_STATE,
        iteration_id: 'ITER-0002',
      });
    });
    provision(cwd, 'CAND-0003');
    void first;

    const status = statusMarkdown(cwd);

    expect(Buffer.byteLength(status, 'utf8')).toBeLessThanOrEqual(
      MAX_STATUS_SUMMARY_BYTES,
    );
    expect(status).toContain('- Active: 3/3');
    expect(status).toContain(
      'ITER-0001 · review · waiting_human · US-001/Q-002',
    );
    expect(status).toContain('ITER-0002 · ready · queued:delivery');
    expect(status).toContain('ITER-0003 · discovery');
  });

  it('shows worktree, branch, and malformed State drift as explicit blockers', () => {
    const cwd = workspace();
    initializeGitRepository(cwd);
    const story = provision(cwd);
    mutateBoard(cwd, (draft) => {
      draft.items[0].branch_name = 'evidence/iter-9999';
    });

    expect(statusMarkdown(cwd)).toContain('blocker:Story branch drifted');

    mutateBoard(cwd, (draft) => {
      draft.items[0].branch_name = story.worktree.branchName;
    });
    write(story.worktree.path, '.evidence-iteration-state.json', '{');
    expect(statusMarkdown(cwd)).toContain(
      "blocker:Expected property name or '}' in JSON",
    );
  });

  it('keeps one exact pending TQA question intact in Story detail', () => {
    const cwd = workspace();
    initializeGitRepository(cwd);
    const question = 'Who confirms the model before another editor opens it?';
    const story = provision(cwd, 'CAND-0001', {
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
      story.worktree.path,
      'artifacts/iterations/ITER-0001/01-requirements/stories/US-001.md',
    );

    const status = statusCommandMarkdown(cwd, 'ITER-0001');

    expect(Buffer.byteLength(status, 'utf8')).toBeLessThanOrEqual(
      MAX_STATUS_SUMMARY_BYTES,
    );
    expect(status).toContain('- Loop: understand');
    expect(status).toContain(`Q-001 · ${question}`);
    expect(status).toContain('/evidence-answer ITER-0001 Q-001');
    expect(status).toContain('total=1');
    expect(status).not.toContain('## Artifacts');
  });

  it('is a pure Story projection over already-resolved workflow facts', () => {
    const projection = projectStatusSummary({
      state: {
        ...DEFAULT_STATE,
        loop: 'tasking',
        tasking_stage: 'desk_check',
      },
      nextAction: '/evidence-desk-check ITER-0001',
      artifactCounts: { total: 7, '04-planning': 3 },
    });

    expect(projection).toEqual(
      expect.objectContaining({
        iteration_id: 'ITER-0001',
        loop: 'tasking',
        stage: 'desk_check',
        next_action: '/evidence-desk-check ITER-0001',
        artifact_counts: { total: 7, '04-planning': 3 },
      }),
    );
  });

  it('renders locked Pair budget usage, shadow limits, and unknown cost', () => {
    const projection = projectStatusSummary({
      state: {
        ...DEFAULT_STATE,
        loop: 'tasking',
        tasking_stage: 'desk_check',
      },
      nextAction: '/evidence-desk-check ITER-0001',
      artifactCounts: { total: 1 },
      budget: {
        mode: 'shadow',
        level: 'soft',
        expected_pair_agent_calls: 11,
        pair_agent_calls: 8,
        max_pair_agent_calls: 10,
        pair_checkpoints: 20,
        emergency_max_checkpoints: 200,
        no_progress_checkpoints: 2,
        max_no_progress_checkpoints: null,
        duration_ms: 2_000,
        max_duration_ms: null,
        input_tokens: 1_200,
        max_input_tokens: null,
        output_tokens: 100,
        max_output_tokens: null,
        reported_cost_usd: null,
        max_reported_cost_usd: null,
        cost_status: 'unknown',
      },
    });

    const status = renderStatusSummary(projection);
    expect(status).toContain('- Budget: shadow/soft');
    expect(status).toContain('agents=8/10 (expected 11)');
    expect(status).toContain('no-progress=2/shadow');
    expect(status).toContain('cost=unknown');
  });

  it('shows compact per-Story Q/T/C without treating missing cost as zero', () => {
    const cwd = workspace();
    initializeGitRepository(cwd);
    const story = provision(cwd, 'CAND-0001', {
      ...DEFAULT_STATE,
      loop: 'understand',
      understand_stage: 'tqa',
      active_clarification_story: {
        story_id: 'US-001',
        selected_at: '2026-01-01T00:00:00.000Z',
      },
    });
    const span = startActivityTrace(story.worktree.path, {
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

    const status = statusCommandMarkdown(cwd, 'ITER-0001');
    expect(status).toContain(
      '- Activity: 1 calls · ↑1.2k · ↓100 · cost:n/a · cost:n/a=1 · 2.0s',
    );
    expect(status).not.toContain('$0.0000');
  });

  it('paginates only one exact Story artifact inventory at no more than 50', () => {
    const cwd = workspace();
    initializeGitRepository(cwd);
    const story = provision(cwd);
    for (let index = 0; index < 55; index += 1) {
      const suffix = String(index).padStart(2, '0');
      write(
        story.worktree.path,
        `artifacts/iterations/ITER-0001/01-requirements/item-${suffix}.md`,
      );
      write(story.worktree.path, `apps/web/src/item-${suffix}.ts`);
    }

    const artifacts = statusDetailPage(cwd, 'ITER-0001');

    expect(artifacts.items).toHaveLength(MAX_STATUS_PAGE_SIZE);
    expect(artifacts.total).toBe(55);
    expect(artifacts.next_cursor).toBeTruthy();
    expect(
      statusDetailPage(cwd, 'ITER-0001', {
        cursor: artifacts.next_cursor,
      }).items,
    ).toHaveLength(5);
    expect(statusCommandMarkdown(cwd, 'ITER-0001 artifacts')).toContain(
      'artifacts/iterations/ITER-0001/01-requirements/item-00.md',
    );
    expect(statusMarkdown(cwd)).not.toContain('apps/web/src/item-00.ts');
    expect(() => statusCommandMarkdown(cwd, 'ITER-0001 files')).toThrow(
      'Usage: /evidence-status',
    );
  });

  it('binds cursors to Board revision, Iteration, and inventory hash', () => {
    const cwd = workspace();
    initializeGitRepository(cwd);
    const firstStory = provision(cwd, 'CAND-0001');
    const secondStory = provision(cwd, 'CAND-0002');
    for (const story of [firstStory, secondStory]) {
      for (let index = 0; index < 3; index += 1) {
        write(
          story.worktree.path,
          `artifacts/iterations/${story.item.iteration_id}/01-requirements/item-${index}.md`,
        );
      }
    }
    const first = statusDetailPage(cwd, 'ITER-0001', { limit: 1 });
    if (!first.next_cursor) throw new Error('Expected a next cursor.');

    expect(() =>
      statusDetailPage(cwd, 'ITER-0001', { cursor: 'not-a-cursor' }),
    ).toThrow('Invalid Evidence status cursor');
    expect(() =>
      statusDetailPage(cwd, 'ITER-0002', { cursor: first.next_cursor }),
    ).toThrow('belongs to another Iteration');

    mutateBoard(cwd, (draft) => {
      draft.items[1].updated_at = '2026-01-01T00:02:00.000Z';
    });
    expect(() =>
      statusDetailPage(cwd, 'ITER-0001', { cursor: first.next_cursor }),
    ).toThrow('Board changed');

    const afterBoardChange = statusDetailPage(cwd, 'ITER-0001', { limit: 1 });
    if (!afterBoardChange.next_cursor) throw new Error('Expected a cursor.');
    write(
      firstStory.worktree.path,
      'artifacts/iterations/ITER-0001/01-requirements/drifted.md',
    );
    expect(() =>
      statusDetailPage(cwd, 'ITER-0001', {
        cursor: afterBoardChange.next_cursor,
      }),
    ).toThrow('inventory changed');
  });

  it('returns bounded Board or exact Story tool details without raw State', () => {
    const cwd = workspace();
    initializeGitRepository(cwd);
    const story = provision(cwd);
    write(
      story.worktree.path,
      'artifacts/iterations/ITER-0001/01-requirements/story.md',
    );
    write(story.worktree.path, 'apps/web/src/never-model-visible.ts');

    const board = statusToolResult(cwd);
    const summary = statusToolResult(cwd, { iterationId: 'ITER-0001' });
    const artifacts = statusToolResult(cwd, {
      iterationId: 'ITER-0001',
      view: 'artifacts',
      limit: 1,
    });

    expect(board.details).toEqual(
      expect.objectContaining({ view: 'summary', scope: 'board' }),
    );
    expect(summary.details).toEqual({
      view: 'summary',
      scope: 'story',
      projection: expect.objectContaining({ loop: 'kickoff' }),
    });
    expect(artifacts.content).toContain(
      'artifacts/iterations/ITER-0001/01-requirements/story.md',
    );
    expect(artifacts.details).toEqual(
      expect.objectContaining({
        view: 'artifacts',
        scope: 'story',
        page: expect.objectContaining({ total: 1, count: 1 }),
      }),
    );
    expect(JSON.stringify(summary.details)).not.toContain('"state"');
    expect(JSON.stringify(artifacts.details)).not.toContain('"items"');
    expect(JSON.stringify(artifacts.details)).not.toContain(
      'never-model-visible',
    );
    expect(() => statusToolResult(cwd, { view: 'artifacts' })).toThrow(
      'requires an exact iterationId',
    );
  });
});
