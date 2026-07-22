import { describe, expect, it, vi } from 'vitest';
import {
  InboxItem,
  InboxRevision,
  Ref,
  type Workspace,
} from '@evidence/server-domain';
import { InboxController } from './inbox.controller';
import type { ResourceResolver } from './resource-resolver.service';

const timestamp = '2026-01-01T00:00:00.000Z';

function item(overrides: Record<string, unknown> = {}): InboxItem {
  return new InboxItem('inbox-1', {
    workspace: new Ref('workspace-1'),
    sourceKind: 'manual_text',
    externalKey: 'capture-1',
    title: 'Desktop coding agent',
    status: 'active',
    latestRevisionId: 'revision-1',
    latestRevisionSha256: `sha256:${'a'.repeat(64)}`,
    revisionCount: 1,
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  });
}

function revision(overrides: Record<string, unknown> = {}): InboxRevision {
  return new InboxRevision('revision-1', {
    item: new Ref('inbox-1'),
    revisionNumber: 1,
    title: 'Desktop coding agent',
    body: 'Run Pi locally.',
    contentType: 'text/markdown',
    uri: null,
    providerMetadata: { channel: 'product' },
    sourceUpdatedAt: null,
    capturedAt: timestamp,
    contentSha256: `sha256:${'a'.repeat(64)}`,
    ...overrides,
  });
}

function fixture() {
  const inboxItem = item();
  const inboxRevision = revision();
  const workspace = {
    listInboxItems: vi.fn(async () => [[inboxItem], 21]),
    captureInboxSource: vi.fn(async () => ({
      item: inboxItem,
      revision: inboxRevision,
      revisionCreated: true,
    })),
    changeInboxItemStatus: vi.fn(async () =>
      item({ status: 'deferred', version: 2 }),
    ),
    listInboxRevisions: vi.fn(async () => [[inboxRevision], 1]),
    findInboxRevision: vi.fn(async () => inboxRevision),
    appendInboxRevision: vi.fn(async () => ({
      item: inboxItem,
      revision: inboxRevision,
      revisionCreated: false,
    })),
  } as unknown as Workspace;
  const resolver = {
    requireWorkspace: vi.fn(async () => workspace),
    requireWorkspaceInboxItem: vi.fn(async () => [workspace, inboxItem]),
    requireWorkspaceInboxRevision: vi.fn(async () => [
      workspace,
      inboxItem,
      inboxRevision,
    ]),
  } as unknown as ResourceResolver;
  return {
    controller: new InboxController(resolver),
    inboxItem,
    inboxRevision,
    resolver,
    workspace,
  };
}

describe('InboxController', () => {
  it('lists filtered Workspace Inbox items with stable page links', async () => {
    const { controller, workspace } = fixture();

    const result = await controller.listInboxItems(
      'workspace-1',
      '2',
      '10',
      'active',
      'manual_text',
      'coding agent',
    );

    expect(workspace.listInboxItems).toHaveBeenCalledWith({
      page: 2,
      pageSize: 10,
      status: 'active',
      sourceKind: 'manual_text',
      query: 'coding agent',
    });
    expect(result._links).toMatchObject({
      self: {
        href: '/api/workspaces/workspace-1/inbox-items?page=2&pageSize=10&status=active&sourceKind=manual_text&q=coding+agent',
      },
      prev: expect.anything(),
      next: expect.anything(),
    });
    expect(result._embedded.inboxItems[0]).toMatchObject({
      id: 'inbox-1',
      revisionCount: 1,
    });
  });

  it('captures a provider-neutral source through the Workspace', async () => {
    const { controller, workspace } = fixture();

    const result = await controller.captureInboxItem('workspace-1', {
      sourceKind: 'manual_text',
      externalKey: 'capture-1',
      title: ' Desktop coding agent ',
      body: 'Run Pi locally.\n',
      contentType: 'text/markdown',
      providerMetadata: { channel: 'product' },
    });

    expect(workspace.captureInboxSource).toHaveBeenCalledWith({
      sourceKind: 'manual_text',
      externalKey: 'capture-1',
      title: 'Desktop coding agent',
      body: 'Run Pi locally.\n',
      contentType: 'text/markdown',
      uri: null,
      providerMetadata: { channel: 'product' },
      sourceUpdatedAt: null,
    });
    expect(result._links.revisions.href).toBe(
      '/api/workspaces/workspace-1/inbox-items/inbox-1/revisions',
    );
  });

  it('updates source content while preserving server-owned source metadata', async () => {
    const { controller, workspace } = fixture();
    const expectedHash = `sha256:${'a'.repeat(64)}`;

    const result = await controller.updateInboxSource(
      'workspace-1',
      'inbox-1',
      {
        title: 'Updated coding agent',
        body: 'Run Pi in a worktree.',
        contentType: 'text/markdown',
        expectedLatestRevisionSha256: expectedHash,
      },
    );

    expect(workspace.appendInboxRevision).toHaveBeenCalledWith(
      'inbox-1',
      {
        sourceKind: 'manual_text',
        externalKey: 'capture-1',
        title: 'Updated coding agent',
        body: 'Run Pi in a worktree.',
        contentType: 'text/markdown',
        uri: null,
        providerMetadata: { channel: 'product' },
        sourceUpdatedAt: null,
      },
      expectedHash,
    );
    expect(result.id).toBe('revision-1');
  });

  it('updates provider-managed source metadata independently', async () => {
    const { controller, workspace } = fixture();
    const expectedHash = `sha256:${'a'.repeat(64)}`;

    await controller.updateInboxSource('workspace-1', 'inbox-1', {
      uri: 'https://example.com/issues/1',
      providerMetadata: { state: 'open' },
      sourceUpdatedAt: '2026-01-02T00:00:00.000Z',
      expectedLatestRevisionSha256: expectedHash,
    });

    expect(workspace.appendInboxRevision).toHaveBeenCalledWith(
      'inbox-1',
      {
        sourceKind: 'manual_text',
        externalKey: 'capture-1',
        title: 'Desktop coding agent',
        body: 'Run Pi locally.',
        contentType: 'text/markdown',
        uri: 'https://example.com/issues/1',
        providerMetadata: { state: 'open' },
        sourceUpdatedAt: '2026-01-02T00:00:00.000Z',
      },
      expectedHash,
    );
  });

  it('records an optimistic status transition', async () => {
    const { controller, workspace } = fixture();

    const result = await controller.changeInboxItemStatus(
      'workspace-1',
      'inbox-1',
      { status: 'deferred', expectedVersion: 1 },
    );

    expect(workspace.changeInboxItemStatus).toHaveBeenCalledWith(
      'inbox-1',
      'deferred',
      1,
    );
    expect(result).toMatchObject({ status: 'deferred', version: 2 });
  });
});
