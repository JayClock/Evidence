import { describe, expect, it } from 'vitest';
import { Ref, type StoryRevisionInput } from '@evidence/server-domain';
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
      businessData: ['repository=alpha', 'branch=evidence/run-1'],
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
    iterationId: 'iteration-1',
    reference: 'US-001',
    latestRevisionId: 'story-revision-1',
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    iteration: {
      id: 'iteration-1',
      reference: 'ITER-0001',
      lifecycle: 'active',
      loop: 'understand',
      stage: 'tqa',
    },
    latestRevision: {
      ...storyRevisionRow(),
      _count: { citations: 1, scenarios: 0 },
    },
    clarifications: [],
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
      iteration: new Ref('iteration-1'),
      iterationReference: 'ITER-0001',
      iterationLoop: 'understand',
      iterationStage: 'tqa',
      reference: 'US-001',
      goal: revisionInput.goal,
      latestRevisionNumber: 1,
      latestScenarioCount: 0,
      latestCitationCount: 1,
      pendingClarificationReference: null,
      authority: {
        owner: 'agent',
        nextAction: 'run_understanding_analyst',
      },
      revisionCount: 1,
    });
    expect(store.story.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspaceId: 'workspace-1' } }),
    );
  });

  it('summarizes exact authority actions across the workspace', async () => {
    const store = mockPrismaStore();
    store.story.findMany.mockResolvedValue([
      {
        id: 'story-1',
        iteration: {
          lifecycle: 'active',
          loop: 'understand',
          stage: 'tqa',
        },
        clarifications: [{ reference: 'Q-001' }],
      },
      {
        id: 'story-2',
        iteration: {
          lifecycle: 'active',
          loop: 'respond',
          stage: 'accepted',
        },
        clarifications: [],
      },
    ]);
    const delivery = new PrismaWorkspaceDelivery(asStore(store), 'workspace-1');

    await expect(delivery.summarizeStories()).resolves.toEqual({
      humanAttention: 1,
      agentAttention: 0,
      approved: 1,
      stages: [
        { loop: 'respond', stage: 'accepted', count: 1 },
        { loop: 'understand', stage: 'tqa', count: 1 },
      ],
      actions: [
        { action: 'answer_clarification', count: 1 },
        { action: 'none', count: 1 },
      ],
    });
    expect(store.story.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: 'workspace-1' },
        select: expect.any(Object),
      }),
    );
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
