import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_STATE } from '../workflow/phase-catalog';
import { readState, writeState } from '../workflow/state-store';
import { cleanupWorkspaces, workspace } from '../tests/support';
import type { PreparedPhaseRun } from './phase-dispatch';
import { executePreparedPhaseRun } from './phase-execution';

const phaseRunnerMocks = vi.hoisted(() => ({ runPhaseSubagent: vi.fn() }));
vi.mock('../subagents/phase-runner', () => ({
  runPhaseSubagent: phaseRunnerMocks.runPhaseSubagent,
}));

afterEach(() => {
  cleanupWorkspaces();
  vi.clearAllMocks();
});

function preparation(
  phase: 'kickoff' | 'discover' = 'kickoff',
): PreparedPhaseRun {
  return {
    state: { ...DEFAULT_STATE, phase },
    phase,
    task: `Run ${phase}.`,
  };
}

describe('phase execution', () => {
  it('surfaces a persisted Discover TQA turn', async () => {
    const cwd = workspace();
    phaseRunnerMocks.runPhaseSubagent.mockImplementation(async () => {
      const state = readState(cwd);
      writeState(cwd, {
        ...state,
        pending_clarification: {
          question_id: 'Q-001',
          story_id: 'US-001',
          thought: '编辑权限仍不清楚。',
          question: '谁可以编辑工作区信息？',
          asked_at: '2026-07-13T00:01:00.000Z',
        },
      });
      return {
        agent: 'requirements-analyst',
        model: 'openai/test',
        thinking: 'medium',
        output: '(no output)',
        messages: [],
        exitCode: 0,
        stderr: '',
      };
    });

    const result = await executePreparedPhaseRun(
      { cwd, ui: { setStatus: vi.fn() } },
      preparation('discover'),
      { invocation: 'evidence_orchestrator_run_phase' },
    );
    expect(result.output).toContain('Q-001 · US-001');
    expect(result.output).toContain('Thought: 编辑权限仍不清楚。');
    expect(result.output).toContain('请由领域专家直接回答');
  });

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
          output: 'Kickoff complete.',
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
      expect.objectContaining({ phase: 'kickoff', status: 'running' }),
    );
    expect(result).toMatchObject({
      phase: 'kickoff',
      status: 'completed',
      output: 'Kickoff complete.',
    });
    expect(readState(cwd).pi).toEqual(
      expect.objectContaining({
        version: 6,
        last_command: '/evidence-run',
        last_run_at: '2026-07-13T00:00:00.000Z',
      }),
    );
    expect(setStatus).toHaveBeenNthCalledWith(
      1,
      'evidence-orchestrator',
      'orchestrator:kickoff:subagent',
    );
    expect(setStatus).toHaveBeenLastCalledWith(
      'evidence-orchestrator',
      'orchestrator:kickoff',
    );
  });
});
