import { Controller, Get, Param } from '@nestjs/common';
import { link, Link, userHref, userSidebarHref } from './links';
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

@Controller()
export class SidebarController {
  constructor(private readonly resolver: ResourceResolver) {}

  @Get()
  async getUserSidebar(
    @Param('userId') userId: string,
  ): Promise<SidebarResource> {
    await this.resolver.requireUser(userId);
    return sidebarResource(userId);
  }
}

export function sidebarResource(userId: string): SidebarResource {
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
        items: [
          {
            key: 'logical-entities',
            label: 'Logical Entities',
            type: 'resource',
            href: '/api/workspaces/{workspaceId}/logical-entities',
            path: '/api/workspaces/{workspaceId}/logical-entities',
            icon: 'database',
          },
        ],
      },
    ],
  };
}
