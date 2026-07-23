import { describe, expect, it, vi } from 'vitest';
import {
  Ref,
  Story,
  StoryCandidate,
  StoryRevision,
  type Workspace,
} from '@evidence/server-domain';
import {
  StoriesController,
  StoryCandidatesController,
} from './delivery.controller';
import type { ResourceResolver } from './resource-resolver.service';

const timestamp = '2026-01-01T00:00:00.000Z';
const inboxHash = `sha256:${'a'.repeat(64)}`;
const candidateHash = `sha256:${'b'.repeat(64)}`;

function citation() {
  return {
    inboxItem: new Ref('inbox-1'),
    inboxRevision: new Ref('inbox-revision-1'),
    inboxRevisionNumber: 2,
    contentSha256: inboxHash,
    locator: 'whole-source',
  };
}

function candidate(overrides: Record<string, unknown> = {}) {
  return new StoryCandidate('candidate-1', {
    workspace: new Ref('workspace-1'),
    title: 'Local coding agent',
    problem: 'Hosted services must not receive source code.',
    role: 'Workspace maintainer',
    goal: 'Run coding work locally.',
    value: 'Credentials remain local.',
    cognitiveMode: 'complicated',
    citations: [citation()],
    contentSha256: candidateHash,
    status: 'pending',
    version: 1,
    proposedBy: new Ref('user-1'),
    proposedAt: timestamp,
    decidedBy: null,
    decidedAt: null,
    confirmedStory: null,
    confirmedRevision: null,
    ...overrides,
  });
}

function story() {
  return new Story('story-1', {
    workspace: new Ref('workspace-1'),
    title: 'Local coding agent',
    latestRevision: new Ref('story-revision-1'),
    latestRevisionNumber: 1,
    revisionCount: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

function storyRevision() {
  return new StoryRevision('story-revision-1', {
    story: new Ref('story-1'),
    revisionNumber: 1,
    title: 'Local coding agent',
    problem: 'Hosted services must not receive source code.',
    role: 'Workspace maintainer',
    goal: 'Run coding work locally.',
    value: 'Credentials remain local.',
    cognitiveMode: 'complicated',
    citations: [citation()],
    contentSha256: candidateHash,
    sourceCandidate: new Ref('candidate-1'),
    createdBy: new Ref('user-1'),
    createdAt: timestamp,
  });
}

function fixture() {
  const pending = candidate();
  const confirmed = candidate({
    status: 'confirmed',
    version: 2,
    decidedBy: new Ref('user-1'),
    decidedAt: timestamp,
    confirmedStory: new Ref('story-1'),
    confirmedRevision: new Ref('story-revision-1'),
  });
  const canonicalStory = story();
  const revision = storyRevision();
  const workspace = {
    listStoryCandidates: vi.fn(async () => [[pending], 21]),
    proposeStoryCandidate: vi.fn(async () => pending),
    confirmStoryCandidate: vi.fn(async () => ({
      candidate: confirmed,
      story: canonicalStory,
      revision,
      created: true,
    })),
    rejectStoryCandidate: vi.fn(async () =>
      candidate({
        status: 'rejected',
        version: 2,
        decidedBy: new Ref('user-1'),
        decidedAt: timestamp,
      }),
    ),
    listStories: vi.fn(async () => [[canonicalStory], 1]),
    listStoryRevisions: vi.fn(async () => [[revision], 1]),
  } as unknown as Workspace;
  const resolver = {
    currentUserId: vi.fn(() => 'user-1'),
    requireWorkspace: vi.fn(async () => workspace),
    requireWorkspaceStoryCandidate: vi.fn(async () => [workspace, pending]),
    requireWorkspaceStory: vi.fn(async () => [workspace, canonicalStory]),
    requireWorkspaceStoryRevision: vi.fn(async () => [
      workspace,
      canonicalStory,
      revision,
    ]),
  } as unknown as ResourceResolver;
  return {
    candidateController: new StoryCandidatesController(resolver),
    storiesController: new StoriesController(resolver),
    pending,
    resolver,
    revision,
    story: canonicalStory,
    workspace,
  };
}

describe('StoryCandidatesController', () => {
  it('lists pending candidates with stable pagination and decision links', async () => {
    const { candidateController, workspace } = fixture();

    const result = await candidateController.listStoryCandidates(
      'workspace-1',
      '2',
      '10',
      'pending',
    );

    expect(workspace.listStoryCandidates).toHaveBeenCalledWith({
      page: 2,
      pageSize: 10,
      status: 'pending',
    });
    expect(result._links).toMatchObject({
      self: {
        href: '/api/workspaces/workspace-1/story-candidates?page=2&pageSize=10&status=pending',
      },
      prev: expect.anything(),
      next: expect.anything(),
    });
    expect(result._embedded.storyCandidates[0]).toMatchObject({
      id: 'candidate-1',
      status: 'pending',
      _links: {
        confirm: {
          href: '/api/workspaces/workspace-1/story-candidates/candidate-1/confirm',
        },
        reject: {
          href: '/api/workspaces/workspace-1/story-candidates/candidate-1/reject',
        },
      },
    });
  });

  it('proposes a source-cited candidate as the authenticated user', async () => {
    const { candidateController, workspace } = fixture();
    const response = { setHeader: vi.fn(), status: vi.fn() };

    const result = await candidateController.proposeStoryCandidate(
      'workspace-1',
      {
        title: ' Local coding agent ',
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
      },
      response,
    );

    expect(workspace.proposeStoryCandidate).toHaveBeenCalledWith(
      {
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
      },
      'user-1',
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'Location',
      '/api/workspaces/workspace-1/story-candidates/candidate-1',
    );
    expect(result.citations[0]?._links.revision.href).toBe(
      '/api/workspaces/workspace-1/inbox-items/inbox-1/revisions/inbox-revision-1',
    );
  });

  it('confirms a candidate into Story Revision v1 with user authority', async () => {
    const { candidateController, workspace } = fixture();
    const response = { setHeader: vi.fn(), status: vi.fn() };

    const result = await candidateController.confirmStoryCandidate(
      'workspace-1',
      'candidate-1',
      { expectedVersion: 1 },
      response,
    );

    expect(workspace.confirmStoryCandidate).toHaveBeenCalledWith(
      'candidate-1',
      1,
      'user-1',
    );
    expect(result).toMatchObject({
      id: 'story-revision-1',
      revisionNumber: 1,
      sourceCandidateId: 'candidate-1',
    });
    expect(response.status).toHaveBeenCalledWith(201);
    expect(response.setHeader).toHaveBeenCalledWith(
      'Location',
      '/api/workspaces/workspace-1/stories/story-1/revisions/story-revision-1',
    );
  });

  it('records explicit rejection without creating a Story', async () => {
    const { candidateController, workspace } = fixture();

    const result = await candidateController.rejectStoryCandidate(
      'workspace-1',
      'candidate-1',
      { expectedVersion: 1 },
    );

    expect(workspace.rejectStoryCandidate).toHaveBeenCalledWith(
      'candidate-1',
      1,
      'user-1',
    );
    expect(result).toMatchObject({ status: 'rejected', version: 2 });
  });
});

describe('StoriesController', () => {
  it('lists Stories and their immutable revisions', async () => {
    const { storiesController, workspace } = fixture();

    const stories = await storiesController.listStories(
      'workspace-1',
      '1',
      '20',
    );
    const revisions = await storiesController.listStoryRevisions(
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
      revisionCount: 1,
    });
    expect(revisions._embedded.storyRevisions[0]).toMatchObject({
      id: 'story-revision-1',
      revisionNumber: 1,
      title: 'Local coding agent',
    });
  });
});
