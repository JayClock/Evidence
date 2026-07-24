import { describe, expect, it } from 'vitest';
import type {
  StoryCandidateInput,
  StoryRevisionInput,
} from '@evidence/server-domain';
import {
  hashStoryCandidateInput,
  hashStoryRevisionInput,
} from '../story-content';
import { asStore, mockPrismaStore, timestamp } from './test-support';
import { PrismaWorkspaceDelivery } from './workspace-delivery';

const inboxHash = `sha256:${'a'.repeat(64)}`;
const candidateInput: StoryCandidateInput = {
  title: 'Local coding agent',
  problem: 'Hosted services must not receive local source code.',
  role: 'Workspace maintainer',
  goal: 'Run coding work in an isolated local worktree.',
  value: 'Source and credentials remain local.',
  cognitiveMode: 'complicated',
  citations: [
    {
      inboxItemId: 'inbox-1',
      inboxRevisionId: 'inbox-revision-1',
      contentSha256: inboxHash,
      locator: 'whole-source',
    },
  ],
};
const revisionInput: StoryRevisionInput = {
  ...candidateInput,
  scenarios: [
    {
      title: 'Create an isolated worktree',
      given: ['The Workspace is bound to an accessible Git repository.'],
      when: 'The user confirms a Coding Run.',
      then: [
        'A dedicated branch and worktree are created.',
        'The primary working tree is unchanged.',
      ],
    },
  ],
};

function inboxRevisionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inbox-revision-1',
    inboxItemId: 'inbox-1',
    revisionNumber: 3,
    title: 'Local coding agent',
    body: 'Run Pi locally.',
    contentType: 'text/markdown',
    uri: null,
    providerMetadata: {},
    sourceUpdatedAt: null,
    capturedAt: timestamp,
    contentSha256: inboxHash,
    ...overrides,
  };
}

function candidateCitationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'candidate-citation-1',
    candidateId: 'candidate-1',
    inboxRevisionId: 'inbox-revision-1',
    position: 0,
    locator: 'whole-source',
    inboxRevision: inboxRevisionRow(),
    ...overrides,
  };
}

function candidateRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'candidate-1',
    workspaceId: 'workspace-1',
    ...candidateInput,
    contentSha256: hashStoryCandidateInput(candidateInput).contentSha256,
    status: 'pending',
    version: 1,
    proposedByUserId: 'user-1',
    proposedAt: timestamp,
    decidedByUserId: null,
    decidedAt: null,
    citations: [candidateCitationRow()],
    confirmedRevision: null,
    ...overrides,
  };
}

function storyRevisionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'story-revision-1',
    storyId: 'story-1',
    revisionNumber: 1,
    title: candidateInput.title,
    problem: candidateInput.problem,
    role: candidateInput.role,
    goal: candidateInput.goal,
    value: candidateInput.value,
    cognitiveMode: candidateInput.cognitiveMode,
    contentSha256: hashStoryCandidateInput(candidateInput).contentSha256,
    sourceCandidateId: 'candidate-1',
    createdByUserId: 'user-1',
    createdAt: timestamp,
    citations: [
      {
        id: 'story-citation-1',
        storyRevisionId: 'story-revision-1',
        inboxRevisionId: 'inbox-revision-1',
        position: 0,
        locator: 'whole-source',
        inboxRevision: inboxRevisionRow(),
      },
    ],
    scenarios: [],
    ...overrides,
  };
}

function storyRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'story-1',
    workspaceId: 'workspace-1',
    latestRevisionId: 'story-revision-1',
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    latestRevision: {
      ...storyRevisionRow(),
      _count: { scenarios: 0 },
    },
    _count: { revisions: 1 },
    ...overrides,
  };
}

describe('PrismaWorkspaceDelivery', () => {
  it('persists a non-authoritative candidate with an exact Inbox citation', async () => {
    const store = mockPrismaStore();
    store.inboxRevision.findMany.mockResolvedValue([inboxRevisionRow()]);
    store.storyCandidate.findFirst.mockResolvedValue(candidateRow());
    const delivery = new PrismaWorkspaceDelivery(asStore(store), 'workspace-1');

    const candidate = await delivery.proposeCandidate(candidateInput, 'user-1');

    expect(candidate.description()).toMatchObject({
      status: 'pending',
      version: 1,
      citations: [
        expect.objectContaining({
          inboxRevisionNumber: 3,
          contentSha256: inboxHash,
          locator: 'whole-source',
        }),
      ],
    });
    expect(store.inboxRevision.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['inbox-revision-1'] },
        item: { workspaceId: 'workspace-1' },
      },
    });
    expect(store.storyCandidate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: 'workspace-1',
        status: 'pending',
        proposedByUserId: 'user-1',
      }),
    });
    expect(store.storyCandidateCitation.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          inboxRevisionId: 'inbox-revision-1',
          position: 0,
          locator: 'whole-source',
        }),
      ],
    });
  });

  it('rejects a citation whose hash does not identify the exact revision', async () => {
    const store = mockPrismaStore();
    store.inboxRevision.findMany.mockResolvedValue([
      inboxRevisionRow({ contentSha256: `sha256:${'b'.repeat(64)}` }),
    ]);
    const delivery = new PrismaWorkspaceDelivery(asStore(store), 'workspace-1');

    await expect(
      delivery.proposeCandidate(candidateInput, 'user-1'),
    ).rejects.toMatchObject({ kind: 'validation' });
    expect(store.storyCandidate.create).not.toHaveBeenCalled();
  });

  it('atomically confirms a pending candidate as Story Revision v1', async () => {
    const store = mockPrismaStore();
    const confirmedRevision = storyRevisionRow();
    store.storyCandidate.findFirst
      .mockResolvedValueOnce(candidateRow())
      .mockResolvedValueOnce(
        candidateRow({
          status: 'confirmed',
          version: 2,
          decidedByUserId: 'user-1',
          decidedAt: timestamp,
          confirmedRevision,
        }),
      );
    store.storyCandidate.updateMany.mockResolvedValue({ count: 1 });
    store.story.findFirst.mockResolvedValue(storyRow());
    store.storyRevision.findFirst.mockResolvedValue(confirmedRevision);
    const delivery = new PrismaWorkspaceDelivery(asStore(store), 'workspace-1');

    const result = await delivery.confirmCandidate('candidate-1', 1, 'user-1');

    expect(result.created).toBe(true);
    expect(result.candidate.description()).toMatchObject({
      status: 'confirmed',
      version: 2,
    });
    expect(result.story.description()).toMatchObject({
      title: candidateInput.title,
      latestRevisionNumber: 1,
      revisionCount: 1,
    });
    expect(result.revision.description()).toMatchObject({
      revisionNumber: 1,
      title: candidateInput.title,
      contentSha256: hashStoryCandidateInput(candidateInput).contentSha256,
    });
    expect(store.storyCandidate.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'candidate-1',
        workspaceId: 'workspace-1',
        status: 'pending',
        version: 1,
      },
      data: expect.objectContaining({
        status: 'confirmed',
        version: { increment: 1 },
        decidedByUserId: 'user-1',
      }),
    });
    expect(store.storyRevision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        revisionNumber: 1,
        sourceCandidateId: 'candidate-1',
        createdByUserId: 'user-1',
      }),
    });
    expect(store.storyRevisionCitation.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          inboxRevisionId: 'inbox-revision-1',
          position: 0,
        }),
      ],
    });
  });

  it('returns the existing Story Revision when confirmation is retried', async () => {
    const store = mockPrismaStore();
    const confirmedRevision = storyRevisionRow();
    store.storyCandidate.findFirst
      .mockResolvedValueOnce(
        candidateRow({
          status: 'confirmed',
          version: 2,
          decidedByUserId: 'user-1',
          decidedAt: timestamp,
          confirmedRevision,
        }),
      )
      .mockResolvedValueOnce(
        candidateRow({
          status: 'confirmed',
          version: 2,
          decidedByUserId: 'user-1',
          decidedAt: timestamp,
          confirmedRevision,
        }),
      );
    store.story.findFirst.mockResolvedValue(storyRow());
    store.storyRevision.findFirst.mockResolvedValue(confirmedRevision);
    const delivery = new PrismaWorkspaceDelivery(asStore(store), 'workspace-1');

    const result = await delivery.confirmCandidate('candidate-1', 1, 'user-1');

    expect(result.created).toBe(false);
    expect(store.story.create).not.toHaveBeenCalled();
    expect(store.storyRevision.create).not.toHaveBeenCalled();
    expect(store.storyCandidate.updateMany).not.toHaveBeenCalled();
  });

  it('records rejection with optimistic versioning and workspace scope', async () => {
    const store = mockPrismaStore();
    store.storyCandidate.findFirst
      .mockResolvedValueOnce(candidateRow())
      .mockResolvedValueOnce(
        candidateRow({
          status: 'rejected',
          version: 2,
          decidedByUserId: 'user-1',
          decidedAt: timestamp,
        }),
      );
    store.storyCandidate.updateMany.mockResolvedValue({ count: 1 });
    const delivery = new PrismaWorkspaceDelivery(asStore(store), 'workspace-1');

    const rejected = await delivery.rejectCandidate('candidate-1', 1, 'user-1');

    expect(rejected.description()).toMatchObject({
      status: 'rejected',
      version: 2,
    });
    expect(store.storyCandidate.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'workspace-1',
          status: 'pending',
          version: 1,
        }),
      }),
    );
  });

  it('atomically appends an acceptance Scenario Set as the next revision', async () => {
    const store = mockPrismaStore();
    const revisionHash = hashStoryRevisionInput(revisionInput).contentSha256;
    const savedRevision = storyRevisionRow({
      id: 'story-revision-2',
      revisionNumber: 2,
      contentSha256: revisionHash,
      sourceCandidateId: null,
      scenarios: [
        {
          id: 'scenario-1',
          storyRevisionId: 'story-revision-2',
          position: 0,
          title: revisionInput.scenarios[0]?.title,
          givenSteps: revisionInput.scenarios[0]?.given,
          whenStep: revisionInput.scenarios[0]?.when,
          thenSteps: revisionInput.scenarios[0]?.then,
        },
      ],
    });
    store.story.findFirst
      .mockResolvedValueOnce(storyRow())
      .mockResolvedValueOnce(
        storyRow({
          latestRevisionId: 'story-revision-2',
          version: 2,
          latestRevision: {
            ...savedRevision,
            _count: { scenarios: 1 },
          },
          _count: { revisions: 2 },
        }),
      );
    store.inboxRevision.findMany.mockResolvedValue([inboxRevisionRow()]);
    store.story.updateMany.mockResolvedValue({ count: 1 });
    store.storyRevision.findFirst.mockResolvedValue(savedRevision);
    const delivery = new PrismaWorkspaceDelivery(asStore(store), 'workspace-1');

    const result = await delivery.appendStoryRevision(
      'story-1',
      1,
      'story-revision-1',
      revisionInput,
      'user-1',
    );

    expect(result.story.description()).toMatchObject({
      latestRevision: { value: 'story-revision-2' },
      latestRevisionNumber: 2,
      latestScenarioCount: 1,
      revisionCount: 2,
      version: 2,
    });
    expect(result.revision.description()).toMatchObject({
      revisionNumber: 2,
      contentSha256: revisionHash,
      sourceCandidate: null,
      scenarios: [
        expect.objectContaining({
          id: 'scenario-1',
          title: 'Create an isolated worktree',
        }),
      ],
    });
    expect(store.story.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'story-1',
        workspaceId: 'workspace-1',
        version: 1,
        latestRevisionId: 'story-revision-1',
      },
      data: { version: { increment: 1 } },
    });
    expect(store.storyRevision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: expect.any(String),
        storyId: 'story-1',
        revisionNumber: 2,
        contentSha256: revisionHash,
        sourceCandidateId: null,
        createdByUserId: 'user-1',
      }),
    });
    expect(store.storyScenario.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          storyRevisionId: expect.any(String),
          position: 0,
          title: 'Create an isolated worktree',
          givenSteps: revisionInput.scenarios[0]?.given,
          whenStep: revisionInput.scenarios[0]?.when,
          thenSteps: revisionInput.scenarios[0]?.then,
        }),
      ],
    });
  });

  it('rejects a stale Story revision without leaving a partial write', async () => {
    const store = mockPrismaStore();
    store.story.findFirst.mockResolvedValue(
      storyRow({
        latestRevisionId: 'story-revision-2',
        version: 2,
      }),
    );
    const delivery = new PrismaWorkspaceDelivery(asStore(store), 'workspace-1');

    await expect(
      delivery.appendStoryRevision(
        'story-1',
        1,
        'story-revision-1',
        revisionInput,
        'user-1',
      ),
    ).rejects.toMatchObject({ kind: 'conflict' });
    expect(store.storyRevision.create).not.toHaveBeenCalled();
    expect(store.storyScenario.createMany).not.toHaveBeenCalled();
  });

  it('hashes normalized Scenario content and order deterministically', () => {
    const scenario = revisionInput.scenarios[0];
    expect(scenario).toBeDefined();
    if (!scenario) return;

    const first = hashStoryRevisionInput(revisionInput).contentSha256;
    const normalized = hashStoryRevisionInput({
      ...revisionInput,
      scenarios: [{ ...scenario, title: ` ${scenario.title} ` }],
    }).contentSha256;
    const changedOrder = hashStoryRevisionInput({
      ...revisionInput,
      scenarios: [{ ...scenario, then: [...scenario.then].reverse() }],
    }).contentSha256;

    expect(normalized).toBe(first);
    expect(changedOrder).not.toBe(first);
  });
});
