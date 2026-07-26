import { describe, expect, it } from 'vitest';
import {
  parsePairDriverEvent,
  parsePairDriverRuntimeRequest,
} from './pair-agent-protocol';

const sha256 = `sha256:${'a'.repeat(64)}`;

function request() {
  return {
    id: 'driver-1',
    role: 'test',
    mode: 'write_test',
    worktreeRoot: '/tmp/evidence/iteration-1',
    timeoutMs: 300_000,
    authority: {
      pairRunId: 'pair-1',
      approvedTaskingPlanSha256: sha256,
      storyRevisionSha256: sha256,
      baseCommitSha: 'b'.repeat(40),
    },
    story: {
      reference: 'US-001',
      title: 'Execute Pair',
      problem: 'Coding lacks controlled evidence.',
      role: 'Delivery lead',
      goal: 'Review one complete increment.',
      value: 'Authority remains explicit.',
    },
    workUnit: {
      index: 0,
      stepKey: 'RUNTIME-001:electron-shell-q1',
      task: { id: 'TASK-001', description: 'Drive one TEST.' },
      test: {
        id: 'TEST-001',
        quadrant: 'Q1',
        intent: 'Pair reaches a behavior Red.',
        scenarioIds: ['SC-001'],
        scenarioOutcome: null,
        businessData: ['US-001'],
      },
      process: {
        processId: 'typescript-electron-shell',
        runtimePlanId: 'RUNTIME-001',
      },
      step: {
        id: 'electron-shell-q1',
        purpose: 'Drive the local shell behavior.',
        red: {
          expectedFailureKind: 'behavior',
          expectedFailure: 'The assertion fails for missing behavior.',
        },
        greenDoneWhen: 'The focused TEST passes.',
        refactorDoneWhen: 'The boundary is clear.',
      },
    },
    allowedTestRoots: ['apps/desktop/src'],
    allowedProductionRoots: [],
    frozenTestPaths: [],
    diagnostic: null,
  };
}

describe('Pair Agent protocol', () => {
  it('parses one bounded Driver request without Server credentials', () => {
    expect(parsePairDriverRuntimeRequest(request())).toMatchObject({
      role: 'test',
      mode: 'write_test',
      authority: { pairRunId: 'pair-1' },
      workUnit: { test: { id: 'TEST-001' } },
      allowedTestRoots: ['apps/desktop/src'],
    });
  });

  it('rejects mismatched roles, unsafe roots, and unbounded diagnostics', () => {
    expect(() =>
      parsePairDriverRuntimeRequest({
        ...request(),
        role: 'production',
        mode: 'write_test',
      }),
    ).toThrow('cannot run');
    expect(() =>
      parsePairDriverRuntimeRequest({
        ...request(),
        allowedTestRoots: ['../outside'],
      }),
    ).toThrow('non-relative');
    expect(() =>
      parsePairDriverRuntimeRequest({
        ...request(),
        diagnostic: {
          stage: 'green',
          summary: 'Failed Green.',
          stdout: 'x'.repeat(51 * 1024),
          stderr: '',
        },
      }),
    ).toThrow('stdout');
  });

  it('accepts only one structured Driver completion event', () => {
    expect(
      parsePairDriverEvent({
        id: 'driver-1',
        event: 'complete',
        data: '',
        details: {
          summary: 'Added one focused TEST.',
          agentCallCount: 1,
        },
      }),
    ).toMatchObject({ event: 'complete', details: { agentCallCount: 1 } });
    expect(
      parsePairDriverEvent({
        id: 'driver-1',
        event: 'complete',
        data: '',
        details: { summary: 'Claimed success.', agentCallCount: 2 },
      }),
    ).toBeNull();
  });
});
