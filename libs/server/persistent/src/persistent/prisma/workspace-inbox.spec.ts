import { describe, expect, it } from 'vitest';
import type { InboxSourceInput } from '@evidence/server-domain';
import { hashInboxSource } from '../inbox-content';
import { asStore, mockPrismaStore, timestamp } from './test-support';
import { PrismaWorkspaceInbox } from './workspace-inbox';

const source: InboxSourceInput = {
  sourceKind: 'manual_text',
  externalKey: 'capture-1',
  title: 'Desktop Pair delivery',
  body: 'Run Pi locally.',
  contentType: 'text/markdown',
  providerMetadata: { channel: 'product' },
};

function revisionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'revision-1',
    inboxItemId: 'inbox-1',
    revisionNumber: 1,
    title: source.title,
    body: source.body,
    contentType: source.contentType,
    uri: null,
    providerMetadata: source.providerMetadata,
    sourceUpdatedAt: null,
    capturedAt: timestamp,
    contentSha256: hashInboxSource(source).contentSha256,
    ...overrides,
  };
}

function itemRow(overrides: Record<string, unknown> = {}) {
  const latestRevision = revisionRow();
  return {
    id: 'inbox-1',
    workspaceId: 'workspace-1',
    sourceKind: source.sourceKind,
    externalKey: source.externalKey,
    title: source.title,
    status: 'active',
    latestRevisionId: latestRevision.id,
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    latestRevision,
    _count: { revisions: 1 },
    ...overrides,
  };
}

describe('PrismaWorkspaceInbox', () => {
  it('captures the first immutable source revision', async () => {
    const store = mockPrismaStore();
    store.inboxItem.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(itemRow());
    store.inboxRevision.findFirst.mockResolvedValue(revisionRow());
    const inbox = new PrismaWorkspaceInbox(asStore(store), 'workspace-1');

    const result = await inbox.capture(source);

    expect(result.item.description()).toMatchObject({
      sourceKind: 'manual_text',
      externalKey: 'capture-1',
      latestRevisionSha256: hashInboxSource(source).contentSha256,
    });
    expect(result.revision.description().body).toBe('Run Pi locally.');
    expect(result.revisionCreated).toBe(true);
    expect(store.inboxItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: 'workspace-1',
        sourceKind: 'manual_text',
        externalKey: 'capture-1',
      }),
    });
    expect(store.inboxRevision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        revisionNumber: 1,
        contentSha256: hashInboxSource(source).contentSha256,
      }),
    });
  });

  it('treats a repeated source capture as an idempotent upsert', async () => {
    const store = mockPrismaStore();
    store.inboxItem.findFirst.mockResolvedValue(itemRow());
    store.inboxRevision.findFirst.mockResolvedValue(revisionRow());
    const inbox = new PrismaWorkspaceInbox(asStore(store), 'workspace-1');

    const result = await inbox.capture(source);

    expect(result.item.identity()).toBe('inbox-1');
    expect(result.revisionCreated).toBe(false);
    expect(store.inboxItem.create).not.toHaveBeenCalled();
    expect(store.inboxRevision.create).not.toHaveBeenCalled();
  });

  it('does not append an unchanged latest revision', async () => {
    const store = mockPrismaStore();
    store.inboxItem.findFirst.mockResolvedValue(itemRow());
    store.inboxRevision.findFirst.mockResolvedValue(revisionRow());
    const inbox = new PrismaWorkspaceInbox(asStore(store), 'workspace-1');

    const result = await inbox.appendRevision(
      'inbox-1',
      source,
      hashInboxSource(source).contentSha256,
    );

    expect(result.revisionCreated).toBe(false);
    expect(store.inboxRevision.create).not.toHaveBeenCalled();
    expect(store.inboxItem.updateMany).not.toHaveBeenCalled();
  });

  it('appends changed content with an optimistic item update', async () => {
    const store = mockPrismaStore();
    const changed = { ...source, body: 'Run Pi in an isolated worktree.' };
    const nextRevision = revisionRow({
      id: 'revision-2',
      revisionNumber: 2,
      body: changed.body,
      contentSha256: hashInboxSource(changed).contentSha256,
    });
    store.inboxItem.findFirst
      .mockResolvedValueOnce(itemRow())
      .mockResolvedValueOnce(
        itemRow({
          latestRevisionId: 'revision-2',
          latestRevision: nextRevision,
          version: 2,
          _count: { revisions: 2 },
        }),
      );
    store.inboxRevision.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(nextRevision);
    store.inboxItem.updateMany.mockResolvedValue({ count: 1 });
    const inbox = new PrismaWorkspaceInbox(asStore(store), 'workspace-1');

    const result = await inbox.appendRevision(
      'inbox-1',
      changed,
      hashInboxSource(source).contentSha256,
    );

    expect(result.revisionCreated).toBe(true);
    expect(store.inboxRevision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        revisionNumber: 2,
        body: changed.body,
      }),
    });
    expect(store.inboxItem.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'inbox-1',
        workspaceId: 'workspace-1',
        version: 1,
      },
      data: expect.objectContaining({
        latestRevisionId: expect.any(String),
        version: { increment: 1 },
      }),
    });
  });

  it('reuses a historical snapshot when source content reverts', async () => {
    const store = mockPrismaStore();
    const changed = { ...source, body: 'Changed content.' };
    const changedRevision = revisionRow({
      id: 'revision-2',
      revisionNumber: 2,
      body: changed.body,
      contentSha256: hashInboxSource(changed).contentSha256,
    });
    const current = itemRow({
      latestRevisionId: changedRevision.id,
      latestRevision: changedRevision,
      version: 2,
      _count: { revisions: 2 },
    });
    store.inboxItem.findFirst
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(itemRow({ _count: { revisions: 2 }, version: 3 }));
    store.inboxRevision.findFirst.mockResolvedValue(revisionRow());
    store.inboxItem.updateMany.mockResolvedValue({ count: 1 });
    const inbox = new PrismaWorkspaceInbox(asStore(store), 'workspace-1');

    const result = await inbox.appendRevision('inbox-1', source);

    expect(result.revision.identity()).toBe('revision-1');
    expect(result.revisionCreated).toBe(false);
    expect(store.inboxRevision.create).not.toHaveBeenCalled();
    expect(store.inboxItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ latestRevisionId: 'revision-1' }),
      }),
    );
  });

  it('keeps list and status changes inside the workspace boundary', async () => {
    const store = mockPrismaStore();
    store.inboxItem.findMany.mockResolvedValue([itemRow()]);
    store.inboxItem.count.mockResolvedValue(1);
    store.inboxItem.findFirst.mockResolvedValue(itemRow());
    store.inboxItem.updateMany.mockResolvedValue({ count: 0 });
    const inbox = new PrismaWorkspaceInbox(asStore(store), 'workspace-1');

    await expect(
      inbox.list({ page: 1, pageSize: 20, status: 'active', query: 'coding' }),
    ).resolves.toMatchObject([[expect.anything()], 1]);
    expect(store.inboxItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'workspace-1',
          status: 'active',
        }),
      }),
    );
    await expect(
      inbox.changeStatus('inbox-1', 'closed', 1),
    ).rejects.toMatchObject({ kind: 'conflict' });
    expect(store.inboxItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workspaceId: 'workspace-1' }),
      }),
    );
  });
});
