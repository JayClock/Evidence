import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_STATE } from '../workflow/phase-catalog';
import { readState, writeState } from '../workflow/state-store';
import { cleanupWorkspaces, workspace } from '../tests/support';
import type { PreparedPhaseRun } from './phase-dispatch';
import { executePreparedPhaseRun } from './phase-execution';

const phaseRunnerMocks = vi.hoisted(() => ({
  runPhaseSubagent: vi.fn(),
}));
const pairingMocks = vi.hoisted(() => ({
  pairDriverMode: vi.fn(() => undefined),
  capturePairWorktree: vi.fn(() => ({ snapshot: true })),
  completePairDriver: vi.fn(),
  failPairDriver: vi.fn(),
  executePairAction: vi.fn(),
}));
const showcaseMocks = vi.hoisted(() => ({
  executeShowcaseQ2: vi.fn(),
  captureShowcaseReviewer: vi.fn(),
  completeShowcaseReviewer: vi.fn(),
}));

vi.mock('../subagents/phase-runner', () => ({
  runPhaseSubagent: phaseRunnerMocks.runPhaseSubagent,
}));
vi.mock('../testing/pairing', () => pairingMocks);
vi.mock('../testing/showcase', () => showcaseMocks);

afterEach(() => {
  cleanupWorkspaces();
  vi.clearAllMocks();
  pairingMocks.pairDriverMode.mockReturnValue(undefined);
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

  it('executes one deterministic Pair checkpoint without starting a Driver', async () => {
    const cwd = workspace();
    const pairPreparation: PreparedPhaseRun = {
      ...preparation(),
      phase: 'coding',
      pairAction: 'run_red',
      task: 'Run one Red.',
    };
    pairingMocks.executePairAction.mockReturnValue({
      state: pairPreparation.state,
      output: 'Observed Red; waiting for Navigator.',
    });

    const result = await executePreparedPhaseRun(
      { cwd, ui: { setStatus: vi.fn() } },
      pairPreparation,
      { invocation: '/evidence-run' },
    );

    expect(phaseRunnerMocks.runPhaseSubagent).not.toHaveBeenCalled();
    expect(pairingMocks.executePairAction).toHaveBeenCalledWith(cwd, 'run_red');
    expect(result.output).toContain('waiting for Navigator');
  });

  it('executes selected Showcase Q2 without starting the Reviewer', async () => {
    const cwd = workspace();
    const showcasePreparation: PreparedPhaseRun = {
      ...preparation(),
      phase: 'review',
      showcaseAction: 'run_q2',
      task: 'Observe selected Q2.',
    };
    showcaseMocks.executeShowcaseQ2.mockReturnValue({
      state: showcasePreparation.state,
      records: [],
      output: 'Given/When/Then observed; Q2 passed.',
    });

    const result = await executePreparedPhaseRun(
      { cwd, ui: { setStatus: vi.fn() } },
      showcasePreparation,
      { invocation: '/evidence-run' },
    );

    expect(phaseRunnerMocks.runPhaseSubagent).not.toHaveBeenCalled();
    expect(showcaseMocks.executeShowcaseQ2).toHaveBeenCalledWith(cwd);
    expect(result.output).toContain('Q2 passed');
  });

  it('runs one Pair Driver then returns its guarded diff to the parent', async () => {
    const cwd = workspace();
    const pairPreparation: PreparedPhaseRun = {
      ...preparation(),
      phase: 'coding',
      agentName: 'test-driver',
      task: 'Write one test.',
    };
    pairingMocks.pairDriverMode.mockReturnValue('test');
    pairingMocks.completePairDriver.mockReturnValue({
      state: pairPreparation.state,
      blocked: false,
      changedPaths: ['apps/web/tests/example.test.ts'],
      diff: '+ expected behavior',
      output: 'Changed paths and diff; waiting for Navigator.',
    });
    phaseRunnerMocks.runPhaseSubagent.mockResolvedValue({
      agent: 'test-driver',
      model: 'openai/test',
      thinking: 'medium',
      output: 'Added the expected assertion.',
      messages: [],
      exitCode: 0,
      stderr: '',
    });

    const result = await executePreparedPhaseRun(
      { cwd, ui: { setStatus: vi.fn() } },
      pairPreparation,
      { invocation: '/evidence-run' },
    );

    expect(pairingMocks.capturePairWorktree).toHaveBeenCalledOnce();
    expect(pairingMocks.completePairDriver).toHaveBeenCalledOnce();
    expect(result.output).toContain('Added the expected assertion');
    expect(result.output).toContain('Changed paths and diff');
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
