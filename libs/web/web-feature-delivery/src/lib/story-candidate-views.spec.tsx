import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type {
  InboxItemResource,
  State,
  StoryCandidateCollectionResource,
  StoryCandidateResource,
  StoryRevisionResource,
} from '@evidence/api-client';
import {
  CreateStoryCandidateDialog,
  StoryCandidateCollectionView,
  StoryCandidateDetailView,
} from './story-candidate-views';

const inboxHash = `sha256:${'a'.repeat(64)}`;
const candidateHash = `sha256:${'b'.repeat(64)}`;

function candidateState({
  status = 'pending',
  version = 1,
  follow,
}: {
  status?: 'pending' | 'confirmed' | 'rejected';
  version?: number;
  follow?: (relation: string) => unknown;
} = {}) {
  return {
    data: {
      id: 'candidate-1',
      title: 'Local coding agent',
      problem: 'Hosted services must not receive source code.',
      role: 'Workspace maintainer',
      goal: 'Run coding work locally.',
      value: 'Credentials remain local.',
      cognitiveMode: 'complicated',
      citations: [
        {
          _links: {
            item: {
              href: '/api/workspaces/workspace-1/inbox-items/item-1',
            },
            revision: {
              href: '/api/workspaces/workspace-1/inbox-items/item-1/revisions/revision-1',
            },
          },
          inboxItemId: 'item-1',
          inboxRevisionId: 'revision-1',
          inboxRevisionNumber: 1,
          contentSha256: inboxHash,
          locator: 'whole-source',
        },
      ],
      contentSha256: candidateHash,
      status,
      version,
      proposedByUserId: 'user-1',
      proposedAt: '2026-07-24T10:00:00.000Z',
      decidedByUserId: status === 'pending' ? null : 'user-1',
      decidedAt: status === 'pending' ? null : '2026-07-24T11:00:00.000Z',
      confirmedStoryId: status === 'confirmed' ? 'story-1' : null,
      confirmedRevisionId: status === 'confirmed' ? 'story-revision-1' : null,
    },
    getLink: (relation: string) =>
      relation === 'self'
        ? {
            rel: relation,
            href: '/api/workspaces/workspace-1/story-candidates/candidate-1',
          }
        : undefined,
    follow: follow ?? (() => undefined),
  } as unknown as State<StoryCandidateResource>;
}

function collectionState(items = [candidateState()]) {
  return {
    data: {
      page: {
        number: 1,
        size: 20,
        totalElements: items.length,
        totalPages: items.length === 0 ? 0 : 1,
      },
    },
    collection: items,
    getLink: () => undefined,
  } as unknown as State<StoryCandidateCollectionResource>;
}

function LocationProbe() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}

describe('CreateStoryCandidateDialog', () => {
  it('creates a source-cited candidate from the exact latest Inbox Revision', async () => {
    const created = candidateState();
    const post = vi.fn().mockResolvedValue(created);
    const inboxState = {
      data: {
        id: 'item-1',
        sourceKind: 'manual_text',
        externalKey: 'manual:one',
        title: 'Local coding agent',
        status: 'active',
        latestRevisionId: 'revision-1',
        latestRevisionSha256: inboxHash,
        revisionCount: 1,
        version: 1,
        createdAt: '2026-07-24T09:00:00.000Z',
        updatedAt: '2026-07-24T09:00:00.000Z',
      },
      follow: (relation: string) => {
        if (relation !== 'story-candidates') {
          throw new Error(`Unexpected relation: ${relation}`);
        }
        return { post };
      },
    } as unknown as State<InboxItemResource>;

    render(
      <MemoryRouter initialEntries={['/inbox']}>
        <CreateStoryCandidateDialog inboxItemState={inboxState} />
        <LocationProbe />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Propose Story' }));
    fireEvent.change(screen.getByLabelText('Role'), {
      target: { value: 'Workspace maintainer' },
    });
    fireEvent.change(screen.getByLabelText('Problem'), {
      target: { value: 'Hosted services must not receive source code.' },
    });
    fireEvent.change(screen.getByLabelText('Goal'), {
      target: { value: 'Run coding work locally.' },
    });
    fireEvent.change(screen.getByLabelText('Value'), {
      target: { value: 'Credentials remain local.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Candidate' }));

    await waitFor(() => expect(post).toHaveBeenCalledOnce());
    expect(post).toHaveBeenCalledWith({
      data: {
        title: 'Local coding agent',
        problem: 'Hosted services must not receive source code.',
        role: 'Workspace maintainer',
        goal: 'Run coding work locally.',
        value: 'Credentials remain local.',
        cognitiveMode: 'clear',
        citations: [
          {
            inboxItemId: 'item-1',
            inboxRevisionId: 'revision-1',
            contentSha256: inboxHash,
            locator: 'whole-source',
          },
        ],
      },
    });
    await waitFor(() =>
      expect(screen.getByTestId('location').textContent).toBe(
        '/api/workspaces/workspace-1/story-candidates/candidate-1',
      ),
    );
  });
});

describe('Story Candidate views', () => {
  it('renders Candidate collection links and proposal status', () => {
    render(
      <MemoryRouter>
        <StoryCandidateCollectionView resourceState={collectionState()} />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('heading', { name: 'Story Candidates' }),
    ).toBeTruthy();
    expect(screen.getByText('Local coding agent')).toBeTruthy();
    expect(screen.getByText('Pending')).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Open' }).getAttribute('href'),
    ).toBe('/api/workspaces/workspace-1/story-candidates/candidate-1');
  });

  it('confirms a Candidate with its optimistic version and opens v1', async () => {
    const revisionState = {
      getLink: (relation: string) =>
        relation === 'self'
          ? {
              rel: relation,
              href: '/api/workspaces/workspace-1/stories/story-1/revisions/story-revision-1',
            }
          : undefined,
    } as unknown as State<StoryRevisionResource>;
    const post = vi.fn().mockResolvedValue(revisionState);
    const state = candidateState({
      follow: (relation) => {
        if (relation !== 'confirm') throw new Error('Unexpected relation');
        return { post };
      },
    });

    render(
      <MemoryRouter initialEntries={['/candidate']}>
        <StoryCandidateDetailView resourceState={state} />
        <LocationProbe />
      </MemoryRouter>,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Confirm as Story v1' }),
    );

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith({ data: { expectedVersion: 1 } }),
    );
    await waitFor(() =>
      expect(screen.getByTestId('location').textContent).toBe(
        '/api/workspaces/workspace-1/stories/story-1/revisions/story-revision-1',
      ),
    );
  });

  it('records rejection while keeping the Candidate visible', async () => {
    const rejected = candidateState({ status: 'rejected', version: 2 });
    const post = vi.fn().mockResolvedValue(rejected);
    const state = candidateState({
      follow: (relation) => {
        if (relation !== 'reject') throw new Error('Unexpected relation');
        return { post };
      },
    });

    render(
      <MemoryRouter>
        <StoryCandidateDetailView resourceState={state} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith({ data: { expectedVersion: 1 } }),
    );
    expect(await screen.findByText('Rejected')).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'Confirm as Story v1' }),
    ).toBeNull();
  });
});
