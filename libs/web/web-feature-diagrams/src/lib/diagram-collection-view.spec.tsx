import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { DiagramCollectionResource, State } from '@evidence/api-client';

import { DiagramCollectionView } from './diagram-collection-view';

vi.mock('@evidence/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@evidence/api-client')>()),
  toAppPathname: (pathname: string) =>
    pathname.startsWith('/api/') ? pathname.slice('/api'.length) : pathname,
}));

const links = (...rels: string[]) => ({
  getAll: () => rels.map((rel) => ({ rel, href: `/api/${rel}` })),
});

const diagramCollectionState = {
  data: {
    page: {
      totalElements: 1,
    },
  },
  collection: [
    {
      data: {
        id: 'diagram-1',
        title: 'Fulfillment Flow',
        type: 'context-map',
        status: 'draft',
        createdAt: '2026-01-02T03:04:05Z',
        updatedAt: '2026-01-03T04:05:06Z',
      },
      links: links('self', 'workspace'),
    },
  ],
};

describe('DiagramCollectionView', () => {
  it('renders diagrams as a table', () => {
    render(
      <MemoryRouter>
        <DiagramCollectionView
          resourceState={
            diagramCollectionState as unknown as State<DiagramCollectionResource>
          }
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('table')).toBeTruthy();
    expect(screen.getByText('Fulfillment Flow')).toBeTruthy();
    expect(screen.getByText('Type')).toBeTruthy();
    expect(screen.getByText('Status')).toBeTruthy();
    expect(screen.getByText('context-map')).toBeTruthy();
    expect(screen.getByText('draft')).toBeTruthy();
  });

  it('renders an empty table state', () => {
    render(
      <MemoryRouter>
        <DiagramCollectionView
          resourceState={
            {
              data: { page: { totalElements: 0 } },
              collection: [],
            } as unknown as State<DiagramCollectionResource>
          }
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('table')).toBeTruthy();
    expect(screen.getByText('No diagrams found.')).toBeTruthy();
  });
});
