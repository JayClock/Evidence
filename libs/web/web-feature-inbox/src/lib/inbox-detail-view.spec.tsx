import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  useResource,
  type InboxItemResource,
  type InboxRevisionCollectionResource,
  type InboxRevisionResource,
  type State,
} from '@evidence/api-client';
import type { Mock } from 'vitest';

import {
  InboxItemDetailView,
  InboxRevisionCollectionView,
  InboxRevisionDetailView,
} from './inbox-detail-view';

vi.mock('@evidence/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@evidence/api-client')>();
  return {
    ...actual,
    useResource: vi.fn(),
  };
});

const revisionState = {
  data: {
    id: 'revision-1',
    revisionNumber: 1,
    title: 'Customer interview',
    body: '# Interview insight\n\nCustomers need a durable Inbox.',
    contentType: 'text/markdown',
    uri: null,
    providerMetadata: { channel: 'manual' },
    sourceUpdatedAt: null,
    capturedAt: '2026-07-21T10:00:00.000Z',
    contentSha256: 'a'.repeat(64),
  },
  getLink: (rel: string) =>
    rel === 'self'
      ? {
          rel,
          href: '/api/workspaces/workspace-1/inbox-items/item-1/revisions/revision-1',
        }
      : undefined,
} as unknown as State<InboxRevisionResource>;

const revisionCollectionState = {
  data: {
    page: {
      number: 1,
      size: 20,
      totalElements: 1,
      totalPages: 1,
    },
  },
  collection: [revisionState],
  getLink: () => undefined,
} as unknown as State<InboxRevisionCollectionResource>;

const appendRevision = vi.fn();
const refreshRevisions = vi.fn();
const patchItem = vi.fn();
const refreshItem = vi.fn();

const relations = {
  revisions: {
    kind: 'revisions',
    post: appendRevision,
    refresh: refreshRevisions,
  },
  'latest-revision': { kind: 'latest-revision' },
  self: {
    kind: 'self',
    patch: patchItem,
    refresh: refreshItem,
  },
};

function inboxItemState(
  overrides: Partial<State<InboxItemResource>['data']> = {},
) {
  return {
    data: {
      id: 'item-1',
      sourceKind: 'manual_text',
      externalKey: 'manual:one',
      title: 'Customer interview',
      status: 'active',
      latestRevisionId: 'revision-1',
      latestRevisionSha256: 'a'.repeat(64),
      revisionCount: 1,
      version: 1,
      createdAt: '2026-07-21T10:00:00.000Z',
      updatedAt: '2026-07-21T10:00:00.000Z',
      ...overrides,
    },
    follow: (rel: keyof typeof relations) => relations[rel],
  } as unknown as State<InboxItemResource>;
}

const useResourceMock = useResource as unknown as Mock;

describe('InboxItemDetailView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    refreshRevisions.mockResolvedValue(revisionCollectionState);
    refreshItem.mockResolvedValue(inboxItemState());
    appendRevision.mockResolvedValue(revisionState);
    patchItem.mockResolvedValue(
      inboxItemState({ status: 'deferred', version: 2 }),
    );
    useResourceMock.mockImplementation((resource: { kind: string }) => {
      if (resource.kind === 'revisions') {
        return {
          loading: false,
          error: null,
          data: revisionCollectionState.data,
          resourceState: revisionCollectionState,
          resource,
        };
      }

      return {
        loading: false,
        error: null,
        data: revisionState.data,
        resourceState: revisionState,
        resource,
      };
    });
  });

  it('renders the latest source content and immutable revision history', () => {
    render(
      <MemoryRouter>
        <InboxItemDetailView resourceState={inboxItemState()}>
          <button type="button">Propose Story</button>
        </InboxItemDetailView>
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: 'Propose Story' })).toBeTruthy();
    expect(
      screen.getByRole('heading', { name: 'Customer interview', level: 1 }),
    ).toBeTruthy();
    expect(screen.getByText('Interview insight')).toBeTruthy();
    expect(screen.getByText('Customers need a durable Inbox.')).toBeTruthy();
    expect(
      screen.getByRole('heading', { name: 'Revision history', level: 2 }),
    ).toBeTruthy();
    expect(screen.getByText('Latest')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open' })).toHaveProperty(
      'pathname',
      '/api/workspaces/workspace-1/inbox-items/item-1/revisions/revision-1',
    );
  });

  it('changes status with the current optimistic version', async () => {
    render(
      <MemoryRouter>
        <InboxItemDetailView resourceState={inboxItemState()} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Mark deferred' }));

    await waitFor(() =>
      expect(patchItem).toHaveBeenCalledWith({
        data: { status: 'deferred', expectedVersion: 1 },
      }),
    );
    await waitFor(() =>
      expect(
        screen
          .getByRole('button', { name: 'Mark deferred' })
          .getAttribute('aria-pressed'),
      ).toBe('true'),
    );
  });

  it('updates a manual source while revision creation stays implicit', async () => {
    render(
      <MemoryRouter>
        <InboxItemDetailView resourceState={inboxItemState()} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit source' }));
    fireEvent.change(screen.getByLabelText('Content'), {
      target: { value: '# Updated interview insight' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(appendRevision).toHaveBeenCalledTimes(1));
    expect(appendRevision).toHaveBeenCalledWith({
      data: {
        title: 'Customer interview',
        body: '# Updated interview insight',
        contentType: 'text/markdown',
        expectedLatestRevisionSha256: 'a'.repeat(64),
      },
    });
    await waitFor(() => expect(refreshItem).toHaveBeenCalledTimes(1));
    expect(refreshRevisions).toHaveBeenCalledTimes(1);
  });

  it('keeps provider-managed sources read-only', () => {
    render(
      <MemoryRouter>
        <InboxItemDetailView
          resourceState={inboxItemState({ sourceKind: 'github_issue' })}
        />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('button', { name: 'Edit source' })).toBeNull();
  });
});

describe('Inbox revision resource views', () => {
  it('renders a revision collection independently', () => {
    render(
      <MemoryRouter>
        <InboxRevisionCollectionView resourceState={revisionCollectionState} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('table')).toBeTruthy();
    expect(screen.getByText('#1')).toBeTruthy();
  });

  it('follows revision history pagination links', async () => {
    const secondRevision = {
      ...revisionState,
      data: {
        ...revisionState.data,
        id: 'revision-2',
        revisionNumber: 2,
        title: 'Second revision page',
      },
    } as State<InboxRevisionResource>;
    const secondPage = {
      data: {
        page: { number: 2, size: 20, totalElements: 21, totalPages: 2 },
      },
      collection: [secondRevision],
      getLink: () => undefined,
    } as unknown as State<InboxRevisionCollectionResource>;
    const nextRefresh = vi.fn().mockResolvedValue(secondPage);
    const firstPage = {
      data: {
        page: { number: 1, size: 20, totalElements: 21, totalPages: 2 },
      },
      collection: [revisionState],
      getLink: (rel: string) =>
        rel === 'next' ? { rel, href: '/api/revisions?page=2' } : undefined,
      follow: () => ({ refresh: nextRefresh }),
    } as unknown as State<InboxRevisionCollectionResource>;

    render(
      <MemoryRouter>
        <InboxRevisionCollectionView resourceState={firstPage} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => expect(nextRefresh).toHaveBeenCalledOnce());
    expect(await screen.findByText('Second revision page')).toBeTruthy();
    expect(screen.getByText('Page 2 of 2')).toBeTruthy();
  });

  it('renders a revision resource independently', () => {
    render(<InboxRevisionDetailView resourceState={revisionState} />);

    expect(
      screen.getByRole('heading', { name: 'Customer interview', level: 1 }),
    ).toBeTruthy();
    expect(screen.getByText('Revision 1')).toBeTruthy();
    expect(screen.getByText('Interview insight')).toBeTruthy();
    expect(screen.getByText('a'.repeat(64))).toBeTruthy();
  });
});
