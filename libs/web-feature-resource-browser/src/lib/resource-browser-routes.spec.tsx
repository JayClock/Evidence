import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  useResource,
  type RootResource,
  type State,
  type UserResource,
} from '@evidence/api-client';
import type { Mock } from 'vitest';

import { ResourceBrowserRoutes } from './resource-browser-routes';

vi.mock('@evidence/api-client', () => ({
  apiClient: {
    go: (path: string) => ({ kind: 'dynamic', path }),
  },
  normalizeContentType: (contentType: string | null) =>
    contentType?.split(';')[0]?.trim().toLowerCase() ?? '',
  resourceContentTypes: {
    workspaces: 'application/vnd.evidence.workspaces+json',
    workspace: 'application/vnd.evidence.workspace+json',
    diagrams: 'application/vnd.evidence.diagrams+json',
    logicalEntities: 'application/vnd.evidence.logical-entities+json',
  },
  toApiPathname: (pathname: string) =>
    pathname === '/' || pathname.startsWith('/api')
      ? pathname
      : `/api${pathname}`,
  toAppPathname: (pathname: string) =>
    pathname.startsWith('/api/') ? pathname.slice('/api'.length) : pathname,
  useResource: vi.fn(),
}));

type ResourceMarker =
  | {
      kind: 'health' | 'workspaces';
    }
  | {
      kind: 'dynamic';
      path: string;
    };

const links = (...rels: string[]) => ({
  getAll: () => rels.map((rel) => ({ rel, href: `/api/${rel}` })),
});

const rootState = {
  data: {},
  links: links('self', 'health', 'default-user'),
  follow: (rel: string): ResourceMarker => ({
    kind: rel === 'health' ? 'health' : 'workspaces',
  }),
};

const userState = {
  data: {
    id: 'desktop-user',
    name: 'Desktop User',
    email: 'desktop@evidence.local',
  },
  links: links('self', 'workspaces', 'sidebar'),
  follow: (): ResourceMarker => ({ kind: 'workspaces' }),
};

const workspaceState = {
  data: {
    id: 'default-workspace',
    title: 'Default Workspace',
    description: 'Seed workspace for local desktop usage',
  },
  links: links('self', 'members', 'diagrams', 'logical-entities'),
  contentHeaders: () =>
    new Headers({ 'content-type': 'application/vnd.evidence.workspace+json' }),
};

const workspaceCollectionState = {
  data: {
    page: {
      totalElements: 1,
    },
  },
  collection: [workspaceState],
  contentHeaders: () =>
    new Headers({ 'content-type': 'application/vnd.evidence.workspaces+json' }),
};

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
  contentHeaders: () =>
    new Headers({ 'content-type': 'application/vnd.evidence.diagrams+json' }),
};

const useResourceMock = useResource as unknown as Mock;

function renderRoutes(initialEntry = '/') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <ResourceBrowserRoutes
        rootState={rootState as unknown as State<RootResource>}
        userState={userState as unknown as State<UserResource>}
      />
    </MemoryRouter>,
  );
}

describe('ResourceBrowserRoutes', () => {
  beforeEach(() => {
    useResourceMock.mockImplementation((resource: ResourceMarker) => {
      switch (resource.kind) {
        case 'health':
          return {
            loading: false,
            error: null,
            data: { service: 'evidence-server', status: 'ok' },
          };
        case 'workspaces':
          return {
            loading: false,
            error: null,
            resourceState: workspaceCollectionState,
          };
        case 'dynamic':
          return {
            loading: false,
            error: null,
            resourceState: diagramCollectionState,
          };
      }
    });
  });

  it('renders the overview and embedded workspaces collection', () => {
    renderRoutes();

    expect(screen.getByText('Evidence Workspace Console')).toBeTruthy();
    expect(screen.getByText('Default Workspace')).toBeTruthy();
    expect(screen.getByText('1 total')).toBeTruthy();
  });

  it('renders health from the root health relation', () => {
    renderRoutes('/health');

    expect(screen.getByText('evidence-server: ok')).toBeTruthy();
  });

  it('renders diagrams as a table for diagram collection resources', () => {
    renderRoutes('/workspaces/default-workspace/diagrams');

    expect(screen.getByRole('table')).toBeTruthy();
    expect(screen.getByText('Fulfillment Flow')).toBeTruthy();
    expect(screen.getByText('Type')).toBeTruthy();
    expect(screen.getByText('Status')).toBeTruthy();
    expect(screen.getByText('context-map')).toBeTruthy();
    expect(screen.getByText('draft')).toBeTruthy();
  });
});
