import { describe, expect, it, vi } from 'vitest';
import type { Workspace, WorkspacePair } from '@evidence/server-domain';
import { PairController } from './pair.controller';
import type { ResourceResolver } from './resource-resolver.service';

const sha256 = `sha256:${'a'.repeat(64)}`;

function fixture() {
  const stopped = new Error('stop after port capture');
  const pair = {
    findPair: vi.fn(),
    startPair: vi.fn(async () => Promise.reject(stopped)),
    claimPairLease: vi.fn(async () => Promise.reject(stopped)),
    heartbeatPairLease: vi.fn(async () => Promise.reject(stopped)),
    recordPairDriverAttempt: vi.fn(async () => Promise.reject(stopped)),
    recordPairCommandObservation: vi.fn(async () => Promise.reject(stopped)),
    recordPairRedReview: vi.fn(async () => Promise.reject(stopped)),
    recordPairException: vi.fn(async () => Promise.reject(stopped)),
    decidePair: vi.fn(async () => Promise.reject(stopped)),
  } satisfies WorkspacePair;
  const workspace = { pair: () => pair } as unknown as Workspace;
  const resolver = {
    requireWorkspace: vi.fn(async () => workspace),
    currentUserId: vi.fn(() => 'user-1'),
  } as unknown as ResourceResolver;
  return {
    controller: new PairController(resolver),
    pair,
    stopped,
  };
}

describe('PairController', () => {
  it('starts Pair only from the exact approved plan authority', async () => {
    const { controller, pair, stopped } = fixture();

    await expect(
      controller.startPair('workspace-1', 'iteration-1', {
        expectedIterationVersion: 6,
        approvedTaskingPlanId: 'approved-plan-1',
        approvedTaskingPlanSha256: sha256,
        executorId: 'desktop-1',
      }),
    ).rejects.toBe(stopped);

    expect(pair.startPair).toHaveBeenCalledWith('iteration-1', {
      expectedIterationVersion: 6,
      approvedTaskingPlanId: 'approved-plan-1',
      approvedTaskingPlanSha256: sha256,
      executorId: 'desktop-1',
    });
  });

  it('keeps the opaque lease out of command evidence bodies', async () => {
    const { controller, pair, stopped } = fixture();

    await expect(
      controller.recordCommandObservation(
        'workspace-1',
        'iteration-1',
        'opaque-lease-token',
        {
          pairRunId: 'pair-1',
          actionId: 'ACT-001',
          expectedPairVersion: 3,
          stage: 'red',
          command:
            'pnpm nx test @evidence/desktop --run --testNamePattern=pair',
          termination: 'exited',
          exitCode: 1,
          signal: null,
          durationMs: 20,
          stdoutSha256: sha256,
          stdoutBytes: 100,
          stdoutLines: 3,
          stderrSha256: sha256,
          stderrBytes: 0,
          stderrLines: 0,
          worktreeSha256: sha256,
          diffSha256: sha256,
        },
      ),
    ).rejects.toBe(stopped);

    expect(pair.recordPairCommandObservation).toHaveBeenCalledWith(
      'iteration-1',
      expect.objectContaining({
        pairRunId: 'pair-1',
        actionId: 'ACT-001',
        leaseToken: 'opaque-lease-token',
        termination: 'exited',
        exitCode: 1,
        stdoutBytes: 100,
      }),
    );
  });

  it('records the current user as the Story coding decision actor', async () => {
    const { controller, pair, stopped } = fixture();

    await expect(
      controller.decide('workspace-1', 'iteration-1', {
        expectedPairVersion: 12,
        action: 'approve',
        reason: 'The complete Story increment matches the approved plan.',
        manifestSha256: sha256,
        diffSha256: sha256,
        commitSha: 'b'.repeat(40),
      }),
    ).rejects.toBe(stopped);

    expect(pair.decidePair).toHaveBeenCalledWith(
      'iteration-1',
      expect.objectContaining({
        action: 'approve',
        manifestSha256: sha256,
        commitSha: 'b'.repeat(40),
      }),
      'user-1',
    );
  });
});
