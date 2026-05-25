import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useResource } from '@evidence/api-client';
import type { Mock } from 'vitest';

import App from './app';

vi.mock('@evidence/api-client', () => ({
  getRootResource: () => ({ kind: 'root' }),
  useResource: vi.fn(),
}));

type ResourceMarker = {
  kind: 'root' | 'health' | 'user' | 'sidebar' | 'workspaces';
};

const links = (...rels: string[]) => ({
  getAll: () => rels.map((rel) => ({ rel, href: `/${rel}` })),
});

const rootState = {
  data: {},
  links: links('self', 'health', 'default-user'),
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
  links: links('self', 'workspaces', 'sidebar'),
  follow: (rel: string): ResourceMarker => ({
    kind: rel === 'sidebar' ? 'sidebar' : 'workspaces',
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
            key: 'workspaces',
            label: 'Workspaces',
            type: 'resource',
            path: '/api/users/desktop-user/workspaces',
            icon: 'layout-dashboard',
          },
        ],
      },
    ],
  },
  links: links('self', 'user'),
};

const workspaceState = {
  data: {
    id: 'default-workspace',
    title: 'Default Workspace',
    description: 'Seed workspace for local desktop usage',
  },
  links: links('self', 'members', 'diagrams', 'logical-entities'),
};

const workspaceCollectionState = {
  data: {
    page: {
      totalElements: 1,
    },
  },
  collection: [workspaceState],
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
        case 'workspaces':
          return {
            loading: false,
            error: null,
            resourceState: workspaceCollectionState,
          };
      }
    });
  });

  it('renders HAL-discovered default user, sidebar, and workspace', () => {
    renderApp();

    expect(screen.getAllByText('Evidence Workspace Console').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Desktop User').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Workspaces').length).toBeGreaterThan(0);
    expect(screen.getByText('Default Workspace')).toBeTruthy();
    expect(screen.getByText('1 total')).toBeTruthy();
  });

  it('follows the health relation from the API root', () => {
    renderApp('/health');

    expect(screen.getByText('evidence-server: ok')).toBeTruthy();
  });
});
