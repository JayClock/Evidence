import { describe, expect, it } from 'vitest';
import { DEFAULT_STATE } from '../../iteration/default-state';
import type { WorkflowState } from '../../iteration/state';
import { testExecutionBudgetEnvelope } from '../../test-support/support';
import {
  commandFailureFingerprint,
  driverFailureFingerprint,
  pairProgressAdvanced,
  pairProgressMarker,
} from './evaluator';

function pairState(): WorkflowState {
  return {
    ...DEFAULT_STATE,
    loop: 'pair',
    tasking_stage: 'approved',
    tasking_candidate: {
      version: 2,
      draft_id: 'DRAFT-001',
      story_id: 'US-001',
      scenario_ids: ['SC-001'],
      tests: [
        {
          id: 'TEST-001',
          quadrant: 'Q1',
          intent: 'First behavior',
          runtime_plan_id: 'RUNTIME-001',
          process_id: 'process',
          step_id: 'step',
          supported_by: [],
          scenario_ids: ['SC-001'],
          business_data: ['one'],
          model_refs: { entities: [], associations: [] },
        },
        {
          id: 'TEST-002',
          quadrant: 'Q2',
          intent: 'Second behavior',
          runtime_plan_id: 'RUNTIME-001',
          process_id: 'process',
          step_id: 'step',
          supported_by: ['TEST-001'],
          scenario_ids: ['SC-001'],
          business_data: ['two'],
          model_refs: { entities: [], associations: [] },
        },
      ],
      tasks: [
        {
          id: 'TASK-001',
          description: 'Implement both behaviors.',
          test_ids: ['TEST-001', 'TEST-002'],
          depends_on: [],
          model_refs: { entities: [], associations: [] },
        },
      ],
      processes: [],
      test_list_path: 'tests.md',
      task_list_path: 'tasks.md',
      candidate_path: 'candidate.json',
      test_list_sha256: 'tests',
      task_list_sha256: 'tasks',
      candidate_sha256: 'candidate',
      proposed_at: '2026-01-01T00:00:00.000Z',
    },
    pair_session: {
      version: 2,
      story_id: 'US-001',
      scenario_ids: ['SC-001'],
      git_baseline: 'baseline',
      checkpoint: 'plan_confirmed',
      task_id: 'TASK-001',
      test_id: 'TEST-001',
      process_id: 'process',
      step_id: 'step',
      completed_task_ids: [],
      completed_test_ids: [],
      completed_step_ids: [],
      test_paths: [],
      production_paths: [],
      expected_red: 'First behavior',
      accepted_reds: [],
      execution_budget: testExecutionBudgetEnvelope(),
      quality_gate_index: 0,
      feedback: [],
      driver_history: [],
    },
  };
}

describe('execution budget convergence evaluation', () => {
  it('hashes the complete command failure and separates changed evidence', () => {
    const input = {
      record: {
        stage: 'green' as const,
        command: 'pnpm test',
        exit_code: 1,
        termination: { kind: 'exit' as const, exit_code: 1 },
        stdout_sha256: 'a'.repeat(64),
        stderr_sha256: 'b'.repeat(64),
      },
      failureKind: 'green',
      currentTest: 'TEST-001',
      changedDiffSha256: 'c'.repeat(64),
    };
    const first = commandFailureFingerprint(input);

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(commandFailureFingerprint(input)).toBe(first);
    expect(
      commandFailureFingerprint({
        ...input,
        record: {
          ...input.record,
          termination: { kind: 'timeout', timeout_ms: 600_000 },
          exit_code: null,
        },
      }),
    ).not.toBe(first);
    expect(
      commandFailureFingerprint({
        ...input,
        changedDiffSha256: 'd'.repeat(64),
      }),
    ).not.toBe(first);
  });

  it('normalizes changed paths for pre-command Driver failures', () => {
    const input = {
      mode: 'implementation' as const,
      taskId: 'TASK-001',
      testId: 'TEST-001',
      blockedReason: 'Driver crossed its path boundary.',
      changedPaths: ['b.ts', 'a.ts', 'a.ts'],
      output: 'blocked output',
    };

    expect(driverFailureFingerprint(input)).toBe(
      driverFailureFingerprint({
        ...input,
        changedPaths: ['a.ts', 'b.ts'],
      }),
    );
    expect(
      driverFailureFingerprint({ ...input, output: 'different output' }),
    ).not.toBe(driverFailureFingerprint(input));
  });

  it('tracks accepted Red and permits rank reset only when milestones advance', () => {
    const state = pairState();
    const plan = pairProgressMarker(state);
    if (!state.pair_session) throw new Error('Missing Pair fixture.');
    const accepted = pairProgressMarker({
      ...state,
      pair_session: {
        ...state.pair_session,
        checkpoint: 'red_observed',
        red_observation: {
          process_id: 'process',
          step_id: 'step',
          task_id: 'TASK-001',
          test_id: 'TEST-001',
          stage: 'red',
          command: 'pnpm test',
          sequence: 1,
          exit_code: 1,
          termination: { kind: 'exit', exit_code: 1 },
          expected_failure: true,
          accepted: true,
        },
      },
    });

    expect(plan.checkpoint_rank).toBe(0);
    expect(accepted.checkpoint_rank).toBe(3);
    expect(pairProgressAdvanced(plan, accepted)).toBe(true);
    expect(
      pairProgressAdvanced(
        {
          completed_test_count: 0,
          completed_step_count: 0,
          quality_gate_index: 0,
          current_work_unit_index: 0,
          checkpoint_rank: 6,
        },
        {
          completed_test_count: 1,
          completed_step_count: 0,
          quality_gate_index: 0,
          current_work_unit_index: 1,
          checkpoint_rank: 0,
        },
      ),
    ).toBe(true);
    expect(pairProgressAdvanced(accepted, plan)).toBe(false);
  });
});
