import type { ReactNode } from 'react';
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
  const Button = ({ children }: { children?: ReactNode }) => (
    <button type="button">{children}</button>
  );

  return {
    Avatar: Div,
    AvatarFallback: Div,
    DropdownMenu: Fragment,
    DropdownMenuContent: Div,
    DropdownMenuGroup: Div,
    DropdownMenuItem: Div,
    DropdownMenuLabel: Div,
    DropdownMenuSeparator: () => <hr />,
    DropdownMenuTrigger: Fragment,
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
    TooltipProvider: Fragment,
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
  follow: () => ({ kind: 'sidebar' }),
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

const useResourceMock = useResource as unknown as Mock;

describe('WebShell', () => {
  beforeEach(() => {
    useResourceMock.mockReturnValue({
      loading: false,
      error: null,
      resourceState: sidebarState,
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

    expect(screen.getAllByText('Evidence').length).toBeGreaterThan(0);
    expect(screen.getByText('Workspaces')).toBeTruthy();
    expect(screen.getByText('Diagrams')).toBeTruthy();
    expect(screen.getAllByText('Desktop User').length).toBeGreaterThan(0);
    expect(screen.getByText('Route content')).toBeTruthy();
  });
});
