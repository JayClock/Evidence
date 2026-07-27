import { describe, expect, it } from 'vitest';
import { sidebarResource } from './sidebar.controller';

describe('sidebarResource', () => {
  it('publishes the Chinese workspace delivery information architecture', () => {
    const resource = sidebarResource('user-1');

    expect(resource.sections).toMatchObject([
      {
        key: 'workspace',
        title: '工作区',
        items: [
          {
            key: 'workspace-overview',
            label: '工作区总览',
            href: '/api/workspaces/{workspaceId}',
          },
        ],
      },
      {
        key: 'source',
        title: '来源',
        items: [
          expect.objectContaining({
            key: 'inbox-items',
            label: 'Inbox',
          }),
        ],
      },
      {
        key: 'delivery',
        title: '交付',
        items: [
          expect.objectContaining({ key: 'story-candidates' }),
          expect.objectContaining({ key: 'stories', label: '故事看板' }),
          expect.objectContaining({
            key: 'tasking-queue',
            href: '/api/workspaces/{workspaceId}/stories?filter=tasking',
          }),
          expect.objectContaining({
            key: 'pair-queue',
            href: '/api/workspaces/{workspaceId}/stories?filter=pair',
          }),
        ],
      },
      {
        key: 'model',
        title: '模型',
        items: [
          expect.objectContaining({ key: 'diagram', label: '模型图' }),
          expect.objectContaining({
            key: 'logical-entities',
            label: '逻辑实体',
          }),
        ],
      },
    ]);
  });
});
