import { isValidElement, type ComponentProps, type ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
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
    FieldLabel: ({ children }: { children?: ReactNode }) => (
      <label>{children}</label>
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

const userState = {
  data: {
    id: 'desktop-user',
    name: 'Desktop User',
    email: 'desktop@evidence.local',
  },
  links: links('self', 'workspaces', 'sidebar'),
  follow: (rel: string) => ({ kind: rel }),
};

const sidebarState = {
  data: {
    sections: [
      {
        title: 'USER',
        key: 'user',
        items: [
          {
            key: 'workspaces',
            label: 'Workspaces',
            type: 'resource',
            href: '/api/users/desktop-user/workspaces',
            path: '/api/users/desktop-user/workspaces',
          },
          {
            key: 'diagrams',
            label: 'Diagrams',
            type: 'resource',
            href: '/api/workspaces/default-workspace/diagrams',
            path: '/api/workspaces/default-workspace/diagrams',
          },
        ],
      },
    ],
  },
  links: links('self'),
};

const workspaceState = {
  data: {
    id: 'default-workspace',
    title: 'Default Workspace',
    description: 'Seed workspace',
    status: 'active',
    metadata: {
      repositoryRoot: '/Users/zhongjie/Documents/GitHub/Evidence',
    },
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  links: {
    getAll: () => [
      {
        rel: 'self',
        href: '/api/users/desktop-user/workspaces/default-workspace',
      },
      {
        rel: 'diagrams',
        href: '/api/workspaces/default-workspace/diagrams',
      },
      {
        rel: 'logical-entities',
        href: '/api/workspaces/default-workspace/logical-entities',
      },
    ],
  },
};

const workspaceCollectionState = {
  data: {
    page: {
      size: 20,
      totalElements: 1,
      totalPages: 1,
      number: 1,
    },
  },
  collection: [workspaceState],
  links: links('self'),
};

const workspaceResource = {
  post: vi.fn(),
  refresh: vi.fn(),
};

const useResourceMock = useResource as unknown as Mock;

describe('WebShell', () => {
  beforeEach(() => {
    useResourceMock.mockImplementation((resourceLike: { kind: string }) => {
      if (resourceLike.kind === 'workspaces') {
        return {
          loading: false,
          error: null,
          resourceState: workspaceCollectionState,
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

    expect(screen.getByText('Evidence Workspace Console')).toBeTruthy();
    expect(screen.getAllByText('Default Workspace').length).toBeGreaterThan(0);
    expect(screen.queryByText('Workspaces')).toBeNull();
    expect(screen.getByText('Diagrams')).toBeTruthy();
    expect(screen.getAllByText('Desktop User').length).toBeGreaterThan(0);
    expect(screen.getByText('Route content')).toBeTruthy();
  });
});
