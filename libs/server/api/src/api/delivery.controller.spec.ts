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
    title: 'Local coding agent',
    latestRevision: new Ref('story-revision-1'),
    latestRevisionNumber: 1,
    latestScenarioCount: 0,
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
    title: string;
    given: string[];
    when: string;
    then: string[];
  }> = [],
) {
  return new StoryRevision(id, {
    story: new Ref('story-1'),
    revisionNumber,
    title: 'Local coding agent',
    problem: 'Hosted services must not receive source code.',
    role: 'Workspace maintainer',
    goal: 'Run coding work locally.',
    value: 'Credentials remain local.',
    cognitiveMode: 'complicated',
    citations: [citation()],
    scenarios,
    contentSha256: revisionHash,
    sourceCandidate: null,
    createdBy: new Ref('user-1'),
    createdAt: timestamp,
  });
}

function fixture() {
  const canonicalStory = story();
  const revision = storyRevision();
  const appendedRevision = storyRevision('story-revision-2', 2, [
    {
      id: 'scenario-1',
      title: 'Create an isolated worktree',
      given: ['The Workspace is bound to an accessible Git repository.'],
      when: 'The user starts a Coding Run.',
      then: ['The primary working tree remains unchanged.'],
    },
  ]);
  const workspace = {
    listStories: vi.fn(async () => [[canonicalStory], 1]),
    listStoryRevisions: vi.fn(async () => [[revision], 1]),
    appendStoryRevision: vi.fn(async () => ({
      story: canonicalStory,
      revision: appendedRevision,
    })),
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
    appendedRevision,
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
      title: 'Local coding agent',
      latestRevisionNumber: 1,
      latestScenarioCount: 0,
      revisionCount: 1,
      version: 1,
      _links: {
        'create-revision': {
          href: '/api/workspaces/workspace-1/stories/story-1/revisions',
        },
      },
    });
    expect(revisions._embedded.storyRevisions[0]).toMatchObject({
      id: 'story-revision-1',
      revisionNumber: 1,
      title: 'Local coding agent',
      scenarios: [],
    });
  });

  it('creates a subsequent immutable Story Revision with Scenarios', async () => {
    const { appendedRevision, controller, workspace } = fixture();
    const response = { setHeader: vi.fn() };
    const input = {
      expectedVersion: 1,
      expectedLatestRevisionId: 'story-revision-1',
      title: 'Local coding agent',
      problem: 'Hosted services must not receive source code.',
      role: 'Workspace maintainer',
      goal: 'Run coding work locally.',
      value: 'Credentials remain local.',
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
          when: 'The user starts a Coding Run.',
          then: ['The primary working tree remains unchanged.'],
        },
      ],
    };

    const result = await controller.createStoryRevision(
      'workspace-1',
      'story-1',
      input,
      response,
    );

    expect(workspace.appendStoryRevision).toHaveBeenCalledWith(
      'story-1',
      1,
      'story-revision-1',
      expect.objectContaining({ scenarios: input.scenarios }),
      'user-1',
    );
    expect(result).toMatchObject({
      id: appendedRevision.identity(),
      revisionNumber: 2,
      sourceCandidateId: null,
      scenarios: [
        expect.objectContaining({
          id: 'scenario-1',
          title: 'Create an isolated worktree',
        }),
      ],
    });
    expect(response.setHeader).toHaveBeenCalledWith(
      'Location',
      '/api/workspaces/workspace-1/stories/story-1/revisions/story-revision-2',
    );
  });
});
