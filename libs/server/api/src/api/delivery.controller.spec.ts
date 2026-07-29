import { describe, expect, it, vi } from 'vitest';
import {
  Ref,
  Story,
  StoryRevision,
  type Workspace,
} from '@evidence/server-domain';
import { StoriesController } from './delivery.controller';
import type { ResourceResolver } from './resource-resolver.service';

const timestamp = '2026-01-01T00:00:00.000Z';
const inboxHash = `sha256:${'a'.repeat(64)}`;
const revisionHash = `sha256:${'b'.repeat(64)}`;

function citation() {
  return {
    inboxItem: new Ref('inbox-1'),
    inboxRevision: new Ref('inbox-revision-1'),
    inboxRevisionNumber: 2,
    contentSha256: inboxHash,
    locator: 'whole-source',
  };
}

function story() {
  return new Story('story-1', {
    workspace: new Ref('workspace-1'),
    iteration: new Ref('iteration-1'),
    iterationReference: 'ITER-0001',
    iterationLifecycle: 'active',
    iterationLoop: 'understand',
    iterationStage: 'tqa',
    reference: 'US-001',
    title: 'Local Pair delivery',
    goal: 'Deliver approved Story changes locally.',
    latestRevision: new Ref('story-revision-1'),
    latestRevisionNumber: 1,
    latestScenarioCount: 0,
    latestCitationCount: 1,
    pendingClarificationReference: 'Q-001',
    authority: { owner: 'human', nextAction: 'answer_clarification' },
    revisionCount: 1,
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

function storyRevision(
  id = 'story-revision-1',
  revisionNumber = 1,
  scenarios: Array<{
    id: string;
    reference: string;
    sourceDraftId: string;
    title: string;
    given: string[];
    when: string;
    then: string[];
    businessData: string[];
  }> = [],
) {
  return new StoryRevision(id, {
    story: new Ref('story-1'),
    revisionNumber,
    title: 'Local Pair delivery',
    problem: 'Hosted services must not receive source code.',
    role: 'Workspace maintainer',
    goal: 'Deliver approved Story changes locally.',
    value: 'Credentials remain local.',
    cognitiveMode: 'complicated',
    citations: [citation()],
    scenarios,
    contentSha256: revisionHash,
    createdBy: new Ref('user-1'),
    createdAt: timestamp,
  });
}

function fixture() {
  const canonicalStory = story();
  const revision = storyRevision();
  const workspace = {
    listStories: vi.fn(async () => [[canonicalStory], 1]),
    summarizeStories: vi.fn(async () => ({
      humanAttention: 1,
      agentAttention: 0,
      approved: 0,
      stages: [{ loop: 'understand', stage: 'tqa', count: 1 }],
      actions: [{ action: 'answer_clarification', count: 1 }],
    })),
    listStoryRevisions: vi.fn(async () => [[revision], 1]),
  } as unknown as Workspace;
  const resolver = {
    currentUserId: vi.fn(() => 'user-1'),
    requireWorkspace: vi.fn(async () => workspace),
    requireWorkspaceStory: vi.fn(async () => [workspace, canonicalStory]),
    requireWorkspaceStoryRevision: vi.fn(async () => [
      workspace,
      canonicalStory,
      revision,
    ]),
  } as unknown as ResourceResolver;
  return {
    controller: new StoriesController(resolver),
    revision,
    workspace,
  };
}

describe('StoriesController', () => {
  it('lists Stories and their immutable revisions', async () => {
    const { controller, workspace } = fixture();

    const stories = await controller.listStories('workspace-1', '1', '20');
    const revisions = await controller.listStoryRevisions(
      'workspace-1',
      'story-1',
      '1',
      '20',
    );

    expect(workspace.listStories).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
    });
    expect(stories._embedded.stories[0]).toMatchObject({
      id: 'story-1',
      iterationId: 'iteration-1',
      iterationReference: 'ITER-0001',
      iterationLoop: 'understand',
      iterationStage: 'tqa',
      reference: 'US-001',
      title: 'Local Pair delivery',
      goal: 'Deliver approved Story changes locally.',
      latestRevisionNumber: 1,
      latestScenarioCount: 0,
      latestCitationCount: 1,
      pendingClarificationReference: 'Q-001',
      authority: { owner: 'human', nextAction: 'answer_clarification' },
      revisionCount: 1,
      version: 1,
      _links: {
        iteration: {
          href: '/api/workspaces/workspace-1/iterations/iteration-1',
        },
        understanding: {
          href: '/api/workspaces/workspace-1/iterations/iteration-1/understanding',
        },
      },
    });
    expect(stories.summary).toEqual({
      humanAttention: 1,
      agentAttention: 0,
      approved: 0,
      stages: [{ loop: 'understand', stage: 'tqa', count: 1 }],
      actions: [{ action: 'answer_clarification', count: 1 }],
    });
    expect(revisions._embedded.storyRevisions[0]).toMatchObject({
      id: 'story-revision-1',
      revisionNumber: 1,
      title: 'Local Pair delivery',
      scenarios: [],
    });
  });
});
