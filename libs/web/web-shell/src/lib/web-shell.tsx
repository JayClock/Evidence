import { useMemo, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  useResource,
  type Link as HalLink,
  type SidebarItem,
  type SidebarResource,
  type State,
  type UserResource,
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
  ScrollArea,
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

export function WebShell({
  userState,
  children,
}: {
  userState: State<UserResource>;
  children: ReactNode;
}) {
  const sidebarResource = useMemo(
    () => userState.follow('sidebar'),
    [userState],
  );
  const sidebar = useResource<SidebarResource>(sidebarResource);

  return (
    <TooltipProvider>
      <Toaster position="top-center" />
      <SidebarProvider>
        <AppSidebar
          userState={userState}
          sidebarState={sidebar.resourceState}
          loading={sidebar.loading}
        />
        <SidebarInset className="h-svh overflow-hidden md:h-[calc(100svh-1rem)]">
          <AppHeader />
          <ScrollArea className="min-h-0 flex-1">
            <div className="p-6">{children}</div>
          </ScrollArea>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}

function AppHeader() {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-background px-4">
      <SidebarTrigger />
      <Separator orientation="vertical" className="h-5" />
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium">
          Evidence Workspace Console
        </span>
        <span className="truncate text-xs text-muted-foreground">
          HATEOAS navigation shell
        </span>
      </div>
    </header>
  );
}

function AppSidebar({
  userState,
  sidebarState,
  loading,
}: {
  userState: State<UserResource>;
  sidebarState?: State<SidebarResource>;
  loading: boolean;
}) {
  const location = useLocation();

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Evidence">
              <Link to="/">
                <div className="flex size-6 items-center justify-center rounded-md bg-sidebar-primary text-xs font-semibold text-sidebar-primary-foreground">
                  E
                </div>
                <span>Evidence</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {loading || !sidebarState ? (
          <SidebarLoading />
        ) : (
          sidebarState.data.sections.map((section) => (
            <SidebarGroup key={section.key}>
              <SidebarGroupLabel>{section.title}</SidebarGroupLabel>
              <SidebarMenu>
                {section.items.map((item) => (
                  <SidebarNavItem
                    key={item.key ?? item.label}
                    item={item}
                    pathname={location.pathname}
                  />
                ))}
              </SidebarMenu>
            </SidebarGroup>
          ))
        )}
      </SidebarContent>

      <SidebarFooter>
        <SidebarUserMenu userState={userState} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
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
}: {
  item: SidebarItem;
  pathname: string;
}) {
  const resourcePath = item.path ?? item.href ?? '#';
  const target = sidebarItemRoute(item);
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

function sidebarItemRoute(item: SidebarItem) {
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
