import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type {
  LogicalEntityCollectionResource,
  LogicalEntityResource,
  State,
} from '@evidence/api-client';

import {
  LogicalEntityCollectionView,
  LogicalEntityDetailView,
} from './logical-entity-collection-view';

const links = (...rels: string[]) => ({
  getAll: () =>
    rels.map((rel) => ({
      rel,
      href:
        rel === 'self'
          ? '/api/workspaces/default-workspace/logical-entities/entity-1'
          : `/api/${rel}`,
    })),
});

const logicalEntityState = {
  data: {
    id: 'entity-1',
    type: 'EVIDENCE',
    subType: 'contract',
    name: 'contract',
    label: 'Contract',
    content: 'Customer contract evidence',
  },
  links: links('self', 'workspace', 'collection'),
};

const collectionPost = vi.fn();
const collectionRefresh = vi.fn();

const collectionState = {
  data: {
    page: {
      number: 1,
      size: 50,
      totalElements: 1,
      totalPages: 1,
    },
  },
  collection: [logicalEntityState],
  follow: () => ({ post: collectionPost, refresh: collectionRefresh }),
};

describe('LogicalEntityCollectionView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    collectionPost.mockResolvedValue(logicalEntityState);
    collectionRefresh.mockResolvedValue(collectionState);
  });
  it('renders logical entities as a table with a focused inspector', () => {
    render(
      <MemoryRouter>
        <LogicalEntityCollectionView
          resourceState={
            collectionState as unknown as State<LogicalEntityCollectionResource>
          }
        />
      </MemoryRouter>,
    );

    const workspace = screen.getByRole('region', {
      name: '逻辑实体工作区',
    }) as unknown as { getAttribute: (name: string) => string | null };
    expect(workspace.getAttribute('class')).toContain(
      'lg:grid-cols-[minmax(0,1fr)_19.75rem]',
    );
    expect(screen.getByRole('table')).toBeTruthy();
    expect(screen.getAllByText('Contract').length).toBeGreaterThan(0);
    expect(screen.getAllByText('contract').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Evidence').length).toBeGreaterThan(0);
    expect(screen.queryByRole('columnheader', { name: 'Content' })).toBeNull();
    expect(screen.getByText('Customer contract evidence')).toBeTruthy();
    expect(screen.getByRole('button', { name: '查看 Contract' })).toBeTruthy();
  });

  it('creates a logical entity through the collection relation', async () => {
    render(
      <MemoryRouter>
        <LogicalEntityCollectionView
          resourceState={
            collectionState as unknown as State<LogicalEntityCollectionResource>
          }
        />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: '新增实体' }));
    fireEvent.change(screen.getByLabelText('标签'), {
      target: { value: 'Policy' },
    });
    fireEvent.change(screen.getByLabelText('稳定名称'), {
      target: { value: 'policy' },
    });
    fireEvent.click(screen.getByRole('button', { name: '创建实体' }));

    await waitFor(() => expect(collectionPost).toHaveBeenCalledOnce());
    expect(collectionPost).toHaveBeenCalledWith({
      data: {
        content: '',
        label: 'Policy',
        name: 'policy',
        subType: null,
        type: 'EVIDENCE',
      },
    });
    expect(collectionRefresh).toHaveBeenCalledOnce();
  });

  it('opens logical entity markdown content in a drawer', () => {
    render(
      <MemoryRouter>
        <LogicalEntityCollectionView
          resourceState={
            collectionState as unknown as State<LogicalEntityCollectionResource>
          }
        />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: '打开完整内容' }));

    const dialog = screen.getByRole('dialog');

    expect(dialog).toBeTruthy();
    expect(within(dialog).getByText('Customer contract evidence')).toBeTruthy();
    expect(within(dialog).queryByText('Logical entity')).toBeNull();
    expect(within(dialog).queryByText('ID')).toBeNull();
    expect(within(dialog).queryByText('entity-1')).toBeNull();
  });

  it('renders an empty table state', () => {
    render(
      <MemoryRouter>
        <LogicalEntityCollectionView
          resourceState={
            {
              data: { page: { totalElements: 0 } },
              collection: [],
            } as unknown as State<LogicalEntityCollectionResource>
          }
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('table')).toBeTruthy();
    expect(screen.getByText('没有匹配的逻辑实体')).toBeTruthy();
  });
});

describe('LogicalEntityDetailView', () => {
  it('renders a logical entity detail resource', () => {
    render(
      <LogicalEntityDetailView
        resourceState={
          logicalEntityState as unknown as State<LogicalEntityResource>
        }
      />,
    );

    expect(screen.getByText('逻辑实体')).toBeTruthy();
    expect(screen.getByText('Contract')).toBeTruthy();
    expect(screen.getByText('Customer contract evidence')).toBeTruthy();
  });
});
