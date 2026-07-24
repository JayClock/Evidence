import { describe, expect, it } from 'vitest';
import { asStore, mockPrismaStore, timestamp } from './test-support';
import { PrismaWorkspaceCodingRuns } from './workspace-coding-runs';

const baseCommitSha = 'a'.repeat(40);
const acceptedCommitSha = 'b'.repeat(40);
const diffSha256 = `sha256:${'c'.repeat(64)}`;

function storyRow(scenarioCount = 1) {
  return {
    id: 'story-1',
    workspaceId: 'workspace-1',
    latestRevisionId: 'revision-2',
    version: 2,
    createdAt: timestamp,
    updatedAt: timestamp,
    latestRevision: {
      id: 'revision-2',
      storyId: 'story-1',
      revisionNumber: 2,
      title: 'Local coding agent',
      problem: 'Source must remain local.',
      role: 'Maintainer',
      goal: 'Run coding locally.',
      value: 'Keep credentials private.',
      cognitiveMode: 'complicated',
      contentSha256: `sha256:${'d'.repeat(64)}`,
      sourceCandidateId: null,
      createdByUserId: 'user-1',
      createdAt: timestamp,
      _count: { scenarios: scenarioCount },
    },
  };
}

function runRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'run-1',
    workspaceId: 'workspace-1',
    storyId: 'story-1',
    storyRevisionId: 'revision-2',
    requestedByUserId: 'user-1',
    status: 'running',
    version: 1,
    baseCommitSha,
    diffSha256: null,
    changedFileCount: null,
    qualityChecks: [],
    commitSha: null,
    failureCode: null,
    failureSummary: null,
    decisionReason: null,
    startedAt: timestamp,
    executionFinishedAt: null,
    decidedByUserId: null,
    decidedAt: null,
    ...overrides,
  };
}

const reviewInput = {
  diffSha256,
  changedFileCount: 2,
  qualityChecks: [
    {
      name: 'pnpm test',
      status: 'passed' as const,
      durationMs: 1200,
      summary: '55 tests passed.',
    },
  ],
};

describe('PrismaWorkspaceCodingRuns', () => {
  it('starts a run for the latest Scenario-bearing Story Revision', async () => {
    const store = mockPrismaStore();
    store.story.findFirst.mockResolvedValue(storyRow());
    store.codingRun.findFirst.mockResolvedValue(null);
    store.codingRun.create.mockResolvedValue(runRow());
    const runs = new PrismaWorkspaceCodingRuns(asStore(store), 'workspace-1');

    const created = await runs.start(
      'story-1',
      { storyRevisionId: 'revision-2', baseCommitSha },
      'user-1',
    );

    expect(created.description()).toMatchObject({
      status: 'running',
      version: 1,
      baseCommitSha,
      storyRevision: { value: 'revision-2' },
    });
    expect(store.story.findFirst).toHaveBeenCalledWith({
      where: { id: 'story-1', workspaceId: 'workspace-1' },
      include: {
        latestRevision: {
          include: { _count: { select: { scenarios: true } } },
        },
      },
    });
    expect(store.codingRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: 'workspace-1',
        storyId: 'story-1',
        storyRevisionId: 'revision-2',
        requestedByUserId: 'user-1',
        status: 'running',
      }),
    });
  });

  it('rejects candidate-only and stale Story Revisions', async () => {
    const store = mockPrismaStore();
    const runs = new PrismaWorkspaceCodingRuns(asStore(store), 'workspace-1');
    store.story.findFirst.mockResolvedValue(storyRow(0));

    await expect(
      runs.start(
        'story-1',
        { storyRevisionId: 'revision-2', baseCommitSha },
        'user-1',
      ),
    ).rejects.toMatchObject({ kind: 'validation' });

    store.story.findFirst.mockResolvedValue(storyRow(1));
    await expect(
      runs.start(
        'story-1',
        { storyRevisionId: 'revision-1', baseCommitSha },
        'user-1',
      ),
    ).rejects.toMatchObject({ kind: 'conflict' });
    expect(store.codingRun.create).not.toHaveBeenCalled();
  });

  it('prevents another active run for the same revision', async () => {
    const store = mockPrismaStore();
    store.story.findFirst.mockResolvedValue(storyRow());
    store.codingRun.findFirst.mockResolvedValue(runRow());
    const runs = new PrismaWorkspaceCodingRuns(asStore(store), 'workspace-1');

    await expect(
      runs.start(
        'story-1',
        { storyRevisionId: 'revision-2', baseCommitSha },
        'user-1',
      ),
    ).rejects.toMatchObject({ kind: 'conflict' });
  });

  it('submits bounded review facts with optimistic versioning', async () => {
    const store = mockPrismaStore();
    store.codingRun.findFirst
      .mockResolvedValueOnce(runRow())
      .mockResolvedValueOnce(
        runRow({
          status: 'review_required',
          version: 2,
          diffSha256,
          changedFileCount: 2,
          qualityChecks: reviewInput.qualityChecks,
          executionFinishedAt: timestamp,
        }),
      );
    store.codingRun.updateMany.mockResolvedValue({ count: 1 });
    const runs = new PrismaWorkspaceCodingRuns(asStore(store), 'workspace-1');

    const review = await runs.submitForReview('run-1', 1, reviewInput);

    expect(review.description()).toMatchObject({
      status: 'review_required',
      version: 2,
      diffSha256,
      changedFileCount: 2,
    });
    expect(store.codingRun.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'run-1',
        workspaceId: 'workspace-1',
        status: 'running',
        version: 1,
      },
      data: expect.objectContaining({
        status: 'review_required',
        diffSha256,
        version: { increment: 1 },
      }),
    });
  });

  it('returns the same review when the controller retries it', async () => {
    const store = mockPrismaStore();
    store.codingRun.findFirst.mockResolvedValue(
      runRow({
        status: 'review_required',
        version: 2,
        diffSha256,
        changedFileCount: 2,
        qualityChecks: reviewInput.qualityChecks,
        executionFinishedAt: timestamp,
      }),
    );
    const runs = new PrismaWorkspaceCodingRuns(asStore(store), 'workspace-1');

    await expect(
      runs.submitForReview('run-1', 1, reviewInput),
    ).resolves.toMatchObject({});
    expect(store.codingRun.updateMany).not.toHaveBeenCalled();
  });

  it('accepts only the reviewed diff and records the local commit SHA', async () => {
    const store = mockPrismaStore();
    store.codingRun.findFirst
      .mockResolvedValueOnce(
        runRow({
          status: 'review_required',
          version: 2,
          diffSha256,
          changedFileCount: 2,
          qualityChecks: reviewInput.qualityChecks,
          executionFinishedAt: timestamp,
        }),
      )
      .mockResolvedValueOnce(
        runRow({
          status: 'accepted',
          version: 3,
          diffSha256,
          changedFileCount: 2,
          qualityChecks: reviewInput.qualityChecks,
          commitSha: acceptedCommitSha,
          executionFinishedAt: timestamp,
          decidedByUserId: 'user-1',
          decidedAt: timestamp,
        }),
      );
    store.codingRun.updateMany.mockResolvedValue({ count: 1 });
    const runs = new PrismaWorkspaceCodingRuns(asStore(store), 'workspace-1');

    const accepted = await runs.accept(
      'run-1',
      2,
      { diffSha256, commitSha: acceptedCommitSha },
      'user-1',
    );

    expect(accepted.description()).toMatchObject({
      status: 'accepted',
      commitSha: acceptedCommitSha,
      decidedBy: { value: 'user-1' },
    });
  });

  it('rejects a stale transition without mutating the run', async () => {
    const store = mockPrismaStore();
    store.codingRun.findFirst.mockResolvedValue(runRow());
    store.codingRun.updateMany.mockResolvedValue({ count: 0 });
    const runs = new PrismaWorkspaceCodingRuns(asStore(store), 'workspace-1');

    await expect(runs.cancel('run-1', 2)).rejects.toMatchObject({
      kind: 'conflict',
    });
  });
});
