import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type {
  InboxItemCollectionResource,
  InboxItemResource,
  State,
} from '@evidence/api-client';

import { InboxCollectionView } from './inbox-collection-view';

const itemState = {
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
  },
  getLink: (rel: string) =>
    rel === 'self'
      ? {
          rel,
          href: '/api/workspaces/workspace-1/inbox-items/item-1',
        }
      : undefined,
} as unknown as State<InboxItemResource>;

function collectionState({
  items = [itemState],
  total = items.length,
  page = 1,
  totalPages = total === 0 ? 0 : 1,
  post = vi.fn(),
  refresh,
  nextRefresh,
  previousRefresh,
}: {
  items?: State<InboxItemResource>[];
  total?: number;
  page?: number;
  totalPages?: number;
  post?: ReturnType<typeof vi.fn>;
  refresh?: ReturnType<typeof vi.fn>;
  nextRefresh?: ReturnType<typeof vi.fn>;
  previousRefresh?: ReturnType<typeof vi.fn>;
} = {}) {
  const state = {
    data: {
      page: {
        number: page,
        size: 20,
        totalElements: total,
        totalPages,
      },
    },
    collection: items,
  };
  const resource = {
    post,
    refresh: refresh ?? vi.fn().mockResolvedValue(state),
  };
  const pageResources = {
    next: nextRefresh ? { refresh: nextRefresh } : null,
    prev: previousRefresh ? { refresh: previousRefresh } : null,
  };

  return {
    state: {
      ...state,
      getLink: (rel: string) =>
        rel in pageResources && pageResources[rel as 'next' | 'prev']
          ? { rel, href: `/api/inbox?page=${rel}` }
          : undefined,
      follow: (rel: string) => {
        if (rel === 'self') {
          return resource;
        }
        const pageResource = pageResources[rel as 'next' | 'prev'];
        if (!pageResource) {
          throw new Error(`Unexpected relation: ${rel}`);
        }
        return pageResource;
      },
    } as unknown as State<InboxItemCollectionResource>,
    post,
    refresh: resource.refresh,
  };
}

describe('InboxCollectionView', () => {
  it('renders workspace Inbox items and their resource links', () => {
    const { state } = collectionState();

    render(
      <MemoryRouter>
        <InboxCollectionView resourceState={state} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Inbox' })).toBeTruthy();
    expect(screen.getByText('Customer interview')).toBeTruthy();
    expect(screen.getByText('Active')).toBeTruthy();
    expect(screen.getByText('1 total')).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Open' }).getAttribute('href'),
    ).toBe('/api/workspaces/workspace-1/inbox-items/item-1');
  });

  it('renders an empty Inbox state', () => {
    const { state } = collectionState({ items: [], total: 0 });

    render(
      <MemoryRouter>
        <InboxCollectionView resourceState={state} />
      </MemoryRouter>,
    );

    expect(screen.getByText('No inbox items yet')).toBeTruthy();
    expect(screen.getByText('0 total')).toBeTruthy();
  });

  it('follows the HAL next relation to render another page', async () => {
    const secondItem = {
      ...itemState,
      data: {
        ...itemState.data,
        id: 'item-2',
        title: 'Second page source',
      },
    } as State<InboxItemResource>;
    const { state: secondPage } = collectionState({
      items: [secondItem],
      total: 21,
      page: 2,
      totalPages: 2,
    });
    const nextRefresh = vi.fn().mockResolvedValue(secondPage);
    const { state } = collectionState({
      total: 21,
      totalPages: 2,
      nextRefresh,
    });

    render(
      <MemoryRouter>
        <InboxCollectionView resourceState={state} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => expect(nextRefresh).toHaveBeenCalledOnce());
    expect(await screen.findByText('Second page source')).toBeTruthy();
    expect(screen.getByText('Page 2 of 2')).toBeTruthy();
  });

  it('captures a manual source and refreshes the collection', async () => {
    const post = vi.fn().mockResolvedValue(itemState);
    const refreshedState = {
      data: {
        page: {
          number: 1,
          size: 20,
          totalElements: 1,
          totalPages: 1,
        },
      },
      collection: [itemState],
      getLink: () => undefined,
    };
    const refresh = vi.fn().mockResolvedValue(refreshedState);
    const { state } = collectionState({
      items: [],
      total: 0,
      post,
      refresh,
    });

    render(
      <MemoryRouter>
        <InboxCollectionView resourceState={state} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Capture source' }));
    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: '  Customer interview  ' },
    });
    fireEvent.change(screen.getByLabelText('Content'), {
      target: { value: '# Interview notes' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Capture' }));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sourceKind: 'manual_text',
        externalKey: expect.stringMatching(/^manual:/),
        title: 'Customer interview',
        body: '# Interview notes',
        contentType: 'text/markdown',
      }),
    });
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Customer interview')).toBeTruthy();
  });
});
