import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
      setStatus: vi.fn(),
      setWidget: vi.fn(),
    },
    ...overrides,
  };
}

describe('commands', () => {
  it('registers workflow, gate, and explicit TQA-answer commands', () => {
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
        'evidence-answer',
        'evidence-story',
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
