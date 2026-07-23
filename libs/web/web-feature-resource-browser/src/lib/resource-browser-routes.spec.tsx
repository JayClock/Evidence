import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  useResource,
  type RootResource,
  type State,
  type UserResource,
} from '@evidence/api-client';
import type { Mock } from 'vitest';

import { ResourceBrowserRoutes } from './resource-browser-routes';

vi.mock('@evidence/api-client', () => {
  const dynamicPromises = new Map<string, Promise<unknown>>();

  return {
    apiClient: {
      go: (path: string) => ({
        kind: 'dynamic',
        path,
        get: () => {
          if (!dynamicPromises.has(path)) {
            dynamicPromises.set(
              path,
              Promise.resolve(dynamicStateForPath(path)),
            );
          }

          return dynamicPromises.get(path);
        },
      }),
    },
    normalizeContentType: (contentType: string | null) =>
      contentType?.split(';')[0]?.trim().toLowerCase() ?? '',
    resourceContentTypes: {
      memberships: 'application/vnd.evidence.memberships+json',
      workspace: 'application/vnd.evidence.workspace+json',
      diagrams: 'application/vnd.evidence.diagrams+json',
      diagram: 'application/vnd.evidence.diagram+json',
      inboxItem: 'application/vnd.evidence.inbox-item+json',
      inboxItems: 'application/vnd.evidence.inbox-items+json',
      inboxRevision: 'application/vnd.evidence.inbox-revision+json',
      inboxRevisions: 'application/vnd.evidence.inbox-revisions+json',
      storyCandidate: 'application/vnd.evidence.story-candidate+json',
      storyCandidates: 'application/vnd.evidence.story-candidates+json',
      story: 'application/vnd.evidence.story+json',
      stories: 'application/vnd.evidence.stories+json',
      storyRevision: 'application/vnd.evidence.story-revision+json',
      storyRevisions: 'application/vnd.evidence.story-revisions+json',
      logicalEntity: 'application/vnd.evidence.logical-entity+json',
      logicalEntities: 'application/vnd.evidence.logical-entities+json',
    },
    toApiPathname: (pathname: string) =>
      pathname === '/' || pathname.startsWith('/api')
        ? pathname
        : `/api${pathname}`,
    useResource: vi.fn(),
  };
});

vi.mock('@evidence/web-feature-delivery', () => ({
  CreateStoryCandidateDialog: () => <div>Propose Story action</div>,
  StoryCandidateCollectionView: () => <div>Story Candidate collection</div>,
  StoryCandidateDetailView: () => <div>Story Candidate detail</div>,
  StoryCollectionView: () => <div>Story collection</div>,
  StoryDetailView: () => <div>Story detail</div>,
  StoryRevisionCollectionView: () => <div>Story revisions</div>,
  StoryRevisionDetailView: () => <div>Story revision</div>,
}));

vi.mock('@evidence/web-feature-diagrams', () => ({
  DiagramCollectionView: () => <div>Diagram collection</div>,
  DiagramDetailView: () => <div>Diagram detail</div>,
}));

vi.mock('@evidence/web-feature-inbox', () => ({
  InboxCollectionView: () => <div>Inbox collection</div>,
  InboxItemDetailView: () => <div>Inbox item</div>,
  InboxRevisionCollectionView: () => <div>Inbox revisions</div>,
  InboxRevisionDetailView: () => <div>Inbox revision</div>,
}));

type ResourceMarker =
  | {
      kind:
        | 'health'
        | 'memberships'
        | 'diagram'
        | 'diagram-nodes'
        | 'diagram-edges';
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
  links: links('self', 'health', 'current-user'),
  follow: (rel: string): ResourceMarker => ({
    kind: rel === 'health' ? 'health' : 'memberships',
  }),
};

const userState = {
  data: {
    id: 'desktop-user',
    name: 'Desktop User',
    email: 'desktop@evidence.local',
  },
  links: links('self', 'memberships', 'sidebar'),
  follow: (): ResourceMarker => ({ kind: 'memberships' }),
};

const workspaceState = {
  data: {
    id: 'default-workspace',
    title: 'Default Workspace',
    description: 'Seed workspace for local desktop usage',
  },
  follow: (rel: string): ResourceMarker => ({
    kind: rel === 'diagram' ? 'diagram' : 'memberships',
  }),
  links: links('self', 'members', 'diagram', 'inbox-items', 'logical-entities'),
  contentHeaders: () =>
    new Headers({ 'content-type': 'application/vnd.evidence.workspace+json' }),
};

const membershipCollectionState = {
  data: {
    page: {
      totalElements: 1,
    },
  },
  collection: [workspaceState],
  contentHeaders: () =>
    new Headers({
      'content-type': 'application/vnd.evidence.memberships+json',
    }),
};

const diagramState = {
  data: {
    id: 'model',
    title: 'Model',
    createdAt: '2026-01-02T03:04:05Z',
    updatedAt: '2026-01-03T04:05:06Z',
  },
  follow: (rel: string): ResourceMarker => ({
    kind: rel === 'nodes' ? 'diagram-nodes' : 'diagram-edges',
  }),
  links: links('self', 'workspace', 'nodes', 'edges'),
  contentHeaders: () =>
    new Headers({ 'content-type': 'application/vnd.evidence.diagram+json' }),
};

const diagramNodeCollectionState = {
  collection: [],
};

const diagramEdgeCollectionState = {
  collection: [],
};

const inboxItemCollectionState = {
  data: {
    page: {
      totalElements: 0,
    },
  },
  collection: [],
  contentHeaders: () =>
    new Headers({
      'content-type': 'application/vnd.evidence.inbox-items+json',
    }),
};

const inboxItemState = {
  contentHeaders: () =>
    new Headers({
      'content-type': 'application/vnd.evidence.inbox-item+json',
    }),
};

const inboxRevisionCollectionState = {
  contentHeaders: () =>
    new Headers({
      'content-type': 'application/vnd.evidence.inbox-revisions+json',
    }),
};

const inboxRevisionState = {
  contentHeaders: () =>
    new Headers({
      'content-type': 'application/vnd.evidence.inbox-revision+json',
    }),
};

const storyCandidateCollectionState = {
  contentHeaders: () =>
    new Headers({
      'content-type': 'application/vnd.evidence.story-candidates+json',
    }),
};

const storyCandidateState = {
  contentHeaders: () =>
    new Headers({
      'content-type': 'application/vnd.evidence.story-candidate+json',
    }),
};

const storyCollectionState = {
  contentHeaders: () =>
    new Headers({ 'content-type': 'application/vnd.evidence.stories+json' }),
};

const storyState = {
  contentHeaders: () =>
    new Headers({ 'content-type': 'application/vnd.evidence.story+json' }),
};

const storyRevisionCollectionState = {
  contentHeaders: () =>
    new Headers({
      'content-type': 'application/vnd.evidence.story-revisions+json',
    }),
};

const storyRevisionState = {
  contentHeaders: () =>
    new Headers({
      'content-type': 'application/vnd.evidence.story-revision+json',
    }),
};

const logicalEntityCollectionState = {
  data: {
    page: {
      totalElements: 1,
    },
  },
  collection: [
    {
      data: {
        id: 'entity-1',
        type: 'EVIDENCE',
        subType: 'EVIDENCE:contract',
        name: 'contract',
        label: 'Contract',
        description: 'Customer contract evidence',
        attributes: [],
        createdAt: '2026-01-02T03:04:05Z',
        updatedAt: '2026-01-03T04:05:06Z',
      },
      links: links('self', 'workspace'),
    },
  ],
  contentHeaders: () =>
    new Headers({
      'content-type': 'application/vnd.evidence.logical-entities+json',
    }),
};

function dynamicStateForPath(path: string) {
  if (path.includes('/stories/') && path.includes('/revisions/')) {
    return storyRevisionState;
  }

  if (path.includes('/stories/') && path.endsWith('/revisions')) {
    return storyRevisionCollectionState;
  }

  if (/\/stories\/[^/]+$/.test(path)) {
    return storyState;
  }

  if (path.endsWith('/stories')) {
    return storyCollectionState;
  }

  if (/\/story-candidates\/[^/]+$/.test(path)) {
    return storyCandidateState;
  }

  if (path.endsWith('/story-candidates')) {
    return storyCandidateCollectionState;
  }

  if (path.endsWith('/revisions/revision-1')) {
    return inboxRevisionState;
  }

  if (path.endsWith('/revisions')) {
    return inboxRevisionCollectionState;
  }

  if (path.endsWith('/inbox-items/item-1')) {
    return inboxItemState;
  }

  if (path.endsWith('/inbox-items')) {
    return inboxItemCollectionState;
  }

  if (path.includes('/logical-entities')) {
    return logicalEntityCollectionState;
  }

  if (path === '/api/users/desktop-user/memberships') {
    return membershipCollectionState;
  }

  if (path === '/api/workspaces/default-workspace') {
    return workspaceState;
  }

  return diagramState;
}

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
        case 'memberships':
          return {
            loading: false,
            error: null,
            resourceState: membershipCollectionState,
          };
        case 'diagram':
          return {
            loading: false,
            error: null,
            resourceState: diagramState,
          };
        case 'diagram-nodes':
          return {
            loading: false,
            error: null,
            resourceState: diagramNodeCollectionState,
          };
        case 'diagram-edges':
          return {
            loading: false,
            error: null,
            resourceState: diagramEdgeCollectionState,
          };
        case 'dynamic':
          return {
            loading: false,
            error: null,
            resourceState: diagramState,
          };
      }
    });
  });

  it('renders the overview without the workspace list page', () => {
    renderRoutes();

    expect(screen.getByText('Evidence Workspace Console')).toBeTruthy();
    expect(screen.getByText('Desktop User')).toBeTruthy();
    expect(screen.queryByText('Default Workspace')).toBeNull();
    expect(screen.queryByText('1 total')).toBeNull();
  });

  it('does not render membership collection resources as a list page', async () => {
    await act(async () => {
      renderRoutes('/users/desktop-user/memberships');
    });

    expect(screen.queryByText('Default Workspace')).toBeNull();
    expect(screen.queryByText('Workspaces')).toBeNull();
    expect(screen.queryByText('1 total')).toBeNull();
  });

  it('renders health from the root health relation', () => {
    renderRoutes('/health');

    expect(screen.getByText('evidence-server: ok')).toBeTruthy();
  });

  it('renders the projected diagram on the workspace home resource', async () => {
    await act(async () => {
      renderRoutes('/workspaces/default-workspace');
    });

    expect(await screen.findByText('Diagram detail')).toBeTruthy();
  });

  it.each([
    ['/workspaces/default-workspace/inbox-items', 'Inbox collection'],
    ['/workspaces/default-workspace/inbox-items/item-1', 'Inbox item'],
    [
      '/workspaces/default-workspace/inbox-items/item-1/revisions',
      'Inbox revisions',
    ],
    [
      '/workspaces/default-workspace/inbox-items/item-1/revisions/revision-1',
      'Inbox revision',
    ],
  ])('renders the Inbox feature for %s', async (path, expected) => {
    await act(async () => {
      renderRoutes(path);
    });

    expect(await screen.findByText(expected)).toBeTruthy();
  });

  it.each([
    [
      '/workspaces/default-workspace/story-candidates',
      'Story Candidate collection',
    ],
    [
      '/workspaces/default-workspace/story-candidates/candidate-1',
      'Story Candidate detail',
    ],
    ['/workspaces/default-workspace/stories', 'Story collection'],
    ['/workspaces/default-workspace/stories/story-1', 'Story detail'],
    [
      '/workspaces/default-workspace/stories/story-1/revisions',
      'Story revisions',
    ],
    [
      '/workspaces/default-workspace/stories/story-1/revisions/story-revision-1',
      'Story revision',
    ],
  ])('renders the Delivery feature for %s', async (path, expected) => {
    await act(async () => {
      renderRoutes(path);
    });

    expect(await screen.findByText(expected)).toBeTruthy();
  });

  it('renders logical entities as a table for logical entity collection resources', async () => {
    await act(async () => {
      renderRoutes('/workspaces/default-workspace/logical-entities');
    });

    expect(await screen.findByRole('table')).toBeTruthy();
    expect(screen.getByText('Logical Entities')).toBeTruthy();
    expect(screen.getAllByText('Contract').length).toBeGreaterThan(0);
  });
});
