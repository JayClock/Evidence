import { render, screen } from '@testing-library/react';
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
    subType: 'EVIDENCE:contract',
    name: 'contract',
    label: 'Contract',
    definition: {
      description: 'Customer contract evidence',
      tags: ['legal', 'evidence'],
      attributes: [
        {
          id: 'attr-1',
          name: 'contractNumber',
          label: 'Contract number',
          type: 'string',
          description: null,
          isBusinessKey: true,
          relation: false,
          visibility: null,
        },
      ],
      behaviors: [],
    },
    createdAt: '2026-01-02T03:04:05Z',
    updatedAt: '2026-01-03T04:05:06Z',
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
  it('renders logical entities as a table', () => {
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
    expect(screen.getByText('Customer contract evidence')).toBeTruthy();
    expect(screen.getByText('1 attrs')).toBeTruthy();
    expect(
      (
        screen.getByRole('link', { name: 'Open' }) as unknown as {
          getAttribute(name: string): string | null;
        }
      ).getAttribute('href'),
    ).toBe('/api/workspaces/default-workspace/logical-entities/entity-1');
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
    expect(screen.getByText('1 attributes')).toBeTruthy();
    expect(screen.getByText('0 behaviors')).toBeTruthy();
  });
});
