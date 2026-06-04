import { Controller, Get, Param } from '@nestjs/common';
import {
  link,
  Link,
  userHref,
  userSidebarHref,
  userWorkspacesHref,
  workspaceDiagramsHref,
  workspaceLogicalEntitiesHref,
} from './links';
import { ResourceResolver } from './resource-resolver.service';

interface SidebarItem {
  key: string;
  label: string;
  type: 'resource';
  href: string;
  path: string;
  icon: string;
}

interface SidebarSection {
  title: string;
  key: string;
  defaultOpen: boolean;
  items: SidebarItem[];
}

interface SidebarResource {
  _links: Record<string, Link>;
  sections: SidebarSection[];
}

@Controller('users/:userId/sidebar')
export class SidebarController {
  constructor(private readonly resolver: ResourceResolver) {}

  @Get()
  async getUserSidebar(
    @Param('userId') userId: string,
  ): Promise<SidebarResource> {
    const user = await this.resolver.requireUser(userId);
    const [workspaces] = await user.listWorkspaces(1, 1, null);
    return sidebarResource(userId, workspaces[0]?.identity() ?? null);
  }
}

export function sidebarResource(
  userId: string,
  workspaceId: string | null,
): SidebarResource {
  const items: SidebarItem[] = [
    {
      key: 'workspaces',
      label: 'Workspaces',
      type: 'resource',
      href: userWorkspacesHref(userId),
      path: userWorkspacesHref(userId),
      icon: 'layout-dashboard',
    },
  ];

  if (workspaceId) {
    items.push({
      key: 'diagrams',
      label: 'Diagrams',
      type: 'resource',
      href: workspaceDiagramsHref(workspaceId),
      path: workspaceDiagramsHref(workspaceId),
      icon: 'network',
    });
    items.push({
      key: 'logical-entities',
      label: 'Logical Entities',
      type: 'resource',
      href: workspaceLogicalEntitiesHref(workspaceId),
      path: workspaceLogicalEntitiesHref(workspaceId),
      icon: 'database',
    });
  }

  return {
    _links: {
      self: link(userSidebarHref(userId)),
      user: link(userHref(userId)),
    },
    sections: [
      {
        title: 'USER',
        key: 'user',
        defaultOpen: true,
        items,
      },
    ],
  };
}
