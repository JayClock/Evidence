import type { ComponentType } from 'react';
import { Link } from 'react-router-dom';
import type {
  Link as HalLink,
  MembershipWorkspace,
  State,
  UserResource,
  WorkspaceResource,
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
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarRail,
} from '@evidence/ui';
import {
  BotIcon,
  BoxesIcon,
  Columns3Icon,
  HouseIcon,
  InboxIcon,
  ListChecksIcon,
  NetworkIcon,
  SparklesIcon,
  TerminalIcon,
} from 'lucide-react';

import type { ShellNavigationSection } from './navigation';
import { WorkspaceSwitcher, type WorkspaceInput } from './workspace-switcher';

const navigationIcons: Record<
  string,
  ComponentType<{ 'aria-hidden'?: true }>
> = {
  'workspace-overview': HouseIcon,
  'inbox-items': InboxIcon,
  'story-candidates': SparklesIcon,
  stories: Columns3Icon,
  'tasking-queue': ListChecksIcon,
  'pair-queue': TerminalIcon,
  diagram: NetworkIcon,
  'logical-entities': BoxesIcon,
};

export function AppSidebar({
  userState,
  navigation,
  navigationLoading,
  workspaces,
  workspacesLoading,
  workspacesError,
  activeWorkspace,
  onSelectWorkspace,
  onCreateWorkspace,
}: {
  userState: State<UserResource>;
  navigation: ShellNavigationSection[];
  navigationLoading: boolean;
  workspaces: MembershipWorkspace[];
  workspacesLoading: boolean;
  workspacesError: Error | null;
  activeWorkspace?: MembershipWorkspace;
  onSelectWorkspace: (workspace: MembershipWorkspace) => void;
  onCreateWorkspace: (
    input: WorkspaceInput,
  ) => Promise<State<WorkspaceResource>>;
}) {
  return (
    <Sidebar collapsible="icon" variant="sidebar">
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
        {navigationLoading ? (
          <SidebarLoading />
        ) : (
          navigation.map((section) => (
            <SidebarGroup key={section.key}>
              <SidebarGroupLabel>{section.title}</SidebarGroupLabel>
              <SidebarMenu>
                {section.items.map((item) => {
                  const Icon = navigationIcons[item.key];
                  return (
                    <SidebarMenuItem key={item.key}>
                      <SidebarMenuButton
                        asChild
                        isActive={item.active}
                        tooltip={item.label}
                      >
                        <Link
                          aria-current={item.active ? 'page' : undefined}
                          data-resource-path={item.resourcePath}
                          to={item.href}
                        >
                          {Icon ? <Icon aria-hidden /> : null}
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroup>
          ))
        )}
      </SidebarContent>

      <SidebarFooter>
        <AgentConnection />
        <SidebarUserMenu userState={userState} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
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

function AgentConnection() {
  const desktopConnected =
    typeof window !== 'undefined' && Boolean(window.evidenceDesktop);
  return (
    <div className="flex items-center gap-2 rounded-md px-2 py-2 text-sidebar-foreground group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
      <BotIcon aria-hidden className="size-4 shrink-0" />
      <span className="flex min-w-0 flex-1 flex-col group-data-[collapsible=icon]:hidden">
        <span className="truncate text-xs font-medium">本地 Pi 智能体</span>
        <span className="truncate text-[0.6875rem] text-sidebar-foreground/65">
          {desktopConnected ? 'Desktop · 已连接' : 'Browser · 查看模式'}
        </span>
      </span>
      <span
        aria-label={desktopConnected ? 'Desktop 已连接' : 'Desktop 未连接'}
        className="size-1.5 rounded-full bg-sidebar-foreground/35 data-[connected=true]:bg-sidebar-primary"
        data-connected={desktopConnected}
      />
    </div>
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

function initials(name: string): string {
  const segments = name.trim().split(/\s+/).filter(Boolean);
  const first = segments[0] ?? name;
  const second = segments[1];
  const value = second
    ? `${first[0] ?? ''}${second[0] ?? ''}`
    : name.slice(0, 2);
  return value.toUpperCase();
}
