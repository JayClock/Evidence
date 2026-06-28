import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  useResource,
  type Link as HalLink,
  type SidebarItem,
  type SidebarResource,
  type State,
  type UserResource,
  type WorkspaceCollectionResource,
  type WorkspaceResource,
} from '@evidence/api-client';
import {
  Avatar,
  AvatarFallback,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Separator,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  Toaster,
  TooltipProvider,
} from '@evidence/ui';

import {
  WorkspaceSwitcher,
  workspaceHref,
  type WorkspaceInput,
} from './workspace-switcher';

export function WebShell({
  userState,
  children,
}: {
  userState: State<UserResource>;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const sidebarResource = useMemo(
    () => userState.follow('sidebar'),
    [userState],
  );
  const workspacesResource = useMemo(
    () => userState.follow('workspaces'),
    [userState],
  );
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>();
  const sidebar = useResource<SidebarResource>(sidebarResource);
  const workspaces =
    useResource<WorkspaceCollectionResource>(workspacesResource);
  const workspaceStates: State<WorkspaceResource>[] =
    workspaces.resourceState?.collection ?? [];
  const activeWorkspaceState =
    workspaceStates.find(
      (workspaceState) => workspaceState.data.id === selectedWorkspaceId,
    ) ?? workspaceStates[0];

  const selectWorkspace = useCallback(
    (workspaceState: State<WorkspaceResource>) => {
      setSelectedWorkspaceId(workspaceState.data.id);
      const href = workspaceHref(workspaceState);
      if (href) {
        navigate(href);
      }
    },
    [navigate],
  );

  const createWorkspace = useCallback(
    async (input: WorkspaceInput) => {
      const createdWorkspace = (await workspaces.resource.post({
        data: input,
      })) as State<WorkspaceResource>;
      setSelectedWorkspaceId(createdWorkspace.data.id);
      await workspaces.resource.refresh();
      const href = workspaceHref(createdWorkspace);
      if (href) {
        navigate(href);
      }
      return createdWorkspace;
    },
    [navigate, workspaces.resource],
  );

  return (
    <TooltipProvider>
      <Toaster position="top-center" />
      <SidebarProvider>
        <AppSidebar
          userState={userState}
          sidebarState={sidebar.resourceState}
          loading={sidebar.loading}
          workspaceStates={workspaceStates}
          workspacesLoading={workspaces.loading}
          workspacesError={workspaces.error}
          activeWorkspaceState={activeWorkspaceState}
          onSelectWorkspace={selectWorkspace}
          onCreateWorkspace={createWorkspace}
        />
        <SidebarInset className="h-svh min-w-0 overflow-hidden md:h-[calc(100svh-1rem)]">
          <AppHeader activeWorkspaceTitle={activeWorkspaceState?.data.title} />
          <main className="h-full w-full p-6">{children}</main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}

function AppHeader({
  activeWorkspaceTitle,
}: {
  activeWorkspaceTitle?: string;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-background px-4">
      <SidebarTrigger />
      <Separator orientation="vertical" className="h-5" />
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium">
          Evidence Workspace Console
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {activeWorkspaceTitle
            ? `Current workspace: ${activeWorkspaceTitle}`
            : 'HATEOAS navigation shell'}
        </span>
      </div>
    </header>
  );
}

function AppSidebar({
  userState,
  sidebarState,
  loading,
  workspaceStates,
  workspacesLoading,
  workspacesError,
  activeWorkspaceState,
  onSelectWorkspace,
  onCreateWorkspace,
}: {
  userState: State<UserResource>;
  sidebarState?: State<SidebarResource>;
  loading: boolean;
  workspaceStates: State<WorkspaceResource>[];
  workspacesLoading: boolean;
  workspacesError: Error | null;
  activeWorkspaceState?: State<WorkspaceResource>;
  onSelectWorkspace: (workspaceState: State<WorkspaceResource>) => void;
  onCreateWorkspace: (
    input: WorkspaceInput,
  ) => Promise<State<WorkspaceResource>>;
}) {
  const location = useLocation();

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <WorkspaceSwitcher
          loading={workspacesLoading}
          error={workspacesError}
          workspaces={workspaceStates}
          activeWorkspaceState={activeWorkspaceState}
          onSelectWorkspace={onSelectWorkspace}
          onCreateWorkspace={onCreateWorkspace}
        />
      </SidebarHeader>

      <SidebarContent>
        {loading || !sidebarState ? (
          <SidebarLoading />
        ) : (
          sidebarState.data.sections.map((section) => {
            const visibleItems = section.items.filter(isVisibleSidebarItem);

            if (visibleItems.length === 0) {
              return null;
            }

            return (
              <SidebarGroup key={section.key}>
                <SidebarGroupLabel>{section.title}</SidebarGroupLabel>
                <SidebarMenu>
                  {visibleItems.map((item) => (
                    <SidebarNavItem
                      key={item.key ?? item.label}
                      item={item}
                      pathname={location.pathname}
                      activeWorkspaceState={activeWorkspaceState}
                    />
                  ))}
                </SidebarMenu>
              </SidebarGroup>
            );
          })
        )}
      </SidebarContent>

      <SidebarFooter>
        <SidebarUserMenu userState={userState} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function isVisibleSidebarItem(item: SidebarItem) {
  return item.key !== 'workspaces' && item.label !== 'Workspaces';
}

function SidebarLoading() {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Loading</SidebarGroupLabel>
      <SidebarMenu>
        <SidebarMenuSkeleton showIcon />
        <SidebarMenuSkeleton showIcon />
      </SidebarMenu>
    </SidebarGroup>
  );
}

function SidebarNavItem({
  item,
  pathname,
  activeWorkspaceState,
}: {
  item: SidebarItem;
  pathname: string;
  activeWorkspaceState?: State<WorkspaceResource>;
}) {
  const resourcePath = sidebarItemResourcePath(item, activeWorkspaceState);
  const target = sidebarItemRoute(item, activeWorkspaceState);
  const active = item.active ?? isPathActive(pathname, target);

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild tooltip={item.label} isActive={active}>
        <Link to={target} data-resource-path={resourcePath}>
          <span>{item.label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function SidebarUserMenu({ userState }: { userState: State<UserResource> }) {
  const user = userState.data;
  const selfHref =
    userState.links.getAll().find((link: HalLink) => link.rel === 'self')
      ?.href ?? '#';

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton tooltip={user.name} className="justify-start">
              <Avatar size="sm">
                <AvatarFallback>{initials(user.name)}</AvatarFallback>
              </Avatar>
              <span className="truncate">{user.name}</span>
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="end" className="min-w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col gap-1">
                <span className="truncate text-sm font-medium">
                  {user.name}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {user.email ?? user.id}
                </span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <Link to={selfHref}>User resource</Link>
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function sidebarItemRoute(
  item: SidebarItem,
  activeWorkspaceState?: State<WorkspaceResource>,
) {
  return sidebarItemResourcePath(item, activeWorkspaceState);
}

function sidebarItemResourcePath(
  item: SidebarItem,
  activeWorkspaceState?: State<WorkspaceResource>,
) {
  if (activeWorkspaceState && item.key === 'logical-entities') {
    return (
      workspaceHref(activeWorkspaceState, 'logical-entities') ??
      item.href ??
      item.path ??
      '#'
    );
  }

  return item.href ?? item.path ?? '#';
}

function isPathActive(pathname: string, candidate: string) {
  if (candidate === '#') {
    return false;
  }

  return routeCandidates(candidate).some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

function routeCandidates(pathname: string) {
  if (pathname === '/api') {
    return ['/', pathname];
  }

  if (pathname.startsWith('/api/')) {
    return [pathname.slice('/api'.length), pathname];
  }

  return [pathname];
}

function initials(name: string) {
  const segments = name.trim().split(/\s+/).filter(Boolean);
  const first = segments[0] ?? name;
  const second = segments[1];
  const value = second
    ? `${first[0] ?? ''}${second[0] ?? ''}`
    : name.slice(0, 2);
  return value.toUpperCase();
}
