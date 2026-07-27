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
        title: '工作区',
        key: 'workspace',
        defaultOpen: true,
        items: [
          {
            key: 'workspace-overview',
            label: '工作区总览',
            type: 'resource',
            href: '/api/workspaces/{workspaceId}',
            path: '/api/workspaces/{workspaceId}',
            icon: 'home',
          },
        ],
      },
      {
        title: '来源',
        key: 'source',
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
        ],
      },
      {
        title: '交付',
        key: 'delivery',
        defaultOpen: true,
        items: [
          {
            key: 'story-candidates',
            label: '故事候选',
            type: 'resource',
            href: '/api/workspaces/{workspaceId}/story-candidates',
            path: '/api/workspaces/{workspaceId}/story-candidates',
            icon: 'list-checks',
          },
          {
            key: 'stories',
            label: '故事看板',
            type: 'resource',
            href: '/api/workspaces/{workspaceId}/stories',
            path: '/api/workspaces/{workspaceId}/stories',
            icon: 'columns',
          },
          {
            key: 'tasking-queue',
            label: '交付计划',
            type: 'resource',
            href: '/api/workspaces/{workspaceId}/stories?filter=tasking',
            path: '/api/workspaces/{workspaceId}/stories?filter=tasking',
            icon: 'list-todo',
          },
          {
            key: 'pair-queue',
            label: 'Pair 工作台',
            type: 'resource',
            href: '/api/workspaces/{workspaceId}/stories?filter=pair',
            path: '/api/workspaces/{workspaceId}/stories?filter=pair',
            icon: 'terminal',
          },
        ],
      },
      {
        title: '模型',
        key: 'model',
        defaultOpen: true,
        items: [
          {
            key: 'diagram',
            label: '模型图',
            type: 'resource',
            href: '/api/workspaces/{workspaceId}/diagram',
            path: '/api/workspaces/{workspaceId}/diagram',
            icon: 'workflow',
          },
          {
            key: 'logical-entities',
            label: '逻辑实体',
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
