import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_STATE } from '../workflow/phase-catalog';
import { readState } from '../workflow/state-store';
import { cleanupWorkspaces, workspace } from '../tests/support';
import type { PreparedPhaseRun } from './phase-dispatch';
import { executePreparedPhaseRun } from './phase-execution';

const phaseRunnerMocks = vi.hoisted(() => ({
  runPhaseSubagent: vi.fn(),
}));

vi.mock('../subagents/phase-runner', () => ({
  runPhaseSubagent: phaseRunnerMocks.runPhaseSubagent,
}));

afterEach(() => {
  cleanupWorkspaces();
  vi.clearAllMocks();
});

function preparation(): PreparedPhaseRun {
  return {
    state: {
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
    },
    phase: 'frame',
    task: 'Frame the frozen requirement.',
  };
}

describe('phase execution', () => {
  it('shares state, progress, and status handling across callers', async () => {
    const cwd = workspace();
    const setStatus = vi.fn();
    const onUpdate = vi.fn();
    phaseRunnerMocks.runPhaseSubagent.mockImplementation(
      async (options: {
        onUpdate?: (progress: Record<string, unknown>) => void;
      }) => {
        options.onUpdate?.({
          agent: 'requirements-analyst',
          model: 'openai/test',
          thinking: 'medium',
          output: 'Inspecting the frozen Issue.',
          messages: [],
          exitCode: -1,
          stderr: '',
        });
        return {
          agent: 'requirements-analyst',
          model: 'openai/test',
          thinking: 'medium',
          output: 'Frame complete.',
          messages: [],
          exitCode: 0,
          stderr: '',
        };
      },
    );

    const result = await executePreparedPhaseRun(
      { cwd, ui: { setStatus } },
      preparation(),
      {
        invocation: '/evidence-run',
        now: () => '2026-07-13T00:00:00.000Z',
        onUpdate,
      },
    );

    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'frame',
        task: 'Frame the frozen requirement.',
        status: 'running',
        exitCode: -1,
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        phase: 'frame',
        status: 'completed',
        output: 'Frame complete.',
      }),
    );
    expect(readState(cwd).pi).toEqual(
      expect.objectContaining({
        last_command: '/evidence-run',
        last_run_at: '2026-07-13T00:00:00.000Z',
      }),
    );
    expect(setStatus).toHaveBeenNthCalledWith(
      1,
      'evidence-orchestrator',
      'orchestrator:frame:subagent',
    );
    expect(setStatus).toHaveBeenLastCalledWith(
      'evidence-orchestrator',
      'orchestrator:frame',
    );
  });
});
