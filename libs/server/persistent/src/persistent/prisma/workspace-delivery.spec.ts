import { describe, expect, it } from 'vitest';
import type { StoryRevisionInput } from '@evidence/server-domain';
import { hashStoryRevisionInput } from '../story-content';
import { asStore, mockPrismaStore, timestamp } from './test-support';
import { PrismaWorkspaceDelivery } from './workspace-delivery';

const inboxHash = `sha256:${'a'.repeat(64)}`;
const baselineHash = `sha256:${'b'.repeat(64)}`;
const revisionInput: StoryRevisionInput = {
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

function storyRevisionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'story-revision-1',
    storyId: 'story-1',
    revisionNumber: 1,
    title: revisionInput.title,
    problem: revisionInput.problem,
    role: revisionInput.role,
    goal: revisionInput.goal,
    value: revisionInput.value,
    cognitiveMode: revisionInput.cognitiveMode,
    contentSha256: baselineHash,
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
    reference: 'US-001',
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
  it('lists only authoritative Stories with their latest Scenario count', async () => {
    const store = mockPrismaStore();
    store.story.findMany.mockResolvedValue([storyRow()]);
    store.story.count.mockResolvedValue(1);
    const delivery = new PrismaWorkspaceDelivery(asStore(store), 'workspace-1');

    const [stories, total] = await delivery.listStories({
      page: 1,
      pageSize: 20,
    });

    expect(total).toBe(1);
    expect(stories[0]?.description()).toMatchObject({
      reference: 'US-001',
      latestRevisionNumber: 1,
      latestScenarioCount: 0,
      revisionCount: 1,
    });
    expect(store.story.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspaceId: 'workspace-1' } }),
    );
  });

  it('atomically appends an acceptance Scenario Set as the next revision', async () => {
    const store = mockPrismaStore();
    const revisionHash = hashStoryRevisionInput(revisionInput).contentSha256;
    const savedRevision = storyRevisionRow({
      id: 'story-revision-2',
      revisionNumber: 2,
      contentSha256: revisionHash,
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
      scenarios: [expect.objectContaining({ id: 'scenario-1' })],
    });
    expect(store.storyRevision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        storyId: 'story-1',
        revisionNumber: 2,
        createdByUserId: 'user-1',
      }),
    });
    expect(store.storyScenario.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          position: 0,
          title: 'Create an isolated worktree',
        }),
      ],
    });
  });

  it('rejects a citation whose hash does not identify the exact revision', async () => {
    const store = mockPrismaStore();
    store.story.findFirst.mockResolvedValue(storyRow());
    store.inboxRevision.findMany.mockResolvedValue([
      inboxRevisionRow({ contentSha256: `sha256:${'c'.repeat(64)}` }),
    ]);
    const delivery = new PrismaWorkspaceDelivery(asStore(store), 'workspace-1');

    await expect(
      delivery.appendStoryRevision(
        'story-1',
        1,
        'story-revision-1',
        revisionInput,
        'user-1',
      ),
    ).rejects.toMatchObject({ kind: 'validation' });
    expect(store.storyRevision.create).not.toHaveBeenCalled();
  });

  it('rejects a stale Story revision without leaving a partial write', async () => {
    const store = mockPrismaStore();
    store.story.findFirst.mockResolvedValue(
      storyRow({ latestRevisionId: 'story-revision-2', version: 2 }),
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
