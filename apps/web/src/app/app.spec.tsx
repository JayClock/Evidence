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
  kind: 'root' | 'health' | 'user' | 'workspaces';
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
  links: links('self', 'workspaces'),
  follow: (): ResourceMarker => ({ kind: 'workspaces' }),
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
        case 'workspaces':
          return {
            loading: false,
            error: null,
            resourceState: workspaceCollectionState,
          };
      }
    });
  });

  it('renders HAL-discovered default user and workspace', () => {
    renderApp();

    expect(screen.getByText('Evidence Workspace Console')).toBeTruthy();
    expect(screen.getByText('Desktop User')).toBeTruthy();
    expect(screen.getByText('Default Workspace')).toBeTruthy();
    expect(screen.getByText('1 total')).toBeTruthy();
  });

  it('follows the health relation from the API root', () => {
    renderApp('/health');

    expect(screen.getByText('evidence-server: ok')).toBeTruthy();
  });
});
