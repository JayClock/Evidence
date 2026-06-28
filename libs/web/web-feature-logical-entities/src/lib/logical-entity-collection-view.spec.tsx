import { fireEvent, render, screen, within } from '@testing-library/react';
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
};

describe('LogicalEntityCollectionView', () => {
  it('renders logical entities as a table without content cells', () => {
    render(
      <MemoryRouter>
        <LogicalEntityCollectionView
          resourceState={
            collectionState as unknown as State<LogicalEntityCollectionResource>
          }
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('table')).toBeTruthy();
    expect(screen.getAllByText('Contract').length).toBeGreaterThan(0);
    expect(screen.getByText('contract')).toBeTruthy();
    expect(screen.getByText('Evidence')).toBeTruthy();
    expect(screen.queryByRole('columnheader', { name: 'Content' })).toBeNull();
    expect(screen.queryByText('Customer contract evidence')).toBeNull();
    expect(screen.getByRole('button', { name: 'Open Contract' })).toBeTruthy();
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

    fireEvent.click(screen.getByRole('button', { name: 'Open Contract' }));

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
    expect(screen.getByText('No logical entities found')).toBeTruthy();
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

    expect(screen.getByText('Logical entity')).toBeTruthy();
    expect(screen.getByText('Contract')).toBeTruthy();
    expect(screen.getByText('Customer contract evidence')).toBeTruthy();
  });
});
