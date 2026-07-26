import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  useResource,
  type State,
  type StoryCollectionResource,
  type StoryResource,
  type StoryRevisionCollectionResource,
  type StoryRevisionResource,
} from '@evidence/api-client';
import type { Mock } from 'vitest';
import {
  StoryCollectionView,
  StoryDetailView,
  StoryRevisionCollectionView,
  StoryRevisionDetailView,
} from './story-views';

vi.mock('@evidence/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@evidence/api-client')>();
  return { ...actual, useResource: vi.fn() };
});

const inboxHash = `sha256:${'a'.repeat(64)}`;
const revisionHash = `sha256:${'b'.repeat(64)}`;

const revisionState = {
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
        _links: {
          item: { href: '/api/workspaces/workspace-1/inbox-items/item-1' },
          revision: {
            href: '/api/workspaces/workspace-1/inbox-items/item-1/revisions/inbox-revision-1',
          },
        },
        inboxItemId: 'item-1',
        inboxRevisionId: 'inbox-revision-1',
        inboxRevisionNumber: 2,
        contentSha256: inboxHash,
        locator: 'whole-source',
      },
    ],
    scenarios: [],
    contentSha256: revisionHash,
    createdByUserId: 'user-1',
    createdAt: '2026-07-24T11:00:00.000Z',
  },
  getLink: (relation: string) =>
    relation === 'self'
      ? {
          rel: relation,
          href: '/api/workspaces/workspace-1/stories/story-1/revisions/story-revision-1',
        }
      : undefined,
} as unknown as State<StoryRevisionResource>;

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
  getLink: (relation: string) => {
    if (relation === 'self') {
      return {
        rel: relation,
        href: '/api/workspaces/workspace-1/stories/story-1',
      };
    }
    if (relation === 'revisions' || relation === 'create-revision') {
      return {
        rel: relation,
        href: '/api/workspaces/workspace-1/stories/story-1/revisions',
      };
    }
    return undefined;
  },
  follow: (relation: string) => {
    if (relation !== 'latest-revision') {
      throw new Error(`Unexpected relation: ${relation}`);
    }
    return { kind: 'latest-revision' };
  },
} as unknown as State<StoryResource>;

const acceptanceRevisionState = {
  ...revisionState,
  data: {
    ...revisionState.data,
    id: 'story-revision-2',
    revisionNumber: 2,
    scenarios: [
      {
        id: 'scenario-1',
        title: 'Create an isolated worktree',
        given: ['The Workspace is bound to an accessible Git repository.'],
        when: 'The user starts a Coding Run.',
        then: [
          'A dedicated branch and worktree are created.',
          'The primary working tree remains unchanged.',
        ],
      },
    ],
  },
} as unknown as State<StoryRevisionResource>;

const revisionCollectionState = {
  data: {
    page: { number: 1, size: 20, totalElements: 1, totalPages: 1 },
  },
  collection: [revisionState],
  getLink: () => undefined,
} as unknown as State<StoryRevisionCollectionResource>;

const useResourceMock = useResource as unknown as Mock;

describe('Story views', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useResourceMock.mockReturnValue({
      loading: false,
      error: null,
      data: revisionState.data,
      resourceState: revisionState,
      resource: { kind: 'latest-revision' },
    });
  });

  it('lists confirmed Story identities and their latest revision', () => {
    const collection = {
      data: {
        page: { number: 1, size: 20, totalElements: 1, totalPages: 1 },
      },
      collection: [storyState],
      getLink: () => undefined,
    } as unknown as State<StoryCollectionResource>;

    render(
      <MemoryRouter>
        <StoryCollectionView resourceState={collection} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Stories' })).toBeTruthy();
    expect(screen.getByText('Local coding agent')).toBeTruthy();
    expect(screen.getByText('v1')).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Open' }).getAttribute('href'),
    ).toBe('/api/workspaces/workspace-1/stories/story-1');
  });

  it('shows the latest immutable revision from a Story', () => {
    render(
      <MemoryRouter>
        <StoryDetailView resourceState={storyState} />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('heading', { name: 'Latest revision · v1' }),
    ).toBeTruthy();
    expect(screen.getByText('Workspace maintainer')).toBeTruthy();
    expect(screen.getByText(revisionHash)).toBeTruthy();
    expect(screen.getByText('Needs acceptance scenarios')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Confirm acceptance revision' }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole('link', { name: 'Revision history' })
        .getAttribute('href'),
    ).toBe('/api/workspaces/workspace-1/stories/story-1/revisions');
  });

  it('renders revision history and exact Inbox citation links', () => {
    const { rerender } = render(
      <MemoryRouter>
        <StoryRevisionCollectionView resourceState={revisionCollectionState} />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('heading', { name: 'Story revision history' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Open' }).getAttribute('href'),
    ).toBe(
      '/api/workspaces/workspace-1/stories/story-1/revisions/story-revision-1',
    );

    rerender(
      <MemoryRouter>
        <StoryRevisionDetailView resourceState={acceptanceRevisionState} />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('heading', { name: 'Local coding agent' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('heading', { name: 'Create an isolated worktree' }),
    ).toBeTruthy();
    expect(screen.getByText('GIVEN')).toBeTruthy();
    expect(screen.getByText('WHEN')).toBeTruthy();
    expect(screen.getByText('THEN')).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Open source' }).getAttribute('href'),
    ).toBe(
      '/api/workspaces/workspace-1/inbox-items/item-1/revisions/inbox-revision-1',
    );
    expect(screen.getByText(inboxHash)).toBeTruthy();
  });
});
