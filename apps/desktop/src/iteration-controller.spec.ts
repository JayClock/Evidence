import { describe, expect, it, vi } from 'vitest';
import { IterationController } from './iteration-controller';
import type {
  RemoteInboxCandidate,
  RemoteIteration,
} from './intake-api-client';
import type { WorkspaceBinding } from './capabilities/workspace-binding/store';

const apiBaseUrl = 'https://evidence.example/api';
const repositoryRoot = '/Users/private/repository';
const baseCommitSha = 'a'.repeat(40);
const candidateSha256 = `sha256:${'b'.repeat(64)}`;

function candidate(status: RemoteInboxCandidate['status'] = 'ready') {
  return {
    id: 'candidate-1',
    reference: 'CAND-0001',
    status,
    contentSha256: candidateSha256,
    links: {
      select: '/api/workspaces/workspace-1/story-candidates/candidate-1/select',
    },
    raw: {},
  } satisfies RemoteInboxCandidate;
}

function iteration(
  lifecycle: RemoteIteration['lifecycle'] = 'provisioning',
  version = 1,
): RemoteIteration {
  return {
    id: 'iteration-1',
    reference: 'ITER-0001',
    lifecycle,
    loop: 'kickoff',
    stage: 'candidate_review',
    version,
    baseCommitSha,
    branchName: lifecycle === 'active' ? 'evidence/iter-iteration-1' : null,
    links: {
      'complete-provisioning':
        '/api/workspaces/workspace-1/iterations/iteration-1/provisioning/complete',
      'fail-provisioning':
        '/api/workspaces/workspace-1/iterations/iteration-1/provisioning/fail',
    },
    raw: {},
  };
}

function fixture(
  options: { candidateStatus?: RemoteInboxCandidate['status'] } = {},
) {
  const bindings = {
    find: vi.fn(
      async (): Promise<WorkspaceBinding | null> => ({
        apiBaseUrl,
        workspaceId: 'workspace-1',
        repositoryRoot,
        boundAt: '2026-01-01T00:00:00.000Z',
      }),
    ),
  };
  const worktrees = {
    prepare: vi.fn(async () => ({
      iterationId: 'iteration-1',
      repositoryRoot,
      worktreeRoot: '/Users/private/worktrees/iteration-1',
      branchName: 'evidence/iter-iteration-1',
      baseCommitSha,
    })),
  };
  const client = {
    getCandidate: vi.fn(async () =>
      candidate(options.candidateStatus ?? 'ready'),
    ),
    selectCandidate: vi.fn(async () => iteration()),
    completeProvisioning: vi.fn(async () => iteration('active', 2)),
    failProvisioning: vi.fn(async () => iteration('provisioning_failed', 2)),
  };
  const resolveGitHead = vi.fn(async () => baseCommitSha);
  return {
    controller: new IterationController(
      apiBaseUrl,
      bindings,
      worktrees,
      client,
      resolveGitHead,
    ),
    bindings,
    worktrees,
    client,
    resolveGitHead,
  };
}

describe('IterationController', () => {
  it('selects at local HEAD and reports only bounded provisioning facts', async () => {
    const { controller, client, worktrees } = fixture();

    const result = await controller.start({
      id: 'start:1',
      workspaceId: 'workspace-1',
      candidateId: 'candidate-1',
    });

    expect(client.selectCandidate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'candidate-1', status: 'ready' }),
      baseCommitSha,
      expect.any(AbortSignal),
    );
    expect(worktrees.prepare).toHaveBeenCalledWith({
      iterationId: 'iteration-1',
      repositoryRoot,
      baseCommitSha,
      signal: expect.any(AbortSignal),
    });
    expect(client.completeProvisioning).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'iteration-1' }),
      'evidence/iter-iteration-1',
      expect.any(AbortSignal),
    );
    expect(result).toEqual({
      iterationId: 'iteration-1',
      reference: 'ITER-0001',
      lifecycle: 'active',
      branchName: 'evidence/iter-iteration-1',
      baseCommitSha,
    });
    expect(JSON.stringify(result)).not.toContain(repositoryRoot);
    expect(JSON.stringify(result)).not.toContain('worktrees');
  });

  it('records a sanitized provisioning failure without releasing authority', async () => {
    const { controller, client, worktrees } = fixture();
    worktrees.prepare.mockRejectedValueOnce(
      new Error(`Cannot create ${repositoryRoot}/private-worktree`),
    );

    await expect(
      controller.start({
        id: 'start:2',
        workspaceId: 'workspace-1',
        candidateId: 'candidate-1',
      }),
    ).rejects.toThrow(repositoryRoot);

    expect(client.failProvisioning).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'iteration-1' }),
      'Desktop could not create the isolated Iteration worktree.',
      expect.any(AbortSignal),
    );
    expect(JSON.stringify(client.failProvisioning.mock.calls)).not.toContain(
      repositoryRoot,
    );
  });

  it('does not select stale Candidates or unbound Workspaces', async () => {
    const stale = fixture({ candidateStatus: 'stale' });
    await expect(
      stale.controller.start({
        id: 'start:3',
        workspaceId: 'workspace-1',
        candidateId: 'candidate-1',
      }),
    ).rejects.toThrow('is stale');
    expect(stale.client.selectCandidate).not.toHaveBeenCalled();

    const unbound = fixture();
    unbound.bindings.find.mockResolvedValueOnce(null);
    await expect(
      unbound.controller.start({
        id: 'start:4',
        workspaceId: 'workspace-1',
        candidateId: 'candidate-1',
      }),
    ).rejects.toThrow('must be bound');
    expect(unbound.client.getCandidate).not.toHaveBeenCalled();
  });
});
