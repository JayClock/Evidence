import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useResource } from '@evidence/api-client';
import type { Mock } from 'vitest';

import App from './app';

vi.mock('@evidence/api-client', () => ({
  apiClient: {
    go: (path: string) => ({ kind: 'dynamic', path }),
  },
  getRootResource: () => ({ kind: 'root' }),
  normalizeContentType: (contentType: string | null) =>
    contentType?.split(';')[0]?.trim().toLowerCase() ?? '',
  resourceContentTypes: {
    memberships: 'application/vnd.evidence.memberships+json',
    workspace: 'application/vnd.evidence.workspace+json',
    diagrams: 'application/vnd.evidence.diagrams+json',
    logicalEntities: 'application/vnd.evidence.logical-entities+json',
  },
  toApiPathname: (pathname: string) =>
    pathname === '/' || pathname.startsWith('/api')
      ? pathname
      : `/api${pathname}`,
  useResource: vi.fn(),
}));

type ResourceMarker = {
  kind: 'root' | 'health' | 'user' | 'sidebar' | 'memberships';
};

const links = (...rels: string[]) => ({
  getAll: () => rels.map((rel) => ({ rel, href: `/${rel}` })),
});

const rootState = {
  data: {},
  links: links('self', 'health', 'current-user'),
  follow: (rel: string): ResourceMarker => ({
    kind: rel === 'health' ? 'health' : 'user',
  }),
};

const userState = {
  data: {
    id: 'desktop-user',
    name: 'Desktop User',
    email: 'desktop@evidence.local',
  },
  links: links('self', 'memberships', 'create-workspace', 'sidebar'),
  follow: (rel: string): ResourceMarker & { post?: Mock } => ({
    kind: rel === 'sidebar' ? 'sidebar' : 'memberships',
    ...(rel === 'create-workspace' ? { post: vi.fn() } : {}),
  }),
};

const sidebarState = {
  data: {
    sections: [
      {
        title: 'USER',
        key: 'user',
        defaultOpen: true,
        items: [
          {
            key: 'logical-entities',
            label: 'Logical Entities',
            type: 'resource',
            href: '/api/workspaces/default-workspace/logical-entities',
            path: '/api/workspaces/default-workspace/logical-entities',
            icon: 'database',
          },
        ],
      },
    ],
  },
  links: links('self', 'user'),
};

const workspace = {
  _links: {
    self: { href: '/api/workspaces/default-workspace' },
    members: { href: '/api/workspaces/default-workspace/members' },
    diagram: { href: '/api/workspaces/default-workspace/diagram' },
    'logical-entities': {
      href: '/api/workspaces/default-workspace/logical-entities',
    },
  },
  id: 'default-workspace',
  title: 'Default Workspace',
  description: 'Seed workspace for local desktop usage',
  status: 'active',
  metadata: {
    repositoryRoot: '/Users/zhongjie/Documents/GitHub/Evidence',
  },
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const membershipCollectionState = {
  data: {
    page: {
      totalElements: 1,
    },
  },
  collection: [
    {
      data: {
        id: 'default-workspace-owner',
        workspace,
        role: 'owner',
      },
    },
  ],
  contentHeaders: () =>
    new Headers({
      'content-type': 'application/vnd.evidence.memberships+json',
    }),
};

const useResourceMock = useResource as unknown as Mock;

function renderApp(initialEntry = '/') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <App />
    </MemoryRouter>,
  );
}

describe('App', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    useResourceMock.mockImplementation((resource: ResourceMarker) => {
      switch (resource.kind) {
        case 'root':
          return { loading: false, error: null, resourceState: rootState };
        case 'health':
          return {
            loading: false,
            error: null,
            data: { service: 'evidence-server', status: 'ok' },
          };
        case 'user':
          return { loading: false, error: null, resourceState: userState };
        case 'sidebar':
          return { loading: false, error: null, resourceState: sidebarState };
        case 'memberships':
          return {
            loading: false,
            error: null,
            resourceState: membershipCollectionState,
            resource: { refresh: vi.fn() },
          };
      }
    });
  });

  it('renders HAL-discovered default user, sidebar, and active workspace', () => {
    renderApp();

    expect(
      screen.getAllByText('Evidence Workspace Console').length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText('Desktop User').length).toBeGreaterThan(0);
    expect(screen.queryByText('Workspaces')).toBeNull();
    expect(screen.queryByText('Diagram')).toBeNull();
    expect(screen.getByText('Logical Entities')).toBeTruthy();
    expect(screen.getByText('Default Workspace')).toBeTruthy();
    expect(screen.queryByText('1 total')).toBeNull();
  });

  it('follows the health relation from the API root', () => {
    renderApp('/health');

    expect(screen.getByText('evidence-server: ok')).toBeTruthy();
  });
});
