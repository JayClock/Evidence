import { describe, expect, it } from 'vitest';
import {
  parsePairRedReviewerEvent,
  parsePairRedReviewerRuntimeRequest,
} from './pair-red-reviewer-protocol';

const sha256 = `sha256:${'a'.repeat(64)}`;

function request() {
  return {
    id: 'review-1',
    timeoutMs: 120_000,
    test: {
      id: 'TEST-001',
      intent: 'Pair reaches one behavior assertion.',
      scenarioOutcome: null,
    },
    expectedRed: {
      kind: 'behavior',
      failure: 'The assertion fails because behavior is absent.',
    },
    observation: {
      termination: 'exited',
      exitCode: 1,
      stdout: 'expected true to be false\n',
      stderr: '',
      stdoutSha256: sha256,
      stderrSha256: sha256,
    },
  };
}

describe('Pair Red Reviewer protocol', () => {
  it('accepts only a normal non-zero command observation', () => {
    expect(parsePairRedReviewerRuntimeRequest(request())).toMatchObject({
      test: { id: 'TEST-001' },
      expectedRed: { kind: 'behavior' },
      observation: { termination: 'exited', exitCode: 1 },
    });
    expect(() =>
      parsePairRedReviewerRuntimeRequest({
        ...request(),
        observation: { ...request().observation, exitCode: 0 },
      }),
    ).toThrow('non-zero');
    expect(() =>
      parsePairRedReviewerRuntimeRequest({
        ...request(),
        observation: {
          ...request().observation,
          termination: 'timed_out',
        },
      }),
    ).toThrow('termination');
  });

  it('bounds local diagnostics before they reach the independent session', () => {
    expect(() =>
      parsePairRedReviewerRuntimeRequest({
        ...request(),
        observation: {
          ...request().observation,
          stdout: 'x'.repeat(51 * 1024),
        },
      }),
    ).toThrow('stdout');
  });

  it('accepts one structured independent classification event', () => {
    expect(
      parsePairRedReviewerEvent({
        id: 'review-1',
        event: 'complete',
        data: '',
        details: {
          classification: 'behavior',
          reason: 'The focused assertion was reached for missing behavior.',
          agentCallCount: 1,
        },
      }),
    ).toMatchObject({
      event: 'complete',
      details: { classification: 'behavior', agentCallCount: 1 },
    });
    expect(
      parsePairRedReviewerEvent({
        id: 'review-1',
        event: 'complete',
        data: '',
        details: {
          classification: 'success',
          reason: 'Invalid.',
          agentCallCount: 1,
        },
      }),
    ).toBeNull();
  });
});
