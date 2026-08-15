import type {
  MembershipWorkspace,
  SidebarItem,
  SidebarResource,
  State,
  WorkspaceResource,
} from '@evidence/api-client';

import { workspaceHref } from './workspace-switcher';

export interface ShellNavigationItem {
  active: boolean;
  href: string;
  key: string;
  label: string;
  resourcePath: string;
}

export interface ShellNavigationSection {
  key: string;
  title: string;
  items: ShellNavigationItem[];
}

const sectionOrder = [
  {
    key: 'scope',
    title: '范围',
    itemKeys: ['workspace-overview'],
  },
  {
    key: 'delivery',
    title: '知识交付',
    itemKeys: [
      'inbox-items',
      'story-candidates',
      'stories',
      'tasking-queue',
      'pair-queue',
    ],
  },
  {
    key: 'model',
    title: '领域知识',
    itemKeys: ['diagram', 'logical-entities'],
  },
] as const;

const labels: Record<string, string> = {
  'workspace-overview': 'Overall Delivery',
  'inbox-items': 'Problem 与 Intake',
  'story-candidates': 'Candidate 提案',
  stories: '交付位置',
  'tasking-queue': 'Tasking',
  'pair-queue': 'Pair',
  diagram: 'Scenario 与 Model',
  'logical-entities': '逻辑实体',
};

export function createShellNavigation(
  sidebarState: State<SidebarResource> | undefined,
  activeWorkspace: MembershipWorkspace | undefined,
  currentLocation: string,
): ShellNavigationSection[] {
  if (!sidebarState) return [];

  const itemByKey = new Map(
    sidebarState.data.sections.flatMap((section) =>
      section.items.map((item) => [item.key, item] as const),
    ),
  );

  return sectionOrder
    .map((section) => ({
      key: section.key,
      title: section.title,
      items: section.itemKeys.flatMap((key) => {
        const item = itemByKey.get(key);
        if (!item || (!activeWorkspace && isWorkspaceScoped(item))) return [];
        const resourcePath = sidebarItemResourcePath(item, activeWorkspace);
        return [
          {
            active:
              item.active ??
              isSidebarItemActive(item, currentLocation, resourcePath),
            href: resourcePath,
            key,
            label: labels[key] ?? item.label,
            resourcePath,
          },
        ];
      }),
    }))
    .filter((section) => section.items.length > 0);
}

export function workspaceIdFromPath(pathname: string): string | null {
  const match = pathname.match(/\/(?:api\/)?workspaces\/([^/?#]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function sidebarItemResourcePath(
  item: SidebarItem,
  activeWorkspace?: MembershipWorkspace,
): string {
  const template = item.href ?? item.path ?? '#';
  if (activeWorkspace && isWorkspaceScoped(item)) {
    const relation = item.key as keyof WorkspaceResource['links'];
    return (
      workspaceHref(activeWorkspace, relation) ??
      template.replace('{workspaceId}', encodeURIComponent(activeWorkspace.id))
    );
  }

  return template;
}

function isWorkspaceScoped(item: SidebarItem): boolean {
  return [item.href, item.path].some((value) =>
    value?.includes('{workspaceId}'),
  );
}

function isSidebarItemActive(
  item: SidebarItem,
  currentLocation: string,
  candidate: string,
): boolean {
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

function isPathActive(currentLocation: string, candidate: string): boolean {
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

function routeCandidates(pathname: string): string[] {
  if (pathname === '/api') return ['/', pathname];
  if (pathname.startsWith('/api/')) {
    return [pathname.slice('/api'.length), pathname];
  }
  return [pathname];
}
