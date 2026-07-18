import { afterEach, describe, expect, it, vi } from 'vitest';
import { zeroActivityUsage } from '../../../capabilities/activity-observability/activity-usage';
import {
  activityTracePath,
  readActivityTrace,
  validateActivityTrace,
} from '../../../capabilities/activity-observability/trace';
import { DEFAULT_STATE } from '../../../iteration/default-state';
import type {
  PairDeterministicAction,
  PairDriverMode,
  RedFailureKind,
  WorkflowState,
} from '../../../iteration/state';
import { readState, writeState } from '../../../iteration/state-repository';
import * as stateRepository from '../../../iteration/state-repository';
import {
  cleanupWorkspaces,
  initializeGitRepository,
  testExecutionBudgetEnvelope,
  testIntakeSnapshot,
  workspace,
  write,
} from '../../../test-support/support';
import type { PreparedActivityRun } from './dispatch';
import { executePreparedActivityRun } from './execution';

const runner = vi.hoisted(() => ({ runActivityAgent: vi.fn() }));
const pairing = vi.hoisted(() => ({
  pairDriverMode: vi.fn<(state: WorkflowState) => PairDriverMode | undefined>(
    () => undefined,
  ),
  pairDriverWriteRoots: vi.fn(() => ['apps/web']),
  capturePairWorktree: vi.fn(() => ({ snapshot: true })),
  completePairDriver: vi.fn(),
  failPairDriver: vi.fn(),
  executePairAction: vi.fn(),
  pairDeterministicAction: vi.fn<
    (cwd: string, state: WorkflowState) => PairDeterministicAction | undefined
  >(() => undefined),
  buildPairRedReviewTask: vi.fn(() => 'Classify one Red.'),
  parsePairRedReview: vi.fn(() => ({
    failureKind: 'behavior',
    reason: 'The planned assertion reports missing behavior.',
  })),
  recordPairAutomationException: vi.fn(),
  reviewPairRed:
    vi.fn<
      (
        cwd: string,
        kind: RedFailureKind,
        reason: string,
        now?: string,
        reviewedBy?: 'human' | 'red-reviewer',
      ) => WorkflowState
    >(),
  navigatePair: vi.fn(),
  pairNextInstruction: vi.fn(() => '/evidence-run continues automation'),
}));
const showcase = vi.hoisted(() => ({
  executeShowcaseQ2: vi.fn(),
  captureShowcaseReviewer: vi.fn(),
  completeShowcaseReviewer: vi.fn(),
  showcaseNextInstruction: vi.fn(() => '/evidence-run'),
}));

vi.mock('../../node/activity-agent-process', () => ({
  runActivityAgent: runner.runActivityAgent,
  loadActivityAgent: (_cwd: string, name: string) => ({
    name,
    model: 'openai/test',
    thinking: 'medium',
    tools: ['read'],
  }),
}));
vi.mock('../../../loops/pair/pair-session', () => pairing);
vi.mock('../../../loops/showcase/showcase-session', () => showcase);
vi.mock('./task', () => ({
  buildActivityTask: vi.fn(() => 'Continue automated Pair coding.'),
}));

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
  vi.restoreAllMocks();
  pairing.pairDriverMode.mockReturnValue(undefined);
  pairing.pairDeterministicAction.mockReturnValue(undefined);
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
    runner.runActivityAgent.mockImplementation(async () => {
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
    expect(runner.runActivityAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'evidence-iter-0001-us-001-tqa',
      }),
    );
  });

  it('replaces an empty child response with explicit next-step guidance', async () => {
    const cwd = workspace();
    runner.runActivityAgent.mockResolvedValue({
      agent: 'requirements-analyst',
      model: 'openai/test',
      thinking: 'high',
      output: '(no output)',
      messages: [],
      exitCode: 0,
      stderr: '',
    });

    const result = await executePreparedActivityRun(
      { cwd, ui: { setStatus: vi.fn() } },
      preparation(),
      { invocation: '/evidence-run' },
    );

    expect(result.output).not.toContain('(no output)');
    expect(result.output).toContain('活动已完成');
    expect(result.output).toContain('下一步：运行 /evidence-run');
  });

  it('passes the explicit bounded role to the child runner', async () => {
    const cwd = workspace();
    runner.runActivityAgent.mockResolvedValue({
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

    expect(runner.runActivityAgent).toHaveBeenCalledWith(
      expect.objectContaining({ agentName: 'requirements-analyst' }),
    );
    expect(runner.runActivityAgent.mock.calls[0][0]).not.toHaveProperty(
      'phase',
    );
    expect(runner.runActivityAgent.mock.calls[0][0]).not.toHaveProperty(
      'sessionId',
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
      record: { sequence: 7 },
    });

    const result = await executePreparedActivityRun(
      { cwd, ui: { setStatus: vi.fn() } },
      prepared,
      { invocation: '/evidence-run' },
    );

    expect(runner.runActivityAgent).not.toHaveBeenCalled();
    expect(result.output).toContain('waiting for Navigator');
    expect(
      readActivityTrace(activityTracePath(cwd, 'ITER-0001')).at(-1),
    ).toMatchObject({
      agent: 'pair-controller',
      model: 'deterministic',
      execution_record_sequences: [7],
    });
  });

  it('automates all Pair checkpoints and stops once for human Story approval', async () => {
    const cwd = workspace();
    let current = {
      ...DEFAULT_STATE,
      loop: 'pair' as const,
      tasking_stage: 'approved' as const,
      approved_test_plan_path: 'plan.json',
      active_work_item: { story_id: 'US-001' },
      pair_session: {
        version: 2 as const,
        story_id: 'US-001',
        scenario_ids: ['SC-001'],
        git_baseline: 'baseline',
        checkpoint: 'plan_confirmed' as const,
        task_id: 'TASK-001',
        test_id: 'TEST-001',
        process_id: 'process',
        step_id: 'step',
        completed_task_ids: [] as string[],
        completed_test_ids: [] as string[],
        completed_step_ids: [] as string[],
        test_paths: [] as string[],
        production_paths: [] as string[],
        expected_red: 'The behavior is absent.',
        accepted_reds: [],
        execution_budget: testExecutionBudgetEnvelope(),
        quality_gate_index: 0,
        feedback: [],
        driver_history: [],
      },
    } as unknown as WorkflowState;
    const pairSession = () => {
      if (!current.pair_session) throw new Error('Expected Pair session.');
      return current.pair_session;
    };
    vi.spyOn(stateRepository, 'readState').mockImplementation(() => current);
    vi.spyOn(stateRepository, 'writeState').mockImplementation((_cwd, next) => {
      current = next as typeof current;
      return current;
    });
    pairing.pairDriverMode.mockImplementation((state) => {
      const session = state.pair_session;
      if (session?.checkpoint === 'plan_confirmed') return 'test';
      if (
        session?.checkpoint === 'red_observed' &&
        session.red_observation?.accepted
      ) {
        return 'implementation';
      }
      if (session?.checkpoint === 'green_observed') return 'refactor';
      return undefined;
    });
    pairing.pairDeterministicAction.mockImplementation((_cwd, state) => {
      const session = state.pair_session;
      if (session?.checkpoint === 'test_written') return 'run_red';
      if (session?.checkpoint === 'implementation_written') return 'run_green';
      if (session?.checkpoint === 'refactored') {
        return session.completed_test_ids.length
          ? 'run_quality_gate'
          : 'run_refactor';
      }
      return undefined;
    });
    pairing.completePairDriver.mockImplementation(
      (_cwd, mode, _snapshot, output) => {
        const checkpoints = {
          test: 'test_written',
          implementation: 'implementation_written',
          refactor: 'refactored',
        } as const;
        current = {
          ...current,
          pair_session: {
            ...pairSession(),
            checkpoint: checkpoints[mode as keyof typeof checkpoints],
          },
        };
        return {
          state: current,
          blocked: false,
          changedPaths: [],
          diff: '',
          output,
        };
      },
    );
    pairing.executePairAction.mockImplementation((_cwd, action) => {
      if (action === 'run_red') {
        current = {
          ...current,
          pair_session: {
            ...pairSession(),
            checkpoint: 'red_observed',
            red_observation: {
              process_id: 'process',
              step_id: 'step',
              task_id: 'TASK-001',
              test_id: 'TEST-001',
              stage: 'red',
              command: 'test',
              sequence: 1,
              exit_code: 1,
              termination: { kind: 'exit', exit_code: 1 },
              expected_failure: true,
            },
          },
        };
      } else if (action === 'run_green') {
        current = {
          ...current,
          pair_session: {
            ...pairSession(),
            checkpoint: 'green_observed',
          },
        };
      } else if (action === 'run_refactor') {
        current = {
          ...current,
          pair_session: {
            ...pairSession(),
            checkpoint: 'refactored',
            completed_task_ids: ['TASK-001'],
            completed_test_ids: ['TEST-001'],
            completed_step_ids: ['process/step'],
          },
        };
      } else {
        current = {
          ...current,
          pair_session: {
            ...pairSession(),
            checkpoint: 'quality_gates_passed',
          },
        };
      }
      const sequences = {
        run_red: 1,
        run_green: 2,
        run_refactor: 3,
        run_quality_gate: 4,
      } as const;
      return {
        state: current,
        output: String(action),
        record: {
          sequence: sequences[action as keyof typeof sequences],
        },
      };
    });
    pairing.reviewPairRed.mockImplementation(
      (_cwd, kind, reason, _now, reviewedBy) => {
        const redObservation = pairSession().red_observation;
        if (!redObservation) throw new Error('Expected Red observation.');
        current = {
          ...current,
          pair_session: {
            ...pairSession(),
            red_observation: {
              ...redObservation,
              accepted: true,
              failure_kind: kind,
              review_reason: reason,
              reviewed_by: reviewedBy ?? 'red-reviewer',
            },
          },
        };
        return current;
      },
    );
    runner.runActivityAgent.mockImplementation(async ({ agentName }) => ({
      agent: agentName,
      model: 'openai/test',
      requestedModel: 'openai/test',
      actualModel: 'openai/test',
      thinking: 'medium',
      sessionMode: 'ephemeral',
      toolNames: ['read'],
      output:
        agentName === 'red-reviewer'
          ? '{"failureKind":"behavior","reason":"missing behavior"}'
          : `${agentName} completed.`,
      messages: [],
      exitCode: 0,
      stderr: '',
      usage: {
        turns: 1,
        input_tokens: 100,
        output_tokens: 10,
        cache_read_tokens: 80,
        cache_write_tokens: 0,
        cost_usd: 0.01,
        context_tokens_at_end: 110,
      },
      stopReason: 'stop',
      startedAt: '2026-01-01T00:00:00.000Z',
      completedAt: '2026-01-01T00:00:01.000Z',
      durationMs: 1_000,
      toolCallCounts: { read: 1 },
    }));

    const result = await executePreparedActivityRun(
      { cwd, ui: { setStatus: vi.fn() } },
      {
        state: current,
        activity: 'pair',
        agentName: 'test-driver',
        task: 'Start automated Pair.',
      },
      { invocation: '/evidence-run' },
    );

    expect(result).toMatchObject({
      agent: 'pair-automation',
      status: 'completed',
      exitCode: 0,
    });
    expect(result.output).toContain('/evidence-pair approve <reason>');
    expect(result.usage).toEqual({
      turns: 4,
      input_tokens: 400,
      output_tokens: 40,
      cache_read_tokens: 320,
      cache_write_tokens: 0,
      cost_usd: 0.04,
      context_tokens_at_end: 110,
    });
    expect(
      runner.runActivityAgent.mock.calls.map(([options]) => options.agentName),
    ).toEqual([
      'test-driver',
      'red-reviewer',
      'production-driver',
      'production-driver',
    ]);
    expect(
      pairing.executePairAction.mock.calls.map(([, action]) => action),
    ).toEqual(['run_red', 'run_green', 'run_refactor', 'run_quality_gate']);
    expect(pairing.reviewPairRed).toHaveBeenCalledWith(
      cwd,
      'behavior',
      expect.any(String),
      expect.any(String),
      'red-reviewer',
    );

    const trace = validateActivityTrace(
      activityTracePath(cwd, 'ITER-0001'),
      'ITER-0001',
    );
    const starts = trace.filter(({ event }) => event === 'activity_started');
    expect(starts).toHaveLength(9);
    expect(starts[0]).toMatchObject({
      span_id: 'ACT-000001',
      agent: 'pair-automation',
    });
    expect(
      starts
        .slice(1)
        .every(({ parent_span_id }) => parent_span_id === 'ACT-000001'),
    ).toBe(true);
    expect(starts.map(({ agent }) => agent)).toContain('red-reviewer');
    expect(
      trace
        .filter(
          ({ event, agent }) =>
            event === 'activity_finished' && agent === 'pair-controller',
        )
        .map(({ execution_record_sequences }) => execution_record_sequences),
    ).toEqual([[1], [2], [3], [4]]);
    expect(trace.at(-1)).toMatchObject({
      span_id: 'ACT-000001',
      event: 'activity_finished',
      usage: zeroActivityUsage(),
    });
  });

  it('stops Pair immediately with a typed activity timeout exception', async () => {
    const cwd = workspace();
    let current = {
      ...DEFAULT_STATE,
      loop: 'pair' as const,
      tasking_stage: 'approved' as const,
      pair_session: {
        version: 2 as const,
        story_id: 'US-001',
        scenario_ids: ['SC-001'],
        git_baseline: 'baseline',
        checkpoint: 'plan_confirmed' as const,
        task_id: 'TASK-001',
        test_id: 'TEST-001',
        process_id: 'process',
        step_id: 'step',
        completed_task_ids: [] as string[],
        completed_test_ids: [] as string[],
        completed_step_ids: [] as string[],
        test_paths: [] as string[],
        production_paths: [] as string[],
        expected_red: 'The behavior is absent.',
        accepted_reds: [],
        execution_budget: testExecutionBudgetEnvelope(),
        quality_gate_index: 0,
        feedback: [],
        driver_history: [],
      },
    } as unknown as WorkflowState;
    vi.spyOn(stateRepository, 'readState').mockImplementation(() => current);
    vi.spyOn(stateRepository, 'writeState').mockImplementation((_cwd, next) => {
      current = next as typeof current;
      return current;
    });
    pairing.pairDriverMode.mockReturnValue('test');
    pairing.failPairDriver.mockImplementation(() => ({
      state: current,
      blocked: true,
      changedPaths: ['apps/web/tests/example.test.ts'],
      diff: '(restored)',
      output: 'Timed-out Driver changes restored.',
    }));
    runner.runActivityAgent.mockResolvedValue({
      agent: 'test-driver',
      model: 'openai/test',
      requestedModel: 'openai/test',
      actualModel: 'openai/test',
      thinking: 'medium',
      sessionMode: 'ephemeral',
      toolNames: ['read', 'write'],
      output: 'Activity agent test-driver timed out.',
      messages: [],
      exitCode: 1,
      stderr: '',
      usage: zeroActivityUsage(null),
      stopReason: 'timeout',
      errorMessage: 'Activity agent test-driver timed out.',
      startedAt: '2026-01-01T00:00:00.000Z',
      completedAt: '2026-01-01T00:15:00.000Z',
      durationMs: 900_000,
      toolCallCounts: {},
    });

    const result = await executePreparedActivityRun(
      { cwd, ui: { setStatus: vi.fn() } },
      {
        state: current,
        activity: 'pair',
        agentName: 'test-driver',
        task: 'Start automated Pair.',
      },
      { invocation: '/evidence-run' },
    );

    expect(result).toMatchObject({ status: 'failed', stopReason: 'error' });
    expect(pairing.failPairDriver).toHaveBeenCalledOnce();
    expect(pairing.recordPairAutomationException).toHaveBeenCalledWith(
      cwd,
      expect.objectContaining({
        kind: 'activity_timeout',
        triggeringSpanId: 'ACT-000002',
      }),
    );
  });

  it('stops Pair with a typed command timeout before Red review', async () => {
    const cwd = workspace();
    let current = {
      ...DEFAULT_STATE,
      loop: 'pair' as const,
      tasking_stage: 'approved' as const,
      pair_session: {
        version: 2 as const,
        story_id: 'US-001',
        scenario_ids: ['SC-001'],
        git_baseline: 'baseline',
        checkpoint: 'test_written' as const,
        task_id: 'TASK-001',
        test_id: 'TEST-001',
        process_id: 'process',
        step_id: 'step',
        completed_task_ids: [] as string[],
        completed_test_ids: [] as string[],
        completed_step_ids: [] as string[],
        test_paths: ['tests/example.test.ts'],
        production_paths: [] as string[],
        expected_red: 'The behavior is absent.',
        accepted_reds: [],
        execution_budget: testExecutionBudgetEnvelope(),
        quality_gate_index: 0,
        feedback: [],
        driver_history: [],
      },
    } as unknown as WorkflowState;
    const observation = {
      process_id: 'process',
      step_id: 'step',
      task_id: 'TASK-001',
      test_id: 'TEST-001',
      stage: 'red' as const,
      command: 'pnpm test',
      sequence: 1,
      exit_code: null,
      termination: { kind: 'timeout' as const, timeout_ms: 600_000 },
      expected_failure: false,
    };
    vi.spyOn(stateRepository, 'readState').mockImplementation(() => current);
    vi.spyOn(stateRepository, 'writeState').mockImplementation((_cwd, next) => {
      current = next as typeof current;
      return current;
    });
    pairing.pairDeterministicAction.mockReturnValue('run_red');
    pairing.executePairAction.mockImplementation(() => {
      const session = current.pair_session;
      if (!session) throw new Error('Expected Pair session.');
      current = {
        ...current,
        pair_session: {
          ...session,
          checkpoint: 'red_observed',
          red_observation: observation,
          last_observation: observation,
        },
      };
      return {
        state: current,
        output: 'Red command timed out.',
        record: { sequence: 1 },
      };
    });

    await executePreparedActivityRun(
      { cwd, ui: { setStatus: vi.fn() } },
      {
        state: current,
        activity: 'pair',
        pairAction: 'run_red',
        task: 'Run locked Red.',
      },
      { invocation: '/evidence-run' },
    );

    expect(runner.runActivityAgent).not.toHaveBeenCalled();
    expect(pairing.recordPairAutomationException).toHaveBeenCalledWith(
      cwd,
      expect.objectContaining({
        kind: 'command_timeout',
        executionSequence: 1,
        approvedLimit: 600_000,
      }),
    );
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

    expect(runner.runActivityAgent).not.toHaveBeenCalled();
    expect(result.output).toContain('Q2 passed');
  });

  it('completes a legacy method=none expansion deterministically', async () => {
    const cwd = workspace();
    initializeGitRepository(cwd);
    const scenarioPath =
      'artifacts/iterations/ITER-0001/01-requirements/examples/US-001-SC-001.md';
    write(cwd, scenarioPath, '# Scenario');
    const state = {
      ...DEFAULT_STATE,
      intake_snapshot: testIntakeSnapshot(),
      loop: 'understand' as const,
      understand_stage: 'modeling' as const,
      modeling_stage: 'expansion' as const,
      confirmed_scenarios: [
        {
          version: 1 as const,
          story_id: 'US-001',
          scenario_id: 'SC-001',
          source_draft_id: 'DRAFT-001',
          title: 'Change an interaction',
          given: ['The editor is open'],
          when: 'The owner saves the interaction change',
          then: ['The changed interaction is visible'],
          business_data: ['workspace=Alpha'],
          artifact_path: scenarioPath,
          confirmed_by: 'human' as const,
          confirmed_at: '2026-01-01T00:00:00.000Z',
        },
      ],
      modeling_profile: {
        version: 1 as const,
        subject: 'tool' as const,
        method: 'none' as const,
        model_change_required: false,
        confirmed_by: 'human' as const,
        confirmed_at: '2026-01-01T00:01:00.000Z',
      },
    };
    writeState(cwd, state);
    const prepared: PreparedActivityRun = {
      state,
      activity: 'understand',
      modelingAction: 'complete_no_model',
      task: 'Record no model impact.',
    };

    const result = await executePreparedActivityRun(
      { cwd, ui: { setStatus: vi.fn() } },
      prepared,
      {
        invocation: '/evidence-run',
        now: () => '2026-01-01T00:02:00.000Z',
      },
    );

    expect(runner.runActivityAgent).not.toHaveBeenCalled();
    expect(result.output).toContain('no canonical model expansion');
    expect(readState(cwd)).toMatchObject({
      loop: 'tasking',
      modeling_stage: 'model_confirmed',
      tasking_stage: 'drafting',
    });
  });

  it('records one activity invocation and progress', async () => {
    const cwd = workspace();
    const onUpdate = vi.fn();
    runner.runActivityAgent.mockImplementation(async (options) => {
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
    expect(readState(cwd).pi).toEqual({
      last_command: '/evidence-run',
      last_run_at: '2026-01-01T00:00:00.000Z',
    });
    const trace = readActivityTrace(
      activityTracePath(cwd, 'ITER-0001'),
      'ITER-0001',
    );
    expect(trace).toHaveLength(2);
    expect(trace[0]).toMatchObject({
      event: 'activity_started',
      activity: 'kickoff',
      agent: 'requirements-analyst',
      requested_model: 'openai/test',
    });
    expect(trace[1]).toMatchObject({
      event: 'activity_finished',
      status: 'completed',
      actual_model: 'openai/test',
    });
    expect(JSON.stringify(trace)).not.toContain(
      'Prepare one Kickoff candidate.',
    );
  });
});
