import { describe, expect, it } from 'vitest';
import { sidebarResource } from './sidebar.controller';

describe('sidebarResource', () => {
  it('publishes workspace-scoped Inbox navigation', () => {
    const resource = sidebarResource('user-1');

    expect(resource.sections[0]?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'inbox-items',
          label: 'Inbox',
          href: '/api/workspaces/{workspaceId}/inbox-items',
        }),
      ]),
    );
    expect(resource.sections[1]).toMatchObject({
      key: 'delivery',
      items: [
        expect.objectContaining({
          key: 'story-candidates',
          href: '/api/workspaces/{workspaceId}/story-candidates',
        }),
        expect.objectContaining({
          key: 'stories',
          href: '/api/workspaces/{workspaceId}/stories',
        }),
      ],
    });
  });
});
