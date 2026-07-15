import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_STATE } from '../../../iteration/default-state';
import { readState, writeState } from '../../../iteration/state-repository';
import { cleanupWorkspaces, workspace } from '../../../tests/support';
import type { PreparedActivityRun } from './dispatch';
import { executePreparedActivityRun } from './execution';

const runner = vi.hoisted(() => ({ runActivitySubagent: vi.fn() }));
const pairing = vi.hoisted(() => ({
  pairDriverMode: vi.fn(() => undefined),
  capturePairWorktree: vi.fn(() => ({ snapshot: true })),
  completePairDriver: vi.fn(),
  failPairDriver: vi.fn(),
  executePairAction: vi.fn(),
}));
const showcase = vi.hoisted(() => ({
  executeShowcaseQ2: vi.fn(),
  captureShowcaseReviewer: vi.fn(),
  completeShowcaseReviewer: vi.fn(),
}));

vi.mock('../../node/activity-agent-process', () => ({
  runActivitySubagent: runner.runActivitySubagent,
}));
vi.mock('../../../loops/pair/pair-session', () => pairing);
vi.mock('../../../loops/showcase/showcase-session', () => showcase);

function preparation(): PreparedActivityRun {
  return {
    state: DEFAULT_STATE,
    activity: 'kickoff',
    agentName: 'requirements-analyst',
    task: 'Prepare one Kickoff candidate.',
  };
}

afterEach(() => {
  cleanupWorkspaces();
  vi.clearAllMocks();
  pairing.pairDriverMode.mockReturnValue(undefined);
});

describe('activity execution', () => {
  it('surfaces a persisted TQA question as the next dialogue turn', async () => {
    const cwd = workspace();
    const prepared: PreparedActivityRun = {
      state: {
        ...DEFAULT_STATE,
        loop: 'understand',
        understand_stage: 'tqa',
        active_clarification_story: {
          story_id: 'US-001',
          selected_at: '2026-01-01T00:00:00.000Z',
        },
      },
      activity: 'understand',
      agentName: 'requirements-analyst',
      task: 'Clarify US-001.',
    };
    runner.runActivitySubagent.mockImplementation(async () => {
      writeState(cwd, {
        ...readState(cwd),
        pending_clarification: {
          question_id: 'Q-001',
          story_id: 'US-001',
          question: 'Who confirms the model?',
          target: 'history',
          asked_at: '2026-01-01T00:01:00.000Z',
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

    const result = await executePreparedActivityRun(
      { cwd, ui: { setStatus: vi.fn() } },
      prepared,
      { invocation: 'evidence_orchestrator_answer_question' },
    );

    expect(result.output).toContain('Q-001 · US-001');
    expect(result.output).toContain('Who confirms the model?');
  });

  it('passes the explicit bounded role to the child runner', async () => {
    const cwd = workspace();
    runner.runActivitySubagent.mockResolvedValue({
      agent: 'requirements-analyst',
      model: 'openai/test',
      thinking: 'high',
      output: 'Candidate proposed.',
      messages: [],
      exitCode: 0,
      stderr: '',
    });

    await executePreparedActivityRun(
      { cwd, ui: { setStatus: vi.fn() } },
      preparation(),
      { invocation: '/evidence-run' },
    );

    expect(runner.runActivitySubagent).toHaveBeenCalledWith(
      expect.objectContaining({ agentName: 'requirements-analyst' }),
    );
    expect(runner.runActivitySubagent.mock.calls[0][0]).not.toHaveProperty(
      'phase',
    );
  });

  it('executes one deterministic Pair checkpoint without a Driver', async () => {
    const cwd = workspace();
    const prepared = {
      ...preparation(),
      activity: 'pair' as const,
      agentName: undefined,
      pairAction: 'run_red' as const,
    };
    pairing.executePairAction.mockReturnValue({
      state: prepared.state,
      output: 'Observed Red; waiting for Navigator.',
    });

    const result = await executePreparedActivityRun(
      { cwd, ui: { setStatus: vi.fn() } },
      prepared,
      { invocation: '/evidence-run' },
    );

    expect(runner.runActivitySubagent).not.toHaveBeenCalled();
    expect(result.output).toContain('waiting for Navigator');
  });

  it('executes Showcase Q2 without starting Reviewer', async () => {
    const cwd = workspace();
    const prepared = {
      ...preparation(),
      activity: 'showcase' as const,
      agentName: undefined,
      showcaseAction: 'run_q2' as const,
    };
    showcase.executeShowcaseQ2.mockReturnValue({
      state: prepared.state,
      records: [],
      output: 'Given/When/Then observed; Q2 passed.',
    });

    const result = await executePreparedActivityRun(
      { cwd, ui: { setStatus: vi.fn() } },
      prepared,
      { invocation: '/evidence-run' },
    );

    expect(runner.runActivitySubagent).not.toHaveBeenCalled();
    expect(result.output).toContain('Q2 passed');
  });

  it('records one activity invocation and progress', async () => {
    const cwd = workspace();
    const onUpdate = vi.fn();
    runner.runActivitySubagent.mockImplementation(async (options) => {
      options.onUpdate?.({
        agent: 'requirements-analyst',
        model: 'openai/test',
        thinking: 'medium',
        output: 'Inspecting Issue.',
        messages: [],
        exitCode: -1,
        stderr: '',
      });
      return {
        agent: 'requirements-analyst',
        model: 'openai/test',
        thinking: 'medium',
        output: 'Candidate proposed.',
        messages: [],
        exitCode: 0,
        stderr: '',
      };
    });

    const result = await executePreparedActivityRun(
      { cwd, ui: { setStatus: vi.fn() } },
      preparation(),
      {
        invocation: '/evidence-run',
        now: () => '2026-01-01T00:00:00.000Z',
        onUpdate,
      },
    );

    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ activity: 'kickoff', status: 'running' }),
    );
    expect(result).toMatchObject({
      activity: 'kickoff',
      status: 'completed',
    });
    expect(readState(cwd).pi?.last_command).toBe('/evidence-run');
  });
});
