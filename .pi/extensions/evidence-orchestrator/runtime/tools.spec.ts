import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_STATE, PHASE_META } from '../workflow/phase-catalog';
import { readState, writeState } from '../workflow/state-store';
import {
  cleanupWorkspaces,
  LEAN_STORY_CARD,
  workspace,
  write,
  writeIterationArtifact,
} from '../tests/support';
import { registerTools } from './tools';

const phaseRunnerMocks = vi.hoisted(() => ({ runPhaseSubagent: vi.fn() }));
vi.mock('../subagents/phase-runner', () => ({
  runPhaseSubagent: phaseRunnerMocks.runPhaseSubagent,
}));

beforeEach(() => {
  phaseRunnerMocks.runPhaseSubagent.mockResolvedValue({
    agent: 'requirements-analyst',
    model: 'openai/test',
    thinking: 'medium',
    output: 'Discover resumed.',
    messages: [],
    exitCode: 0,
    stderr: '',
  });
});

afterEach(() => {
  cleanupWorkspaces();
  vi.clearAllMocks();
});

type Execute = (
  id: string,
  params: Record<string, unknown>,
  signal: AbortSignal | undefined,
  onUpdate: ((result: unknown) => void) | undefined,
  ctx: Record<string, unknown>,
) => Promise<unknown>;

function registeredTools() {
  const tools: Array<{
    name: string;
    parameters?: Record<string, unknown>;
    execute?: Execute;
    renderCall?: unknown;
    renderResult?: unknown;
  }> = [];
  let resultHandler:
    | ((event: { toolName: string; details: unknown }) => unknown)
    | undefined;
  registerTools({
    registerTool(definition: (typeof tools)[number]) {
      tools.push(definition);
    },
    on(event: string, handler: typeof resultHandler) {
      if (event === 'tool_result') resultHandler = handler;
    },
  } as never);
  return { tools, resultHandler };
}

const SOURCE = {
  type: 'github_issue' as const,
  repository: 'owner/repo',
  issue_number: 1,
  url: 'https://example.test/issues/1',
  snapshot_path: 'snapshot',
  projection_path: 'projection',
  content_hash: 'sha256:test',
  issue_updated_at: '2026-01-01T00:00:00Z',
  fetched_at: '2026-01-01T00:00:00Z',
};

function discoverInputs(cwd: string): void {
  for (const path of PHASE_META.discover.inputs) {
    const resolved = path.startsWith('artifacts/')
      ? `artifacts/iterations/ITER-0001/${path.slice('artifacts/'.length)}`
      : path;
    write(cwd, resolved, 'input');
  }
  writeIterationArtifact(cwd, '01-kickoff/story.md', LEAN_STORY_CARD);
}

describe('tools', () => {
  it('registers the reduced single-Story tool surface', () => {
    const { tools, resultHandler } = registeredTools();
    const names = tools.map(({ name }) => name);
    expect(names).toContain('evidence_orchestrator_run_phase');
    expect(names).toContain('evidence_orchestrator_ask_question');
    expect(names).toContain('evidence_orchestrator_answer_question');
    expect(names).toContain('evidence_orchestrator_select_work_item');
    expect(names).not.toContain('evidence_orchestrator_select_story');
    expect(names).not.toContain('evidence_orchestrator_propose_story_outcome');
    expect(
      resultHandler?.({
        toolName: 'evidence_orchestrator_run_phase',
        details: { exitCode: 1 },
      }),
    ).toEqual({ isError: true });
  });

  it('requires Thought as part of the TQA Question schema', () => {
    const { tools } = registeredTools();
    const question = tools.find(
      ({ name }) => name === 'evidence_orchestrator_ask_question',
    );
    expect(question?.parameters?.required).toEqual([
      'storyId',
      'thought',
      'question',
    ]);
  });

  it('records an explicit Answer and resumes Discover in the same call', async () => {
    const cwd = workspace();
    discoverInputs(cwd);
    writeState(cwd, {
      ...DEFAULT_STATE,
      phase: 'discover',
      requirement_source: SOURCE,
      pending_clarification: {
        question_id: 'Q-001',
        story_id: 'US-001',
        thought: 'Editing authority is unclear.',
        question: 'Who may edit the workspace title?',
        asked_at: '2026-01-01T00:00:00Z',
      },
    });
    const { tools } = registeredTools();
    const execute = tools.find(
      ({ name }) => name === 'evidence_orchestrator_answer_question',
    )?.execute;
    const onUpdate = vi.fn();
    const result = await execute?.(
      '',
      { answer: 'The workspace owner.' },
      undefined,
      onUpdate,
      { cwd, ui: { setStatus: vi.fn() } },
    );

    expect(readState(cwd).pending_clarification).toBeUndefined();
    expect(readState(cwd).clarification_history?.[0]?.answer).toBe(
      'The workspace owner.',
    );
    expect(phaseRunnerMocks.runPhaseSubagent).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'discover' }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        terminate: true,
        details: expect.objectContaining({ status: 'completed' }),
      }),
    );
  });
});
