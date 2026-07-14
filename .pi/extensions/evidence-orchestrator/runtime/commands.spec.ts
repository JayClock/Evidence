import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { proposeClarificationStoryOutcome } from '../requirements/clarifications';
import { DEFAULT_STATE, PHASE_META } from '../workflow/phase-catalog';
import { readState, writeState } from '../workflow/state-store';
import type { Phase, WorkflowState } from '../workflow/types';
import {
  cleanupWorkspaces,
  workspace,
  write,
  writeIterationArtifact,
} from '../tests/support';
import { registerCommands } from './commands';

const runtimeMocks = vi.hoisted(() => ({
  startIterationFromIssueAsync: vi.fn(),
  runPhaseSubagent: vi.fn(),
}));

vi.mock('../requirements/github-issue', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../requirements/github-issue')>()),
  startIterationFromIssueAsync: runtimeMocks.startIterationFromIssueAsync,
}));

vi.mock('../subagents/phase-runner', () => ({
  runPhaseSubagent: runtimeMocks.runPhaseSubagent,
}));

beforeEach(() => {
  runtimeMocks.runPhaseSubagent.mockImplementation(
    async (options: {
      onUpdate?: (progress: Record<string, unknown>) => void;
    }) => {
      options.onUpdate?.({
        agent: 'requirements-analyst',
        model: 'openai/test',
        thinking: 'medium',
        output: 'Phase work is running.',
        messages: [],
        exitCode: -1,
        stderr: '',
      });
      return {
        agent: 'requirements-analyst',
        model: 'openai/test',
        thinking: 'medium',
        output: 'Phase work completed.',
        messages: [],
        exitCode: 0,
        stderr: '',
      };
    },
  );
});

afterEach(() => {
  cleanupWorkspaces();
  vi.clearAllMocks();
});

function issueState(phase: Phase = 'frame'): WorkflowState {
  return {
    ...DEFAULT_STATE,
    phase,
    requirement_source: {
      type: 'github_issue',
      repository: 'owner/repo',
      issue_number: 42,
      url: 'https://example.test/issues/42',
      snapshot_path: 'artifacts/iterations/ITER-0001/00-user-input/issue.json',
      projection_path:
        'artifacts/iterations/ITER-0001/00-user-input/requirements.md',
      content_hash: 'sha256:test',
      issue_updated_at: '2026-01-01T00:00:00.000Z',
      fetched_at: '2026-01-01T00:00:00.000Z',
    },
  };
}

function writePhaseInputs(
  cwd: string,
  phase: Exclude<Phase, 'complete'>,
): void {
  for (const path of PHASE_META[phase].inputs) {
    write(
      cwd,
      path.startsWith('artifacts/')
        ? `artifacts/iterations/ITER-0001/${path.slice('artifacts/'.length)}`
        : path,
      'input',
    );
  }
}

function prepareProposedStory(cwd: string): void {
  writePhaseInputs(cwd, 'clarify');
  writeIterationArtifact(
    cwd,
    '01-requirements/stories/US-001.md',
    '# 编辑工作区信息\n',
  );
  writeState(cwd, {
    ...issueState('clarify'),
    active_clarification_story: {
      story_id: 'US-001',
      selected_at: '2026-01-01T00:00:00.000Z',
    },
  });
  proposeClarificationStoryOutcome(
    cwd,
    'US-001',
    'clarified',
    '业务边界已经明确。',
  );
}

function commandContext(cwd: string, overrides: Record<string, unknown> = {}) {
  return {
    cwd,
    mode: 'rpc',
    hasUI: true,
    isIdle: () => true,
    waitForIdle: vi.fn(),
    ui: {
      notify: vi.fn(),
      select: vi.fn(),
      input: vi.fn(),
      setStatus: vi.fn(),
      setWidget: vi.fn(),
    },
    ...overrides,
  };
}

describe('commands', () => {
  it('registers public workflow commands', () => {
    const commands: string[] = [];
    registerCommands({
      registerCommand(name: string) {
        commands.push(name);
      },
    } as never);

    expect(commands).toEqual(
      expect.arrayContaining([
        'evidence-run',
        'evidence-new',
        'evidence-gate',
        'evidence-story',
        'evidence-story-complete',
        'evidence-issue-sync',
        'evidence-issue-status',
      ]),
    );
  });

  it('runs frame directly after starting a new iteration', async () => {
    const cwd = workspace();
    const state = issueState();
    writePhaseInputs(cwd, 'frame');
    writeState(cwd, state);
    runtimeMocks.startIterationFromIssueAsync.mockResolvedValue(state);

    let start: ((args: string, ctx: unknown) => Promise<void>) | undefined;
    const sendMessage = vi.fn();
    const sendUserMessage = vi.fn();
    registerCommands({
      registerCommand(name: string, options: { handler: typeof start }) {
        if (name === 'evidence-new') start = options.handler;
      },
      exec: vi.fn().mockResolvedValue({
        code: 0,
        stdout: JSON.stringify([
          {
            number: 42,
            title: 'Frame this requirement',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ]),
        stderr: '',
      }),
      sendMessage,
      sendUserMessage,
    } as never);
    const ctx = commandContext(cwd);
    ctx.ui.select.mockResolvedValue(
      '#42 Frame this requirement · updated 2026-01-01',
    );

    await start?.('', ctx);

    expect(runtimeMocks.runPhaseSubagent).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'frame' }),
    );
    expect(sendUserMessage).not.toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        customType: 'evidence-orchestrator-phase-result',
        content: 'Phase work completed.',
      }),
    );
    expect(ctx.ui.setStatus).toHaveBeenCalledWith(
      'evidence-network',
      '正在加载 GitHub Issues…',
    );
    expect(ctx.ui.setStatus).toHaveBeenCalledWith(
      'evidence-network',
      '正在冻结 GitHub Issue #42 并创建迭代…',
    );
  });

  it('opens the story picker and runs clarify without another model turn', async () => {
    const cwd = workspace();
    writePhaseInputs(cwd, 'clarify');
    writeIterationArtifact(
      cwd,
      '01-requirements/stories/US-001.md',
      '# 编辑工作区信息\n',
    );
    writeState(cwd, { ...issueState('clarify'), phase: 'clarify' });

    let run: ((args: string, ctx: unknown) => Promise<void>) | undefined;
    const sendMessage = vi.fn();
    const sendUserMessage = vi.fn();
    registerCommands({
      registerCommand(name: string, options: { handler: typeof run }) {
        if (name === 'evidence-run') run = options.handler;
      },
      sendMessage,
      sendUserMessage,
    } as never);
    const ctx = commandContext(cwd);
    ctx.ui.select.mockResolvedValue('US-001 · 编辑工作区信息');

    await run?.('', ctx);

    expect(ctx.ui.select).toHaveBeenCalledWith('选择一张用户故事卡进行澄清', [
      'US-001 · 编辑工作区信息',
    ]);
    expect(readState(cwd).active_clarification_story?.story_id).toBe('US-001');
    expect(runtimeMocks.runPhaseSubagent).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'clarify' }),
    );
    expect(sendMessage).toHaveBeenCalledOnce();
    expect(sendUserMessage).not.toHaveBeenCalled();
  });

  it('lets the active story be selected again and surfaces its pending question', async () => {
    const cwd = workspace();
    writePhaseInputs(cwd, 'clarify');
    writeIterationArtifact(
      cwd,
      '01-requirements/stories/US-001.md',
      '# 编辑工作区信息\n',
    );
    writeState(cwd, {
      ...issueState('clarify'),
      active_clarification_story: {
        story_id: 'US-001',
        selected_at: '2026-01-01T00:00:00.000Z',
      },
      pending_clarification: {
        question_id: 'Q-001',
        story_id: 'US-001',
        question: '谁可以编辑工作区信息？',
        target: 'business_context',
        asked_at: '2026-01-01T00:01:00.000Z',
      },
    });

    let selectStory:
      | ((args: string, ctx: unknown) => Promise<void>)
      | undefined;
    registerCommands({
      registerCommand(name: string, options: { handler: typeof selectStory }) {
        if (name === 'evidence-story') selectStory = options.handler;
      },
      sendMessage: vi.fn(),
    } as never);
    const ctx = commandContext(cwd);
    ctx.ui.select.mockResolvedValue('US-001 · 编辑工作区信息');

    await selectStory?.('', ctx);

    expect(ctx.ui.select).toHaveBeenCalledWith('选择一张用户故事卡进行澄清', [
      'US-001 · 编辑工作区信息',
    ]);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      'Clarification Q-001 for US-001 is awaiting a domain-expert answer: 谁可以编辑工作区信息？',
      'info',
    );
    expect(runtimeMocks.runPhaseSubagent).not.toHaveBeenCalled();
    expect(readState(cwd).active_clarification_story?.story_id).toBe('US-001');
  });

  it('switches to another story while the current question is pending', async () => {
    const cwd = workspace();
    writePhaseInputs(cwd, 'clarify');
    writeIterationArtifact(
      cwd,
      '01-requirements/stories/US-001.md',
      '# 编辑工作区信息\n',
    );
    writeIterationArtifact(
      cwd,
      '01-requirements/stories/US-002.md',
      '# 删除工作区\n',
    );
    writeState(cwd, {
      ...issueState('clarify'),
      active_clarification_story: {
        story_id: 'US-001',
        selected_at: '2026-01-01T00:00:00.000Z',
      },
      pending_clarification: {
        question_id: 'Q-001',
        story_id: 'US-001',
        question: '谁可以编辑工作区信息？',
        target: 'business_context',
        asked_at: '2026-01-01T00:01:00.000Z',
      },
    });

    let selectStory:
      | ((args: string, ctx: unknown) => Promise<void>)
      | undefined;
    const sendMessage = vi.fn();
    registerCommands({
      registerCommand(name: string, options: { handler: typeof selectStory }) {
        if (name === 'evidence-story') selectStory = options.handler;
      },
      sendMessage,
    } as never);
    const ctx = commandContext(cwd);
    ctx.ui.select.mockResolvedValue('US-002 · 删除工作区');

    await selectStory?.('', ctx);

    const state = readState(cwd);
    expect(state.active_clarification_story?.story_id).toBe('US-002');
    expect(state.pending_clarification).toBeUndefined();
    expect(state.paused_clarifications).toEqual([
      expect.objectContaining({ question_id: 'Q-001', story_id: 'US-001' }),
    ]);
    expect(runtimeMocks.runPhaseSubagent).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'clarify' }),
    );
    expect(sendMessage).toHaveBeenCalledOnce();
  });

  it('reserves final story completion for an explicit human command', async () => {
    const cwd = workspace();
    prepareProposedStory(cwd);

    let complete: ((args: string, ctx: unknown) => Promise<void>) | undefined;
    registerCommands({
      registerCommand(name: string, options: { handler: typeof complete }) {
        if (name === 'evidence-story-complete') complete = options.handler;
      },
      sendMessage: vi.fn(),
    } as never);
    const ctx = commandContext(cwd);

    await complete?.('confirm', ctx);

    const state = readState(cwd);
    expect(state.active_clarification_story).toBeUndefined();
    expect(state.proposed_clarification_story_outcome).toBeUndefined();
    expect(state.clarification_story_outcomes?.[0]).toEqual(
      expect.objectContaining({
        story_id: 'US-001',
        outcome: 'clarified',
        decided_by: 'human',
      }),
    );
  });

  it('lets the human override the AI proposal through the decision picker', async () => {
    const cwd = workspace();
    prepareProposedStory(cwd);

    let complete: ((args: string, ctx: unknown) => Promise<void>) | undefined;
    registerCommands({
      registerCommand(name: string, options: { handler: typeof complete }) {
        if (name === 'evidence-story-complete') complete = options.handler;
      },
      sendMessage: vi.fn(),
    } as never);
    const ctx = commandContext(cwd);
    ctx.ui.select.mockResolvedValue('改为 needs_split');
    ctx.ui.input.mockResolvedValue('该故事包含两个可独立交付的业务价值。');

    await complete?.('', ctx);

    expect(ctx.ui.select).toHaveBeenCalledWith(
      '决定 US-001 的最终澄清结论',
      expect.arrayContaining([
        '确认 AI 建议：clarified · 业务边界已经明确。',
        '继续澄清（拒绝本次建议）',
        '改为 needs_split',
      ]),
    );
    expect(readState(cwd).clarification_story_outcomes?.[0]).toEqual(
      expect.objectContaining({
        outcome: 'needs_split',
        summary: '该故事包含两个可独立交付的业务价值。',
        decided_by: 'human',
        proposal: expect.objectContaining({ outcome: 'clarified' }),
      }),
    );
  });

  it('keeps the story active and resumes TQA when the human requests more clarification', async () => {
    const cwd = workspace();
    prepareProposedStory(cwd);

    let complete: ((args: string, ctx: unknown) => Promise<void>) | undefined;
    const sendMessage = vi.fn();
    registerCommands({
      registerCommand(name: string, options: { handler: typeof complete }) {
        if (name === 'evidence-story-complete') complete = options.handler;
      },
      sendMessage,
    } as never);

    await complete?.(
      'continue 仍需明确审批规则的例外情况。',
      commandContext(cwd),
    );

    const state = readState(cwd);
    expect(state.active_clarification_story?.story_id).toBe('US-001');
    expect(state.proposed_clarification_story_outcome).toBeUndefined();
    expect(state.clarification_story_outcomes).toBeUndefined();
    expect(runtimeMocks.runPhaseSubagent).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'clarify',
        task: expect.stringContaining('仍需明确审批规则的例外情况。'),
      }),
    );
    expect(sendMessage).toHaveBeenCalledOnce();
  });

  it('executes evidence-run directly and records the command invocation', async () => {
    const cwd = workspace();
    writePhaseInputs(cwd, 'frame');
    writeState(cwd, issueState());

    let run: ((args: string, ctx: unknown) => Promise<void>) | undefined;
    const sendMessage = vi.fn();
    const sendUserMessage = vi.fn();
    registerCommands({
      registerCommand(name: string, options: { handler: typeof run }) {
        if (name === 'evidence-run') run = options.handler;
      },
      sendMessage,
      sendUserMessage,
    } as never);

    await run?.('Keep scope narrow.', commandContext(cwd));

    expect(runtimeMocks.runPhaseSubagent).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'frame',
        task: expect.stringContaining('Keep scope narrow.'),
      }),
    );
    expect(readState(cwd).pi?.last_command).toBe(
      '/evidence-run Keep scope narrow.',
    );
    expect(sendMessage).toHaveBeenCalledOnce();
    expect(sendUserMessage).not.toHaveBeenCalled();
  });
});
