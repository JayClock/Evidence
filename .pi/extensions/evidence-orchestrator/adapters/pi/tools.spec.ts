import { realpathSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureInboxSource } from '../../capabilities/inbox/repository';
import { listInboxStoryCandidates } from '../../capabilities/inbox/story-candidate';
import { mutateBoard, readBoard } from '../../iteration/board-repository';
import { DEFAULT_STATE } from '../../iteration/default-state';
import { readState, writeState } from '../../iteration/state-repository';
import {
  cleanupWorkspaces,
  initializeGitRepository,
  testIntakeSnapshot,
  workspace,
  write,
} from '../../test-support/support';
import { registerTools, syncActiveTools, toolsForState } from './tools';

const runner = vi.hoisted(() => ({ runActivityAgent: vi.fn() }));

vi.mock('../node/activity-agent-process', () => ({
  runActivityAgent: runner.runActivityAgent,
  loadActivityAgent: (_cwd: string, name: string) => ({
    name,
    model: 'openai/test',
    thinking: 'medium',
    tools: ['read'],
  }),
}));

afterEach(() => {
  cleanupWorkspaces();
  vi.clearAllMocks();
});

function registerStory(cwd: string): void {
  if (readBoard(cwd).items.length > 0) return;
  mutateBoard(cwd, (draft) => {
    draft.next_iteration_number = 2;
    draft.items.push({
      iteration_id: 'ITER-0001',
      candidate_id: 'CAND-0001',
      lifecycle: 'active',
      branch_name: 'evidence/iter-0001',
      worktree_path: realpathSync(cwd),
      base_sha: 'a'.repeat(40),
      admitted_lane: 'discovery',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    });
  });
}

describe('tools', () => {
  it('registers native activity, proposal, TQA, and status tools only', () => {
    const tools: Array<{ name: string }> = [];
    registerTools({
      on() {
        return undefined;
      },
      registerTool(tool: { name: string }) {
        tools.push(tool);
      },
    } as never);

    const names = tools.map(({ name }) => name);
    expect(names).toEqual([
      'evidence_orchestrator_propose_inbox_stories',
      'evidence_orchestrator_start_from_candidate',
      'evidence_orchestrator_status',
      'evidence_orchestrator_propose_kickoff',
      'evidence_orchestrator_run_activity',
      'evidence_orchestrator_propose_scenarios',
      'evidence_orchestrator_propose_modeling_profile',
      'evidence_orchestrator_record_model_analysis',
      'evidence_orchestrator_record_model_challenge',
      'evidence_orchestrator_propose_tasking',
      'evidence_orchestrator_record_showcase_review',
      'evidence_orchestrator_propose_response',
      'evidence_orchestrator_ask_question',
      'evidence_orchestrator_answer_question',
    ]);
  });

  it('exposes only tools owned by the current loop and stage', () => {
    expect(toolsForState(undefined)).toEqual([
      'evidence_orchestrator_propose_inbox_stories',
      'evidence_orchestrator_start_from_candidate',
      'evidence_orchestrator_status',
    ]);
    expect(toolsForState(DEFAULT_STATE)).toEqual([
      'evidence_orchestrator_propose_inbox_stories',
      'evidence_orchestrator_start_from_candidate',
      'evidence_orchestrator_status',
      'evidence_orchestrator_run_activity',
      'evidence_orchestrator_propose_kickoff',
    ]);
    expect(
      toolsForState({
        ...DEFAULT_STATE,
        loop: 'understand',
        understand_stage: 'tqa',
      }),
    ).toEqual([
      'evidence_orchestrator_propose_inbox_stories',
      'evidence_orchestrator_start_from_candidate',
      'evidence_orchestrator_status',
      'evidence_orchestrator_run_activity',
      'evidence_orchestrator_ask_question',
      'evidence_orchestrator_answer_question',
      'evidence_orchestrator_propose_scenarios',
    ]);
    expect(
      toolsForState({
        ...DEFAULT_STATE,
        loop: 'understand',
        understand_stage: 'modeling',
        modeling_stage: 'expansion',
        modeling_profile: {
          version: 1,
          subject: 'tool',
          method: 'none',
          model_change_required: false,
          confirmed_by: 'human',
          confirmed_at: '2026-01-01T00:00:00.000Z',
        },
      }),
    ).not.toContain('evidence_orchestrator_record_model_analysis');
  });

  it('preserves tools owned by Pi and other extensions when changing stage', () => {
    const setActiveTools = vi.fn();
    syncActiveTools(
      {
        getActiveTools: () => [
          'read',
          'other_extension_tool',
          'evidence_orchestrator_propose_response',
        ],
        setActiveTools,
      } as never,
      DEFAULT_STATE,
    );

    expect(setActiveTools).toHaveBeenCalledWith([
      'read',
      'other_extension_tool',
      'evidence_orchestrator_propose_inbox_stories',
      'evidence_orchestrator_start_from_candidate',
      'evidence_orchestrator_status',
      'evidence_orchestrator_run_activity',
      'evidence_orchestrator_propose_kickoff',
    ]);
  });

  it('returns only the bounded status projection and never a code-file inventory', async () => {
    const cwd = workspace();
    writeState(cwd, DEFAULT_STATE);
    write(cwd, 'artifacts/iterations/ITER-0001/01-requirements/story.md');
    write(cwd, 'apps/web/src/hidden-from-status.ts');
    let status: { execute: (...args: never[]) => Promise<unknown> } | undefined;
    registerTools({
      on() {
        return undefined;
      },
      registerTool(tool: {
        name: string;
        execute: (...args: never[]) => Promise<unknown>;
      }) {
        if (tool.name === 'evidence_orchestrator_status') status = tool;
      },
    } as never);

    const result = (await status?.execute(
      'call' as never,
      { view: 'summary' } as never,
      undefined as never,
      undefined as never,
      { cwd } as never,
    )) as { content: Array<{ text: string }>; details: unknown };

    expect(
      Buffer.byteLength(result.content[0].text, 'utf8'),
    ).toBeLessThanOrEqual(4 * 1024);
    expect(result.content[0].text).not.toContain('hidden-from-status');
    expect(result.details).toEqual(
      expect.objectContaining({
        view: 'summary',
        projection: expect.objectContaining({ loop: 'kickoff' }),
      }),
    );
    expect(JSON.stringify(result.details)).not.toContain('codeFiles');
    expect(JSON.stringify(result.details)).not.toContain('"state"');
  });

  it('bounds activity tool content while retaining full child events in details', async () => {
    const cwd = workspace();
    initializeGitRepository(cwd);
    for (const path of [
      'artifacts/iterations/ITER-0001/00-user-input/requirements.md',
      'docs/product/personas.md',
      'docs/product/business-context.md',
      'docs/product/user-journeys.md',
      'docs/product/story-map.md',
    ]) {
      write(cwd, path, 'input');
    }
    writeState(cwd, {
      ...DEFAULT_STATE,
      intake_snapshot: testIntakeSnapshot(),
    });
    registerStory(cwd);
    runner.runActivityAgent.mockResolvedValue({
      agent: 'requirements-analyst',
      model: 'openai/test',
      thinking: 'high',
      output: `Candidate recorded.\n${'detail '.repeat(1_000)}`,
      messages: [
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'full child event' }],
        },
      ],
      exitCode: 0,
      stderr: '',
    });
    let run: { execute: (...args: never[]) => Promise<unknown> } | undefined;
    registerTools({
      on() {
        return undefined;
      },
      registerTool(tool: {
        name: string;
        execute: (...args: never[]) => Promise<unknown>;
      }) {
        if (tool.name === 'evidence_orchestrator_run_activity') run = tool;
      },
    } as never);

    const result = (await run?.execute(
      'call' as never,
      { iterationId: 'ITER-0001' } as never,
      undefined as never,
      undefined as never,
      { cwd, ui: { setStatus: vi.fn() } } as never,
    )) as {
      content: Array<{ text: string }>;
      details: { output: string; messages: unknown[] };
    };

    expect(
      Buffer.byteLength(result.content[0].text, 'utf8'),
    ).toBeLessThanOrEqual(2 * 1024);
    expect(result.content[0].text).toContain('activity-trace.jsonl');
    expect(result.details.output.length).toBeGreaterThan(
      result.content[0].text.length,
    );
    expect(result.details.messages).toHaveLength(1);
  });

  it('records source-cited Inbox candidates without assigning a Story id', async () => {
    const cwd = workspace();
    const source = captureInboxSource(cwd, {
      source_kind: 'manual_text',
      external_key: 'manual:interview',
      title: 'Interview',
      body: 'The owner needs an audit trail.',
    });
    let propose:
      | { execute: (...args: never[]) => Promise<unknown> }
      | undefined;
    registerTools({
      on() {
        return undefined;
      },
      registerTool(tool: {
        name: string;
        execute: (...args: never[]) => Promise<unknown>;
      }) {
        if (tool.name === 'evidence_orchestrator_propose_inbox_stories') {
          propose = tool;
        }
      },
    } as never);

    const result = (await propose?.execute(
      'call' as never,
      {
        sourceIds: ['INBOX-0001'],
        candidates: [
          {
            title: 'Retain deletion evidence',
            problem: 'Deletion is not auditable.',
            role: 'workspace owner',
            goal: 'retain deletion evidence',
            value: 'support an audit',
            cognitiveMode: 'complex',
            citations: [
              {
                inboxId: 'INBOX-0001',
                revisionSha256: source.revision.content_sha256,
                locator: 'whole source',
              },
            ],
          },
        ],
      } as never,
      undefined as never,
      undefined as never,
      { cwd } as never,
    )) as { terminate?: boolean };

    expect(result.terminate).toBe(true);
    expect(listInboxStoryCandidates(cwd)[0]).not.toHaveProperty('story_id');
  });

  it('continues an answered clarification in the same Story TQA session', async () => {
    const cwd = workspace();
    initializeGitRepository(cwd);
    for (const path of [
      'artifacts/iterations/ITER-0001/00-user-input/requirements.md',
      'artifacts/iterations/ITER-0001/01-requirements/problem-statement.md',
      'artifacts/iterations/ITER-0001/01-requirements/stories/US-001.md',
      'docs/product/business-context.md',
      'docs/product/user-journeys.md',
      'docs/product/story-map.md',
    ]) {
      write(cwd, path);
    }
    writeState(cwd, {
      ...DEFAULT_STATE,
      loop: 'understand',
      understand_stage: 'tqa',
      intake_snapshot: testIntakeSnapshot(),
      active_clarification_story: {
        story_id: 'US-001',
        selected_at: '2026-01-01T00:00:00.000Z',
      },
      pending_clarification: {
        question_id: 'Q-001',
        story_id: 'US-001',
        question: 'Who confirms the current model?',
        target: 'history',
        asked_at: '2026-01-01T00:01:00.000Z',
      },
    });
    registerStory(cwd);
    runner.runActivityAgent.mockResolvedValue({
      agent: 'requirements-analyst',
      model: 'openai/test',
      thinking: 'high',
      output: 'Asked the next question.',
      messages: [],
      exitCode: 0,
      stderr: '',
    });
    let answer: { execute: (...args: never[]) => Promise<unknown> } | undefined;
    registerTools({
      on() {
        return undefined;
      },
      registerTool(tool: {
        name: string;
        execute: (...args: never[]) => Promise<unknown>;
      }) {
        if (tool.name === 'evidence_orchestrator_answer_question') {
          answer = tool;
        }
      },
    } as never);

    await expect(
      answer?.execute(
        'call' as never,
        {
          iterationId: 'ITER-0001',
          questionId: 'Q-999',
          answer: 'This answer must not be recorded.',
        } as never,
        undefined as never,
        undefined as never,
        { cwd, ui: { setStatus: vi.fn() } } as never,
      ),
    ).rejects.toThrow('no pending clarification Q-999');
    expect(readState(cwd).pending_clarification?.question_id).toBe('Q-001');
    expect(runner.runActivityAgent).not.toHaveBeenCalled();

    await answer?.execute(
      'call' as never,
      {
        iterationId: 'ITER-0001',
        questionId: 'Q-001',
        answer: 'The modeling lead confirms version v3.',
      } as never,
      undefined as never,
      undefined as never,
      { cwd, ui: { setStatus: vi.fn() } } as never,
    );

    expect(runner.runActivityAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'evidence-iter-0001-us-001-tqa',
        task: expect.stringContaining(
          '回答：The modeling lead confirms version v3.',
        ),
      }),
    );
  });

  it('records one unauthorized Kickoff candidate without creating a Story', async () => {
    const cwd = workspace();
    initializeGitRepository(cwd);
    writeState(cwd, DEFAULT_STATE);
    registerStory(cwd);
    let kickoff:
      | { execute: (...args: never[]) => Promise<unknown> }
      | undefined;
    registerTools({
      on() {
        return undefined;
      },
      registerTool(tool: {
        name: string;
        execute: (...args: never[]) => Promise<unknown>;
      }) {
        if (tool.name === 'evidence_orchestrator_propose_kickoff')
          kickoff = tool;
      },
    } as never);

    const result = (await kickoff?.execute(
      'call' as never,
      {
        iterationId: 'ITER-0001',
        title: 'Confirm current model',
        problem: 'The current version is unclear.',
        role: 'modeling lead',
        goal: 'see the confirmed version',
        value: 'review the intended model',
        cognitiveMode: 'complex',
        sourceRefs: ['Issue #1'],
      } as never,
      undefined as never,
      undefined as never,
      { cwd } as never,
    )) as { terminate?: boolean; details?: { state?: unknown } };

    expect(result.terminate).toBe(true);
    expect(result.details?.state).toMatchObject({
      loop: 'kickoff',
      kickoff_candidate: { title: 'Confirm current model' },
    });
  });
});
