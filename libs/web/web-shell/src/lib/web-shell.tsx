import { useCallback, useMemo, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  useResource,
  type Link as HalLink,
  type MembershipCollectionResource,
  type MembershipResource,
  type MembershipWorkspace,
  type SidebarItem,
  type SidebarResource,
  type State,
  type UserResource,
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
  const location = useLocation();
  const navigate = useNavigate();
  const sidebarResource = useMemo(
    () => userState.follow('sidebar'),
    [userState],
  );
  const membershipsResource = useMemo(
    () => userState.follow('memberships'),
    [userState],
  );
  const createWorkspaceResource = useMemo(
    () => userState.follow('create-workspace'),
    [userState],
  );
  const sidebar = useResource<SidebarResource>(sidebarResource);
  const memberships =
    useResource<MembershipCollectionResource>(membershipsResource);
  const workspaces: MembershipWorkspace[] =
    memberships.resourceState?.collection.map(
      (membershipState: State<MembershipResource>) =>
        membershipState.data.workspace,
    ) ?? [];
  const routeWorkspaceId = workspaceIdFromPath(location.pathname);
  const activeWorkspace =
    workspaces.find((workspace) => workspace.id === routeWorkspaceId) ??
    workspaces[0];

  const selectWorkspace = useCallback(
    (workspace: MembershipWorkspace) => {
      const href = workspaceHref(workspace);
      if (href) {
        navigate(href);
      }
    },
    [navigate],
  );

  const createWorkspace = useCallback(
    async (input: WorkspaceInput) => {
      const { localRepositorySelectionId, ...serverInput } = input;
      const createdWorkspace = (await createWorkspaceResource.post({
        data: serverInput,
      })) as State<WorkspaceResource>;

      try {
        if (localRepositorySelectionId) {
          const bindWorkspace = window.evidenceDesktop?.bindWorkspace;
          if (!bindWorkspace) {
            throw new Error('本地仓库只能由 Desktop 应用绑定。');
          }
          await bindWorkspace(
            createdWorkspace.data.id,
            localRepositorySelectionId,
          );
        }
      } catch (error) {
        await createdWorkspace
          .follow('self')
          .delete()
          .catch(() => undefined);
        throw error;
      }

      await memberships.resource.refresh();
      const href = createdWorkspace.getLink('self')?.href;
      if (href) {
        navigate(href);
      }
      return createdWorkspace;
    },
    [createWorkspaceResource, memberships.resource, navigate],
  );

  return (
    <TooltipProvider>
      <Toaster position="top-center" />
      <SidebarProvider>
        <AppSidebar
          userState={userState}
          sidebarState={sidebar.resourceState}
          loading={sidebar.loading}
          workspaces={workspaces}
          workspacesLoading={memberships.loading}
          workspacesError={memberships.error}
          activeWorkspace={activeWorkspace}
          onSelectWorkspace={selectWorkspace}
          onCreateWorkspace={createWorkspace}
        />
        <SidebarInset className="h-svh min-w-0 overflow-hidden md:h-[calc(100svh-1rem)]">
          <AppHeader activeWorkspaceTitle={activeWorkspace?.title} />
          <main className="min-h-0 w-full flex-1 overflow-hidden p-4 md:p-6">
            {children}
          </main>
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
          Evidence 交付工作区
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {activeWorkspaceTitle
            ? `当前工作区：${activeWorkspaceTitle}`
            : '正在等待工作区上下文'}
        </span>
      </div>
    </header>
  );
}

function AppSidebar({
  userState,
  sidebarState,
  loading,
  workspaces,
  workspacesLoading,
  workspacesError,
  activeWorkspace,
  onSelectWorkspace,
  onCreateWorkspace,
}: {
  userState: State<UserResource>;
  sidebarState?: State<SidebarResource>;
  loading: boolean;
  workspaces: MembershipWorkspace[];
  workspacesLoading: boolean;
  workspacesError: Error | null;
  activeWorkspace?: MembershipWorkspace;
  onSelectWorkspace: (workspace: MembershipWorkspace) => void;
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
          workspaces={workspaces}
          activeWorkspace={activeWorkspace}
          onSelectWorkspace={onSelectWorkspace}
          onCreateWorkspace={onCreateWorkspace}
        />
      </SidebarHeader>

      <SidebarContent>
        {loading || !sidebarState ? (
          <SidebarLoading />
        ) : (
          sidebarState.data.sections.map((section) => {
            const visibleItems = section.items.filter((item) =>
              isVisibleSidebarItem(item, activeWorkspace),
            );

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
                      currentLocation={`${location.pathname}${location.search}`}
                      activeWorkspace={activeWorkspace}
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

function isVisibleSidebarItem(
  item: SidebarItem,
  activeWorkspace?: MembershipWorkspace,
) {
  return !isWorkspaceScopedSidebarItem(item) || Boolean(activeWorkspace);
}

function SidebarLoading() {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>正在加载</SidebarGroupLabel>
      <SidebarMenu>
        <SidebarMenuSkeleton showIcon />
        <SidebarMenuSkeleton showIcon />
      </SidebarMenu>
    </SidebarGroup>
  );
}

function SidebarNavItem({
  item,
  currentLocation,
  activeWorkspace,
}: {
  item: SidebarItem;
  currentLocation: string;
  activeWorkspace?: MembershipWorkspace;
}) {
  const resourcePath = sidebarItemResourcePath(item, activeWorkspace);
  const target = sidebarItemRoute(item, activeWorkspace);
  const active =
    item.active ?? isSidebarItemActive(item, currentLocation, target);

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild tooltip={item.label} isActive={active}>
        <Link
          aria-current={active ? 'page' : undefined}
          to={target}
          data-resource-path={resourcePath}
        >
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
                <Link to={selfHref}>用户资源</Link>
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
  activeWorkspace?: MembershipWorkspace,
) {
  return sidebarItemResourcePath(item, activeWorkspace);
}

function sidebarItemResourcePath(
  item: SidebarItem,
  activeWorkspace?: MembershipWorkspace,
) {
  const template = item.href ?? item.path ?? '#';
  if (activeWorkspace && isWorkspaceScopedSidebarItem(item)) {
    const relation = item.key as keyof WorkspaceResource['links'];
    return (
      workspaceHref(activeWorkspace, relation) ??
      template.replace('{workspaceId}', encodeURIComponent(activeWorkspace.id))
    );
  }

  return template;
}

function isWorkspaceScopedSidebarItem(item: SidebarItem) {
  return [item.href, item.path].some((value) =>
    value?.includes('{workspaceId}'),
  );
}

function isSidebarItemActive(
  item: SidebarItem,
  currentLocation: string,
  candidate: string,
) {
  const currentPath = currentLocation.split('?')[0] ?? currentLocation;
  if (item.key === 'workspace-overview') {
    return routeCandidates(candidate).some(
      (route) => currentPath === route.split('?')[0],
    );
  }
  if (
    item.key === 'tasking-queue' &&
    /\/(?:api\/)?workspaces\/[^/]+\/iterations\/[^/]+\/tasking(?:\/|$)/.test(
      currentPath,
    )
  ) {
    return true;
  }
  if (
    item.key === 'pair-queue' &&
    /\/(?:api\/)?workspaces\/[^/]+\/iterations\/[^/]+\/pair(?:\/|$)/.test(
      currentPath,
    )
  ) {
    return true;
  }
  return isPathActive(currentLocation, candidate);
}

function isPathActive(currentLocation: string, candidate: string) {
  if (candidate === '#') return false;

  const [currentPath, currentQuery = ''] = currentLocation.split('?');
  const currentParameters = new URLSearchParams(currentQuery);
  return routeCandidates(candidate).some((route) => {
    const [routePath, routeQuery = ''] = route.split('?');
    if (routeQuery) {
      return (
        currentPath === routePath &&
        [...new URLSearchParams(routeQuery)].every(
          ([key, value]) => currentParameters.get(key) === value,
        )
      );
    }
    if (
      currentPath === routePath &&
      ['tasking', 'pair'].includes(currentParameters.get('filter') ?? '')
    ) {
      return false;
    }
    return (
      currentPath === routePath || currentPath?.startsWith(`${routePath}/`)
    );
  });
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

function workspaceIdFromPath(pathname: string): string | null {
  const match = pathname.match(/\/(?:api\/)?workspaces\/([^/?#]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
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
