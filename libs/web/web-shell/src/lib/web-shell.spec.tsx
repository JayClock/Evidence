import { isValidElement, type ComponentProps, type ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  useResource,
  type State,
  type UserResource,
} from '@evidence/api-client';
import type { Mock } from 'vitest';

import { WebShell } from './web-shell';

vi.mock('@evidence/api-client', () => ({
  useResource: vi.fn(),
}));

vi.mock('@evidence/ui', () => {
  const Fragment = ({ children }: { children?: ReactNode }) => children;
  const Div = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  const Span = ({ children }: { children?: ReactNode }) => (
    <span>{children}</span>
  );
  const Button = ({
    asChild,
    children,
    ...props
  }: {
    asChild?: boolean;
    children?: ReactNode;
  } & ComponentProps<'button'>) => {
    if (asChild && isValidElement(children)) {
      return children;
    }

    return (
      <button type="button" {...props}>
        {children}
      </button>
    );
  };
  const Input = (props: ComponentProps<'input'>) => <input {...props} />;
  const Textarea = (props: ComponentProps<'textarea'>) => (
    <textarea {...props} />
  );

  return {
    Alert: Div,
    AlertDescription: Div,
    AlertTitle: Div,
    Avatar: Div,
    AvatarFallback: Div,
    Badge: Span,
    Button,
    Card: Div,
    CardAction: Div,
    CardContent: Div,
    CardDescription: Div,
    CardHeader: Div,
    CardTitle: Div,
    Dialog: Fragment,
    DialogClose: Fragment,
    DialogContent: Div,
    DialogDescription: Div,
    DialogFooter: Div,
    DialogHeader: Div,
    DialogTitle: Div,
    DropdownMenu: Fragment,
    DropdownMenuContent: Div,
    DropdownMenuGroup: Div,
    DropdownMenuItem: Div,
    DropdownMenuLabel: Div,
    DropdownMenuRadioGroup: Div,
    DropdownMenuRadioItem: Div,
    DropdownMenuSeparator: () => <hr />,
    DropdownMenuTrigger: Fragment,
    Field: Div,
    FieldDescription: Div,
    FieldError: Div,
    FieldGroup: Div,
    FieldLabel: ({ children, ...props }: ComponentProps<'label'>) => (
      <label {...props}>{children}</label>
    ),
    Input,
    Separator: () => <hr />,
    Sidebar: Div,
    SidebarContent: Div,
    SidebarFooter: Div,
    SidebarGroup: Div,
    SidebarGroupLabel: Div,
    SidebarHeader: Div,
    SidebarInset: Div,
    SidebarMenu: Div,
    SidebarMenuButton: Fragment,
    SidebarMenuItem: Div,
    SidebarMenuSkeleton: () => <div>Loading skeleton</div>,
    SidebarProvider: Fragment,
    SidebarRail: () => <div />,
    SidebarTrigger: Button,
    Spinner: () => <span>Loading</span>,
    Textarea,
    Toaster: () => null,
    TooltipProvider: Fragment,
    toast: {
      success: vi.fn(),
    },
  };
});

const links = (...rels: string[]) => ({
  getAll: () => rels.map((rel) => ({ rel, href: `/api/${rel}` })),
});

const createWorkspacePost = vi.fn();

const userState = {
  data: {
    id: 'desktop-user',
    name: 'Desktop User',
    email: 'desktop@evidence.local',
  },
  links: links('self', 'memberships', 'create-workspace', 'sidebar'),
  follow: (rel: string) => ({
    kind: rel,
    ...(rel === 'create-workspace' ? { post: createWorkspacePost } : {}),
  }),
};

const sidebarState = {
  data: {
    sections: [
      {
        title: '工作区',
        key: 'workspace',
        items: [
          {
            key: 'workspace-overview',
            label: '工作区总览',
            type: 'resource',
            href: '/api/workspaces/{workspaceId}',
            path: '/api/workspaces/{workspaceId}',
          },
        ],
      },
      {
        title: '来源',
        key: 'source',
        items: [
          {
            key: 'inbox-items',
            label: 'Inbox',
            type: 'resource',
            href: '/api/workspaces/{workspaceId}/inbox-items',
            path: '/api/workspaces/{workspaceId}/inbox-items',
          },
        ],
      },
      {
        title: '交付',
        key: 'delivery',
        items: [
          {
            key: 'stories',
            label: '故事看板',
            type: 'resource',
            href: '/api/workspaces/{workspaceId}/stories',
            path: '/api/workspaces/{workspaceId}/stories',
          },
          {
            key: 'tasking-queue',
            label: '交付计划',
            type: 'resource',
            href: '/api/workspaces/{workspaceId}/stories?filter=tasking',
            path: '/api/workspaces/{workspaceId}/stories?filter=tasking',
          },
          {
            key: 'pair-queue',
            label: 'Pair 工作台',
            type: 'resource',
            href: '/api/workspaces/{workspaceId}/stories?filter=pair',
            path: '/api/workspaces/{workspaceId}/stories?filter=pair',
          },
        ],
      },
      {
        title: '模型',
        key: 'model',
        items: [
          {
            key: 'logical-entities',
            label: '逻辑实体',
            type: 'resource',
            href: '/api/workspaces/{workspaceId}/logical-entities',
            path: '/api/workspaces/{workspaceId}/logical-entities',
          },
        ],
      },
    ],
  },
  links: links('self'),
};

const workspace = {
  _links: {
    self: { href: '/api/workspaces/default-workspace' },
    diagram: { href: '/api/workspaces/default-workspace/diagram' },
    'inbox-items': {
      href: '/api/workspaces/default-workspace/inbox-items',
    },
    stories: {
      href: '/api/workspaces/default-workspace/stories',
    },
    'logical-entities': {
      href: '/api/workspaces/default-workspace/logical-entities',
    },
  },
  id: 'default-workspace',
  title: 'Default Workspace',
  description: 'Seed workspace',
  status: 'active',
  metadata: {},
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const membershipCollectionState = {
  data: {
    page: {
      size: 20,
      totalElements: 1,
      totalPages: 1,
      number: 1,
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
  links: links('self'),
};

const workspaceResource = {
  refresh: vi.fn(),
};

const createdWorkspaceState = {
  data: { ...workspace, id: 'created-workspace', title: 'Local Model' },
  getLink: (rel: string) =>
    rel === 'self'
      ? { rel, href: '/api/workspaces/created-workspace' }
      : undefined,
  follow: () => ({ delete: vi.fn().mockResolvedValue(undefined) }),
};

const useResourceMock = useResource as unknown as Mock;

describe('WebShell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createWorkspacePost.mockResolvedValue(createdWorkspaceState);
    workspaceResource.refresh.mockResolvedValue(membershipCollectionState);
    Object.defineProperty(globalThis, 'evidenceDesktop', {
      configurable: true,
      value: undefined,
    });
    useResourceMock.mockImplementation((resourceLike: { kind: string }) => {
      if (resourceLike.kind === 'memberships') {
        return {
          loading: false,
          error: null,
          resourceState: membershipCollectionState,
          resource: workspaceResource,
        };
      }

      return {
        loading: false,
        error: null,
        resourceState: sidebarState,
      };
    });
  });

  it('renders the shell, sidebar resource, user menu, and content slot', () => {
    render(
      <MemoryRouter>
        <WebShell userState={userState as unknown as State<UserResource>}>
          <div>Route content</div>
        </WebShell>
      </MemoryRouter>,
    );

    expect(screen.getByText('Evidence 交付工作区')).toBeTruthy();
    expect(screen.getAllByText('Default Workspace').length).toBeGreaterThan(0);
    expect(screen.queryByText('Workspaces')).toBeNull();
    expect(screen.queryByText('Diagram')).toBeNull();
    expect(screen.getByRole('link', { name: 'Inbox' })).toHaveProperty(
      'pathname',
      '/api/workspaces/default-workspace/inbox-items',
    );
    expect(screen.getByText('逻辑实体')).toBeTruthy();
    expect(screen.getAllByText('Desktop User').length).toBeGreaterThan(0);
    expect(screen.getByText('Route content')).toBeTruthy();
  });

  it('marks only the query-specific delivery queue as current', () => {
    render(
      <MemoryRouter
        initialEntries={[
          '/api/workspaces/default-workspace/stories?filter=pair',
        ]}
      >
        <WebShell userState={userState as unknown as State<UserResource>}>
          <div>Route content</div>
        </WebShell>
      </MemoryRouter>,
    );

    const currentValue = (name: string) =>
      (
        screen.getByRole('link', { name }) as unknown as {
          getAttribute(attribute: string): string | null;
        }
      ).getAttribute('aria-current');
    expect(currentValue('Pair 工作台')).toBe('page');
    expect(currentValue('故事看板')).toBeNull();
    expect(currentValue('工作区总览')).toBeNull();
  });

  it('binds a Desktop repository without sending its path to the Server', async () => {
    const chooseRepository = vi.fn().mockResolvedValue({
      id: 'selection-1',
      name: 'repository',
      headCommitSha: 'a'.repeat(40),
    });
    const bindWorkspace = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis, 'evidenceDesktop', {
      configurable: true,
      value: { chooseRepository, bindWorkspace },
    });

    render(
      <MemoryRouter>
        <WebShell userState={userState as unknown as State<UserResource>}>
          <div>Route content</div>
        </WebShell>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: '选择目录' }));
    await waitFor(() => expect(chooseRepository).toHaveBeenCalledOnce());
    fireEvent.change(screen.getByLabelText('工作区名称'), {
      target: { value: 'Local Model' },
    });
    fireEvent.click(screen.getByRole('button', { name: '创建并切换' }));

    await waitFor(() => expect(createWorkspacePost).toHaveBeenCalledOnce());
    expect(createWorkspacePost).toHaveBeenCalledWith({
      data: {
        title: 'Local Model',
        description: null,
        status: 'active',
      },
    });
    await waitFor(() =>
      expect(bindWorkspace).toHaveBeenCalledWith(
        'created-workspace',
        'selection-1',
      ),
    );
  });
});
