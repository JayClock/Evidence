import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_STATE,
  IDLE_STATE,
  PHASE_META,
} from '../workflow/phase-catalog';
import { writeState } from '../workflow/state-store';
import { cleanupWorkspaces, workspace, write } from '../tests/support';
import { registerCommands } from './commands';

const runtimeMocks = vi.hoisted(() => ({ runPhaseSubagent: vi.fn() }));
vi.mock('../subagents/phase-runner', () => ({
  runPhaseSubagent: runtimeMocks.runPhaseSubagent,
}));

beforeEach(() => {
  runtimeMocks.runPhaseSubagent.mockResolvedValue({
    agent: 'requirements-analyst',
    model: 'openai/test',
    thinking: 'medium',
    output: 'Phase work completed.',
    messages: [],
    exitCode: 0,
    stderr: '',
  });
});

afterEach(() => {
  cleanupWorkspaces();
  vi.clearAllMocks();
});

function context(cwd: string) {
  return {
    cwd,
    mode: 'rpc',
    hasUI: true,
    isIdle: () => true,
    waitForIdle: vi.fn(),
    ui: {
      notify: vi.fn(),
      setStatus: vi.fn(),
      setWidget: vi.fn(),
    },
  };
}

type CommandHandler = (
  args: string,
  ctx: ReturnType<typeof context>,
) => Promise<void>;

function handlers() {
  const values = new Map<string, CommandHandler>();
  const pi = {
    registerCommand(name: string, options: { handler: CommandHandler }) {
      values.set(name, options.handler);
    },
    sendMessage: vi.fn(),
  };
  registerCommands(pi as never);
  return { values, pi };
}

const SOURCE = {
  type: 'github_issue' as const,
  repository: 'owner/evidence',
  issue_number: 42,
  url: 'https://example.test/issues/42',
  snapshot_path: 'snapshot',
  projection_path: 'projection',
  content_hash: 'sha256:test',
  issue_updated_at: '2026-01-01T00:00:00Z',
  fetched_at: '2026-01-01T00:00:00Z',
};

describe('commands', () => {
  it('registers the reduced public command surface', () => {
    const { values } = handlers();
    expect([...values.keys()]).toEqual([
      'evidence-status',
      'evidence-new',
      'evidence-issue-sync',
      'evidence-issue-status',
      'evidence-gate',
      'evidence-run',
    ]);
    expect(values.has('evidence-story')).toBe(false);
  });

  it('requires an explicit human Gate decision', async () => {
    const cwd = workspace();
    const ctx = context(cwd);
    const { values } = handlers();
    await values.get('evidence-gate')?.('', ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      'Usage: /evidence-gate approve|revise|reject <reason>',
      'info',
    );
  });

  it('does not start an agent while the workflow is idle', async () => {
    const cwd = workspace();
    writeState(cwd, IDLE_STATE);
    const ctx = context(cwd);
    const { values } = handlers();
    await values.get('evidence-run')?.('', ctx);
    expect(runtimeMocks.runPhaseSubagent).not.toHaveBeenCalled();
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining('选择 GitHub Issue'),
      'info',
    );
  });

  it('runs the current Kickoff directly and records the invocation', async () => {
    const cwd = workspace();
    for (const path of PHASE_META.kickoff.inputs) {
      const resolved = path.startsWith('artifacts/')
        ? `artifacts/iterations/ITER-0001/${path.slice('artifacts/'.length)}`
        : path;
      write(cwd, resolved, 'input');
    }
    writeState(cwd, { ...DEFAULT_STATE, requirement_source: SOURCE });
    const ctx = context(cwd);
    const { values, pi } = handlers();
    await values.get('evidence-run')?.('', ctx);
    expect(runtimeMocks.runPhaseSubagent).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'kickoff' }),
    );
    expect(pi.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Phase work completed.' }),
    );
  });
});
