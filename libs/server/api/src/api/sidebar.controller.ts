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
            key: 'inbox-items',
            label: 'Inbox',
            type: 'resource',
            href: '/api/workspaces/{workspaceId}/inbox-items',
            path: '/api/workspaces/{workspaceId}/inbox-items',
            icon: 'inbox',
          },
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
      {
        title: 'DELIVERY',
        key: 'delivery',
        defaultOpen: true,
        items: [
          {
            key: 'story-candidates',
            label: 'Story Candidates',
            type: 'resource',
            href: '/api/workspaces/{workspaceId}/story-candidates',
            path: '/api/workspaces/{workspaceId}/story-candidates',
            icon: 'list-checks',
          },
          {
            key: 'stories',
            label: 'Stories',
            type: 'resource',
            href: '/api/workspaces/{workspaceId}/stories',
            path: '/api/workspaces/{workspaceId}/stories',
            icon: 'book-open',
          },
        ],
      },
    ],
  };
}
