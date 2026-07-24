import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type {
  State,
  StoryResource,
  StoryRevisionResource,
} from '@evidence/api-client';
import { CreateStoryRevisionDialog } from './story-revision-dialog';

const inboxHash = `sha256:${'a'.repeat(64)}`;
const createdRevision = {
  getLink: (relation: string) =>
    relation === 'self'
      ? {
          rel: relation,
          href: '/api/workspaces/workspace-1/stories/story-1/revisions/story-revision-2',
        }
      : undefined,
};
const postRevision = vi.fn(async () => createdRevision);

const storyState = {
  data: {
    id: 'story-1',
    title: 'Local coding agent',
    latestRevisionId: 'story-revision-1',
    latestRevisionNumber: 1,
    latestScenarioCount: 0,
    revisionCount: 1,
    version: 1,
    createdAt: '2026-07-24T11:00:00.000Z',
    updatedAt: '2026-07-24T11:00:00.000Z',
  },
  follow: (relation: string) => {
    if (relation !== 'create-revision') {
      throw new Error(`Unexpected relation: ${relation}`);
    }
    return { post: postRevision };
  },
} as unknown as State<StoryResource>;

const latestRevisionState = {
  data: {
    id: 'story-revision-1',
    revisionNumber: 1,
    title: 'Local coding agent',
    problem: 'Hosted services must not receive source code.',
    role: 'Workspace maintainer',
    goal: 'Run coding work locally.',
    value: 'Credentials remain local.',
    cognitiveMode: 'complicated',
    citations: [
      {
        _links: {},
        inboxItemId: 'inbox-1',
        inboxRevisionId: 'inbox-revision-1',
        inboxRevisionNumber: 2,
        contentSha256: inboxHash,
        locator: 'whole-source',
      },
    ],
    scenarios: [],
    contentSha256: `sha256:${'b'.repeat(64)}`,
    sourceCandidateId: 'candidate-1',
    createdByUserId: 'user-1',
    createdAt: '2026-07-24T11:00:00.000Z',
  },
} as unknown as State<StoryRevisionResource>;

describe('CreateStoryRevisionDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('confirms one complete Scenario Set against the exact latest Revision', async () => {
    render(
      <MemoryRouter>
        <CreateStoryRevisionDialog
          storyState={storyState}
          latestRevisionState={latestRevisionState}
        />
      </MemoryRouter>,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Confirm acceptance revision' }),
    );
    expect(
      screen.getByRole('heading', { name: 'Confirm Story Revision v2' }),
    ).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Scenario 1 title'), {
      target: { value: 'Create an isolated worktree' },
    });
    fireEvent.change(screen.getByLabelText('Given 1'), {
      target: {
        value: 'The Workspace is bound to an accessible Git repository.',
      },
    });
    fireEvent.change(screen.getByLabelText('When'), {
      target: { value: 'The user starts a Coding Run.' },
    });
    fireEvent.change(screen.getByLabelText('Then 1'), {
      target: { value: 'The primary working tree remains unchanged.' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirm Revision v2' }),
    );

    await waitFor(() => expect(postRevision).toHaveBeenCalledOnce());
    expect(postRevision).toHaveBeenCalledWith({
      data: {
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
      },
    });
  });
});
