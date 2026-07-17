import { afterEach, describe, expect, it } from 'vitest';
import {
  cleanupWorkspaces,
  workspace,
  write,
} from '../../test-support/support';
import {
  EXECUTION_BUDGET_POLICY_PATH,
  assertExecutionBudgetEnvelopeActivated,
  createExecutionBudgetEnvelope,
  executionBudgetEnvelopeMode,
  parseExecutionBudgetPolicy,
  readExecutionBudgetPolicy,
  type ExecutionBudgetPolicy,
} from './policy';

const validPolicy = (): ExecutionBudgetPolicy => ({
  version: 1,
  activity: { timeout_ms: 900_000 },
  command: { timeout_ms: 600_000 },
  pair: {
    emergency_max_checkpoints: 200,
    max_retries_per_failure_fingerprint: 2,
    max_no_progress_checkpoints: null,
    extra_agent_call_ratio: null,
  },
  iteration: {
    soft_ratio: 0.8,
    max_duration_ms: null,
    max_input_tokens: null,
    max_output_tokens: null,
    max_reported_cost_usd: null,
  },
});

afterEach(cleanupWorkspaces);

describe('execution budget policy', () => {
  it('strictly rejects unknown fields, missing fields, null misuse, and unsafe values', () => {
    expect(() =>
      parseExecutionBudgetPolicy({ ...validPolicy(), surprise: true }),
    ).toThrow('fields must be exactly');
    const missing = validPolicy() as unknown as Record<string, unknown>;
    delete (missing.activity as Record<string, unknown>).timeout_ms;
    expect(() => parseExecutionBudgetPolicy(missing)).toThrow(
      'activity budget fields',
    );

    expect(() =>
      parseExecutionBudgetPolicy({
        ...validPolicy(),
        activity: { timeout_ms: null },
      }),
    ).toThrow('activity.timeout_ms');
    expect(() =>
      parseExecutionBudgetPolicy({
        ...validPolicy(),
        command: { timeout_ms: -1 },
      }),
    ).toThrow('command.timeout_ms');
    expect(() =>
      parseExecutionBudgetPolicy({
        ...validPolicy(),
        pair: {
          ...validPolicy().pair,
          emergency_max_checkpoints: 10_001,
        },
      }),
    ).toThrow('pair.emergency_max_checkpoints');
    for (const softRatio of [0, 1, -0.1, 1.1]) {
      expect(() =>
        parseExecutionBudgetPolicy({
          ...validPolicy(),
          iteration: { ...validPolicy().iteration, soft_ratio: softRatio },
        }),
      ).toThrow('iteration.soft_ratio');
    }
  });

  it('hashes the exact human-owned policy and snapshots its values', () => {
    const cwd = workspace();
    const policy = validPolicy();
    write(cwd, EXECUTION_BUDGET_POLICY_PATH, `${JSON.stringify(policy)}\n`);

    const first = readExecutionBudgetPolicy(cwd);
    const envelope = createExecutionBudgetEnvelope(first, {
      testCount: 3,
      selectedProcessStepCount: 2,
      approvedAt: '2026-01-01T00:00:00.000Z',
    });
    write(
      cwd,
      EXECUTION_BUDGET_POLICY_PATH,
      `${JSON.stringify({
        ...policy,
        activity: { timeout_ms: 1_000 },
      })}\n`,
    );
    const changed = readExecutionBudgetPolicy(cwd);

    expect(first.path).toBe(EXECUTION_BUDGET_POLICY_PATH);
    expect(changed.sha256).not.toBe(first.sha256);
    expect(envelope).toMatchObject({
      policy_sha256: first.sha256,
      activity_timeout_ms: 900_000,
      command_timeout_ms: 600_000,
      expected_pair_agent_calls: 11,
      max_pair_agent_calls: null,
      emergency_max_checkpoints: 200,
    });
    expect(executionBudgetEnvelopeMode(envelope)).toBe('shadow');
    expect(() => assertExecutionBudgetEnvelopeActivated(envelope)).toThrow(
      'shadow-only',
    );
  });

  it('derives an enforced agent-call ceiling only from an approved ratio', () => {
    const cwd = workspace();
    const policy = validPolicy();
    policy.pair.extra_agent_call_ratio = 0.5;
    policy.pair.max_no_progress_checkpoints = 4;
    policy.iteration = {
      soft_ratio: 0.8,
      max_duration_ms: 3_600_000,
      max_input_tokens: 100_000,
      max_output_tokens: 20_000,
      max_reported_cost_usd: 10,
    };
    write(cwd, EXECUTION_BUDGET_POLICY_PATH, JSON.stringify(policy));

    const envelope = createExecutionBudgetEnvelope(
      readExecutionBudgetPolicy(cwd),
      {
        testCount: 2,
        selectedProcessStepCount: 1,
        approvedAt: '2026-01-01T00:00:00.000Z',
      },
    );

    expect(envelope.expected_pair_agent_calls).toBe(7);
    expect(envelope.max_pair_agent_calls).toBe(11);
    expect(executionBudgetEnvelopeMode(envelope)).toBe('enforced');
    expect(() =>
      assertExecutionBudgetEnvelopeActivated(envelope),
    ).not.toThrow();
  });
});
