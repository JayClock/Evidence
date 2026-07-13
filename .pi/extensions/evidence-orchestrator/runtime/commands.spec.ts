import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_STATE, PHASE_META } from '../workflow/phase-catalog';
import { readState, writeState } from '../workflow/state-store';
import {
  cleanupWorkspaces,
  workspace,
  write,
  writeIterationArtifact,
} from '../tests/support';
import { registerCommands } from './commands';

const githubIssueMocks = vi.hoisted(() => ({
  startIterationFromIssueAsync: vi.fn(),
}));

vi.mock('../requirements/github-issue', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../requirements/github-issue')>()),
  startIterationFromIssueAsync: githubIssueMocks.startIterationFromIssueAsync,
}));

afterEach(() => {
  cleanupWorkspaces();
  vi.clearAllMocks();
});

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

  it('queues one visible frame run after starting a new iteration', async () => {
    const cwd = workspace();
    githubIssueMocks.startIterationFromIssueAsync.mockResolvedValue({
      ...DEFAULT_STATE,
      requirement_source: {
        type: 'github_issue',
        repository: 'owner/repo',
        issue_number: 42,
        url: 'https://example.test/issues/42',
        snapshot_path:
          'artifacts/iterations/ITER-0001/00-user-input/issue.json',
        projection_path:
          'artifacts/iterations/ITER-0001/00-user-input/requirements.md',
        content_hash: 'sha256:test',
        issue_updated_at: '2026-01-01T00:00:00.000Z',
        fetched_at: '2026-01-01T00:00:00.000Z',
      },
    });
    let start: ((args: string, ctx: unknown) => Promise<void>) | undefined;
    const sendUserMessage = vi.fn();
    const setStatus = vi.fn();
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
      sendUserMessage,
    } as never);

    await start?.('', {
      cwd,
      hasUI: true,
      isIdle: () => true,
      ui: {
        notify: vi.fn(),
        select: vi
          .fn()
          .mockResolvedValue('#42 Frame this requirement · updated 2026-01-01'),
        setStatus,
      },
    });

    expect(setStatus).toHaveBeenCalledWith(
      'evidence-network',
      '正在加载 GitHub Issues…',
    );
    expect(setStatus).toHaveBeenCalledWith(
      'evidence-network',
      '正在冻结 GitHub Issue #42 并创建迭代…',
    );
    expect(sendUserMessage).toHaveBeenCalledTimes(1);
    expect(sendUserMessage).toHaveBeenCalledWith(
      expect.stringContaining('evidence_orchestrator_run_phase'),
    );
  });

  it('opens the manual story picker before queuing clarify', async () => {
    const cwd = workspace();
    for (const path of PHASE_META.clarify.inputs) {
      write(
        cwd,
        path.startsWith('artifacts/')
          ? `artifacts/iterations/ITER-0001/${path.slice('artifacts/'.length)}`
          : path,
        'input',
      );
    }
    writeIterationArtifact(
      cwd,
      '01-requirements/stories/US-001.md',
      '# 编辑工作区信息\n',
    );
    writeState(cwd, {
      ...DEFAULT_STATE,
      phase: 'clarify',
      requirement_source: {
        type: 'github_issue',
        repository: 'owner/repo',
        issue_number: 1,
        url: 'https://example.test/issues/1',
        snapshot_path:
          'artifacts/iterations/ITER-0001/00-user-input/issue.json',
        projection_path:
          'artifacts/iterations/ITER-0001/00-user-input/requirements.md',
        content_hash: 'sha256:test',
        issue_updated_at: '2026-01-01T00:00:00.000Z',
        fetched_at: '2026-01-01T00:00:00.000Z',
      },
    });

    let run: ((args: string, ctx: unknown) => Promise<void>) | undefined;
    const sendUserMessage = vi.fn();
    const select = vi.fn().mockResolvedValue('US-001 · 编辑工作区信息');
    registerCommands({
      registerCommand(name: string, options: { handler: typeof run }) {
        if (name === 'evidence-run') run = options.handler;
      },
      sendUserMessage,
    } as never);

    await run?.('', {
      cwd,
      hasUI: true,
      isIdle: () => true,
      ui: { notify: vi.fn(), select, setStatus: vi.fn() },
    });

    expect(select).toHaveBeenCalledWith('选择一张用户故事卡进行澄清', [
      'US-001 · 编辑工作区信息',
    ]);
    expect(readState(cwd).active_clarification_story?.story_id).toBe('US-001');
    expect(sendUserMessage).toHaveBeenCalledWith(
      expect.stringContaining('evidence_orchestrator_run_phase'),
    );
  });

  it('routes evidence-run through the visible phase tool in the current conversation', async () => {
    const cwd = workspace();
    for (const path of PHASE_META.frame.inputs) {
      write(
        cwd,
        path.startsWith('artifacts/')
          ? `artifacts/iterations/ITER-0001/${path.slice('artifacts/'.length)}`
          : path,
        'input',
      );
    }
    writeIterationArtifact(cwd, '00-user-input/requirements.md', 'input');
    writeState(cwd, {
      ...DEFAULT_STATE,
      requirement_source: {
        type: 'github_issue',
        repository: 'owner/repo',
        issue_number: 1,
        url: 'https://example.test/issues/1',
        snapshot_path:
          'artifacts/iterations/ITER-0001/00-user-input/issue.json',
        projection_path:
          'artifacts/iterations/ITER-0001/00-user-input/requirements.md',
        content_hash: 'sha256:test',
        issue_updated_at: '2026-01-01T00:00:00.000Z',
        fetched_at: '2026-01-01T00:00:00.000Z',
      },
    });

    let run: ((args: string, ctx: unknown) => Promise<void>) | undefined;
    const sendUserMessage = vi.fn();
    registerCommands({
      registerCommand(name: string, options: { handler: typeof run }) {
        if (name === 'evidence-run') run = options.handler;
      },
      sendUserMessage,
    } as never);

    await run?.('', {
      cwd,
      isIdle: () => true,
      ui: { notify: vi.fn(), setStatus: vi.fn() },
    });

    expect(sendUserMessage).toHaveBeenCalledWith(
      expect.stringContaining('evidence_orchestrator_run_phase'),
    );
  });
});
