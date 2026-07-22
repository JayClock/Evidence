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
  post = vi.fn(),
  refresh,
}: {
  items?: State<InboxItemResource>[];
  total?: number;
  post?: ReturnType<typeof vi.fn>;
  refresh?: ReturnType<typeof vi.fn>;
} = {}) {
  const state = {
    data: {
      page: {
        number: 1,
        size: 20,
        totalElements: total,
        totalPages: total === 0 ? 0 : 1,
      },
    },
    collection: items,
  };
  const resource = {
    post,
    refresh: refresh ?? vi.fn().mockResolvedValue(state),
  };

  return {
    state: {
      ...state,
      follow: (rel: string) => {
        if (rel !== 'self') {
          throw new Error(`Unexpected relation: ${rel}`);
        }
        return resource;
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
