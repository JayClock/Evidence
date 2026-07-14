import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_STATE } from '../workflow/phase-catalog';
import { readState, writeState } from '../workflow/state-store';
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
  it('surfaces a persisted TQA question as the next dialogue turn', async () => {
    const cwd = workspace();
    const clarifyPreparation: PreparedPhaseRun = {
      ...preparation(),
      state: {
        ...preparation().state,
        phase: 'clarify',
        active_clarification_story: {
          story_id: 'US-001',
          selected_at: '2026-07-13T00:00:00.000Z',
        },
      },
      phase: 'clarify',
      task: 'Clarify US-001.',
    };
    phaseRunnerMocks.runPhaseSubagent.mockImplementation(async () => {
      const state = readState(cwd);
      writeState(cwd, {
        ...state,
        pending_clarification: {
          question_id: 'Q-001',
          story_id: 'US-001',
          question: '谁可以编辑工作区信息？',
          target: 'history',
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
      clarifyPreparation,
      { invocation: 'evidence_orchestrator_select_story' },
    );

    expect(result.output).toContain('Q-001 · US-001');
    expect(result.output).toContain('谁可以编辑工作区信息？');
    expect(result.output).toContain('请直接回复');
  });

  it('surfaces an AI outcome proposal as a human-only decision', async () => {
    const cwd = workspace();
    const clarifyPreparation: PreparedPhaseRun = {
      ...preparation(),
      state: {
        ...preparation().state,
        phase: 'clarify',
        active_clarification_story: {
          story_id: 'US-001',
          selected_at: '2026-07-13T00:00:00.000Z',
        },
      },
      phase: 'clarify',
      task: 'Clarify US-001.',
    };
    phaseRunnerMocks.runPhaseSubagent.mockImplementation(async () => {
      const state = readState(cwd);
      writeState(cwd, {
        ...state,
        proposed_clarification_story_outcome: {
          story_id: 'US-001',
          outcome: 'clarified',
          summary: '业务边界已经明确。',
          proposed_at: '2026-07-13T00:01:00.000Z',
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
      clarifyPreparation,
      { invocation: 'evidence_orchestrator_select_story' },
    );

    expect(result.output).toContain('AI 建议');
    expect(result.output).toContain('US-001');
    expect(result.output).toContain('/evidence-story-complete');
  });

  it('passes an explicit isolated agent override to the phase runner', async () => {
    const cwd = workspace();
    phaseRunnerMocks.runPhaseSubagent.mockResolvedValue({
      agent: 'model-challenger',
      model: 'openai/test',
      thinking: 'high',
      output: 'Challenge recorded.',
      messages: [],
      exitCode: 0,
      stderr: '',
    });
    const challengerPreparation: PreparedPhaseRun = {
      ...preparation(),
      phase: 'domain_model',
      agentName: 'model-challenger',
      task: 'Challenge the candidate model.',
    };

    await executePreparedPhaseRun(
      { cwd, ui: { setStatus: vi.fn() } },
      challengerPreparation,
      { invocation: '/evidence-run' },
    );

    expect(phaseRunnerMocks.runPhaseSubagent).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'domain_model',
        agentName: 'model-challenger',
      }),
    );
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
