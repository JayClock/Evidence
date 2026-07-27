import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import {
  useResource,
  type InboxItemCollectionResource,
  type InboxItemResource,
  type InboxRevisionResource,
  type IntakeAgentEvent,
  type State,
} from '@evidence/api-client';
import type { Mock } from 'vitest';

import { InboxCollectionView } from './inbox-collection-view';

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
  getLink: () => undefined,
} as unknown as State<InboxRevisionResource>;

function inboxItemState({
  id = 'item-1',
  title = 'Customer interview',
  status = 'active',
  sourceKind = 'manual_text',
}: {
  id?: string;
  title?: string;
  status?: 'active' | 'deferred' | 'closed';
  sourceKind?: string;
} = {}) {
  const latestRevision = { kind: 'latest-revision', id };
  return {
    data: {
      id,
      sourceKind,
      externalKey: `manual:${id}`,
      title,
      status,
      latestRevisionId: `revision-${id}`,
      latestRevisionSha256: 'a'.repeat(64),
      revisionCount: 1,
      version: 1,
      createdAt: '2026-07-21T10:00:00.000Z',
      updatedAt: '2026-07-21T10:00:00.000Z',
    },
    getLink: (rel: string) => {
      if (rel === 'self') {
        return {
          rel,
          href: `/api/workspaces/workspace-1/inbox-items/${id}`,
        };
      }
      if (rel === 'revisions') {
        return {
          rel,
          href: `/api/workspaces/workspace-1/inbox-items/${id}/revisions`,
        };
      }
      if (rel === 'latest-revision') {
        return {
          rel,
          href: `/api/workspaces/workspace-1/inbox-items/${id}/revisions/revision-${id}`,
        };
      }
      return undefined;
    },
    follow: (rel: string) => {
      if (rel === 'latest-revision') return latestRevision;
      throw new Error(`Unexpected item relation: ${rel}`);
    },
  } as unknown as State<InboxItemResource>;
}

function collectionState({
  items = [inboxItemState()],
  total = items.length,
  page = 1,
  totalPages = total === 0 ? 0 : 1,
  post = vi.fn(),
  refresh,
  nextRefresh,
  previousRefresh,
  extractionPost,
}: {
  items?: State<InboxItemResource>[];
  total?: number;
  page?: number;
  totalPages?: number;
  post?: ReturnType<typeof vi.fn>;
  refresh?: ReturnType<typeof vi.fn>;
  nextRefresh?: ReturnType<typeof vi.fn>;
  previousRefresh?: ReturnType<typeof vi.fn>;
  extractionPost?: ReturnType<typeof vi.fn>;
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
      getLink: (rel: string) => {
        if (rel === 'self') {
          return {
            rel,
            href: `/api/workspaces/workspace-1/inbox-items?page=${String(page)}&pageSize=20`,
          };
        }
        if (rel in pageResources && pageResources[rel as 'next' | 'prev']) {
          return { rel, href: `/api/inbox?page=${rel}` };
        }
        if (rel === 'inbox-extractions') {
          return {
            rel,
            href: '/api/workspaces/workspace-1/inbox-extractions',
          };
        }
        if (rel === 'workspace') {
          return { rel, href: '/api/workspaces/workspace-1' };
        }
        return undefined;
      },
      follow: (rel: string) => {
        if (rel === 'self') return resource;
        if (rel === 'inbox-extractions' && extractionPost) {
          return { post: extractionPost };
        }
        const pageResource = pageResources[rel as 'next' | 'prev'];
        if (!pageResource) throw new Error(`Unexpected relation: ${rel}`);
        return pageResource;
      },
    } as unknown as State<InboxItemCollectionResource>,
    post,
    refresh: resource.refresh,
  };
}

function LocationProbe() {
  const location = useLocation();
  return (
    <output data-testid="location">
      {location.pathname}
      {location.search}
    </output>
  );
}

const useResourceMock = useResource as unknown as Mock;

afterEach(() => {
  delete window.evidenceDesktop;
});

beforeEach(() => {
  vi.clearAllMocks();
  useResourceMock.mockReturnValue({
    loading: false,
    error: null,
    data: revisionState.data,
    resourceState: revisionState,
  });
});

describe('InboxCollectionView', () => {
  it('renders the Chinese source browser and latest immutable Revision', () => {
    const { state } = collectionState();

    render(
      <MemoryRouter>
        <InboxCollectionView resourceState={state} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: '收件箱' })).toBeTruthy();
    expect(screen.getAllByText('Customer interview').length).toBeGreaterThan(0);
    expect(screen.getAllByText('活跃').length).toBeGreaterThan(0);
    expect(screen.getByText('Customers need a durable Inbox.')).toBeTruthy();
    expect(
      screen.getByRole('link', { name: '打开来源' }).getAttribute('href'),
    ).toBe('/api/workspaces/workspace-1/inbox-items/item-1');
  });

  it('renders an empty Inbox state', () => {
    const { state } = collectionState({ items: [], total: 0 });

    render(
      <MemoryRouter>
        <InboxCollectionView resourceState={state} />
      </MemoryRouter>,
    );

    expect(screen.getByText('没有匹配的来源')).toBeTruthy();
    expect(screen.getByText('工作区来源 · 0 条记录')).toBeTruthy();
  });

  it('follows the HAL next relation and retains selected sources across pages', async () => {
    const secondItem = inboxItemState({
      id: 'item-2',
      title: 'Second page source',
    });
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

    fireEvent.click(
      screen.getByRole('checkbox', { name: '选择来源 Customer interview' }),
    );
    fireEvent.click(screen.getByRole('button', { name: '下一页' }));

    await waitFor(() => expect(nextRefresh).toHaveBeenCalledOnce());
    expect(
      (await screen.findAllByText('Second page source')).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText('第 2 页，共 2 页')).toBeTruthy();
    expect(screen.getByText('1 / 5')).toBeTruthy();
    expect(screen.getAllByText('Customer interview').length).toBeGreaterThan(0);
  });

  it('filters through the canonical collection URL instead of filtering one page locally', () => {
    const { state } = collectionState();

    render(
      <MemoryRouter
        initialEntries={['/api/workspaces/workspace-1/inbox-items']}
      >
        <InboxCollectionView resourceState={state} />
        <LocationProbe />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText('搜索来源'), {
      target: { value: 'privacy boundary' },
    });
    fireEvent.click(screen.getByRole('button', { name: '应用筛选' }));

    expect(screen.getByTestId('location').textContent).toBe(
      '/api/workspaces/workspace-1/inbox-items?page=1&pageSize=20&q=privacy+boundary',
    );
  });

  it('only admits one to five active sources to Extraction', () => {
    const activeItems = Array.from({ length: 6 }, (_, index) =>
      inboxItemState({
        id: `item-${String(index + 1)}`,
        title: `Active source ${String(index + 1)}`,
      }),
    );
    const deferred = inboxItemState({
      id: 'item-deferred',
      title: 'Deferred source',
      status: 'deferred',
    });
    const { state } = collectionState({
      items: [...activeItems, deferred],
      total: 7,
    });

    render(
      <MemoryRouter>
        <InboxCollectionView resourceState={state} />
      </MemoryRouter>,
    );

    for (const item of activeItems.slice(0, 5)) {
      fireEvent.click(
        screen.getByRole('checkbox', {
          name: `选择来源 ${item.data.title}`,
        }),
      );
    }

    expect(screen.getByText('5 / 5')).toBeTruthy();
    expect(
      (
        screen.getByRole('checkbox', {
          name: '选择来源 Active source 6',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole('checkbox', {
          name: '选择来源 Deferred source',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it('freezes selected active sources before local Inbox analysis', async () => {
    const extractionState = {
      data: { id: 'extraction-1', reference: 'EXT-0001' },
      getLink: (relation: string) =>
        relation === 'workspace'
          ? { href: '/api/workspaces/workspace-1' }
          : relation === 'story-candidates'
            ? {
                href: '/api/workspaces/workspace-1/story-candidates',
              }
            : undefined,
    };
    const extractionPost = vi.fn().mockResolvedValue(extractionState);
    const runInboxAnalyst = vi.fn(
      async (_request: unknown, onEvent: (event: IntakeAgentEvent) => void) => {
        onEvent({ id: 'inbox:1', event: 'complete', data: '' });
      },
    );
    window.evidenceDesktop = { runInboxAnalyst } as never;
    const { state } = collectionState({ extractionPost });

    render(
      <MemoryRouter
        initialEntries={['/api/workspaces/workspace-1/inbox-items']}
      >
        <InboxCollectionView resourceState={state} />
        <LocationProbe />
      </MemoryRouter>,
    );

    fireEvent.click(
      screen.getByRole('checkbox', { name: '选择来源 Customer interview' }),
    );
    fireEvent.click(screen.getByRole('button', { name: '冻结修订并分析' }));

    await waitFor(() =>
      expect(extractionPost).toHaveBeenCalledWith({
        data: { inboxItemIds: ['item-1'] },
      }),
    );
    expect(runInboxAnalyst).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace-1',
        extractionId: 'extraction-1',
      }),
      expect.any(Function),
    );
    await waitFor(() =>
      expect(screen.getByTestId('location').textContent).toBe(
        '/api/workspaces/workspace-1/story-candidates',
      ),
    );
  });

  it('requires Desktop capability before running Inbox Analyst', () => {
    const { state } = collectionState();

    render(
      <MemoryRouter>
        <InboxCollectionView resourceState={state} />
      </MemoryRouter>,
    );

    fireEvent.click(
      screen.getByRole('checkbox', { name: '选择来源 Customer interview' }),
    );

    expect(
      (
        screen.getByRole('button', {
          name: '冻结修订并分析',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      screen.getByText(
        '请在已绑定本地仓库的 Evidence Desktop 中运行 Inbox Analyst。',
      ),
    ).toBeTruthy();
  });

  it('captures a repository-relative Markdown snapshot through Desktop', async () => {
    const source = {
      sourceKind: 'local_markdown' as const,
      externalKey: 'workspace:docs/request.md',
      title: 'Request',
      body: '# Request',
      contentType: 'text/markdown' as const,
      uri: null,
      providerMetadata: { relativePath: 'docs/request.md' },
      sourceUpdatedAt: '2026-07-21T10:00:00.000Z',
    };
    const readInboxMarkdown = vi.fn().mockResolvedValue(source);
    window.evidenceDesktop = { readInboxMarkdown } as never;
    const created = inboxItemState({ title: 'Request' });
    const post = vi.fn().mockResolvedValue(created);
    const refresh = vi
      .fn()
      .mockResolvedValue(collectionState({ items: [created] }).state);
    const { state } = collectionState({ items: [], post, refresh });

    render(
      <MemoryRouter>
        <InboxCollectionView resourceState={state} />
      </MemoryRouter>,
    );

    expect(screen.getAllByRole('button', { name: '添加来源' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: '添加来源' }));
    fireEvent.click(screen.getByRole('radio', { name: '仓库 Markdown' }));
    fireEvent.change(screen.getByLabelText('仓库相对路径'), {
      target: { value: 'docs/request.md' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存来源' }));

    await waitFor(() =>
      expect(readInboxMarkdown).toHaveBeenCalledWith(
        'workspace-1',
        'docs/request.md',
      ),
    );
    expect(post).toHaveBeenCalledWith({ data: source });
  });

  it('captures a manual source and refreshes the collection', async () => {
    const created = inboxItemState();
    const post = vi.fn().mockResolvedValue(created);
    const refreshedState = collectionState({ items: [created] }).state;
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

    expect(screen.getAllByRole('button', { name: '添加来源' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: '添加来源' }));
    expect(
      (
        screen.getByRole('radio', {
          name: '仓库 Markdown',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole('radio', {
          name: 'GitHub Issue',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.change(screen.getByLabelText('标题'), {
      target: { value: '  Customer interview  ' },
    });
    fireEvent.change(screen.getByLabelText('正文'), {
      target: { value: '# Interview notes' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存来源' }));

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
    expect(await screen.findAllByText('Customer interview')).not.toHaveLength(
      0,
    );
  });
});
