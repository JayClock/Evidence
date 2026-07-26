import { describe, expect, it } from 'vitest';
import { asStore, mockPrismaStore, timestamp } from './test-support';
import { PrismaWorkspaceInboxExtractions } from './workspace-inbox-extractions';

const contentSha256 = `sha256:${'a'.repeat(64)}`;

function revisionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'revision-1',
    inboxItemId: 'inbox-1',
    revisionNumber: 3,
    title: 'Frozen requirement',
    body: 'The exact source body.',
    contentType: 'text/markdown',
    uri: null,
    providerMetadata: { label: 'feature' },
    sourceUpdatedAt: null,
    capturedAt: timestamp,
    contentSha256,
    ...overrides,
  };
}

function itemRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inbox-1',
    workspaceId: 'workspace-1',
    sourceKind: 'manual_text',
    externalKey: 'manual:one',
    title: 'Frozen requirement',
    status: 'active',
    latestRevisionId: 'revision-1',
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    latestRevision: revisionRow(),
    ...overrides,
  };
}

function sourceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'source-1',
    extractionId: 'extraction-1',
    inboxItemId: 'inbox-1',
    inboxRevisionId: 'revision-1',
    position: 0,
    revisionNumber: 3,
    sourceKind: 'manual_text',
    externalKey: 'manual:one',
    itemStatus: 'active',
    title: 'Frozen requirement',
    body: 'The exact source body.',
    contentType: 'text/markdown',
    uri: null,
    providerMetadata: { label: 'feature' },
    sourceUpdatedAt: null,
    capturedAt: timestamp,
    contentSha256,
    ...overrides,
  };
}

function extractionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'extraction-1',
    reference: 'EXTRACT-0001',
    workspaceId: 'workspace-1',
    status: 'awaiting_agent',
    version: 1,
    requestedByUserId: 'user-1',
    requestedAt: timestamp,
    completedAt: null,
    failureSummary: null,
    sources: [sourceRow()],
    ...overrides,
  };
}

describe('PrismaWorkspaceInboxExtractions', () => {
  it('freezes exact latest Revisions in the human-selected order', async () => {
    const store = mockPrismaStore();
    store.inboxItem.findMany.mockResolvedValue([
      itemRow({
        id: 'inbox-2',
        latestRevision: revisionRow({ id: 'revision-2' }),
      }),
      itemRow(),
    ]);
    store.workspaceSequence.upsert.mockResolvedValue({
      workspaceId: 'workspace-1',
      nextExtractionNumber: 2,
      nextCandidateNumber: 1,
      nextDecisionNumber: 1,
      nextIterationNumber: 1,
      nextKickoffNumber: 1,
      updatedAt: timestamp,
    });
    store.inboxExtraction.findFirst.mockResolvedValue(extractionRow());
    const extractions = new PrismaWorkspaceInboxExtractions(
      asStore(store),
      'workspace-1',
      () => timestamp,
    );

    const extraction = await extractions.createExtraction(
      { inboxItemIds: ['inbox-1', 'inbox-2'] },
      'user-1',
    );

    expect(extraction.description()).toMatchObject({
      reference: 'EXTRACT-0001',
      status: 'awaiting_agent',
      sources: [
        expect.objectContaining({
          revisionNumber: 3,
          contentSha256,
          body: 'The exact source body.',
        }),
      ],
    });
    expect(store.inboxItem.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['inbox-1', 'inbox-2'] },
        workspaceId: 'workspace-1',
      },
      include: { latestRevision: true },
    });
    expect(store.inboxExtraction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        reference: 'EXTRACT-0001',
        status: 'awaiting_agent',
        requestedByUserId: 'user-1',
      }),
    });
    expect(store.inboxExtractionSource.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          inboxItemId: 'inbox-1',
          inboxRevisionId: 'revision-1',
          position: 0,
          contentSha256,
        }),
        expect.objectContaining({
          inboxItemId: 'inbox-2',
          inboxRevisionId: 'revision-2',
          position: 1,
        }),
      ],
    });
  });

  it('rejects non-active sources before allocating authority', async () => {
    const store = mockPrismaStore();
    store.inboxItem.findMany.mockResolvedValue([
      itemRow({ status: 'deferred' }),
    ]);
    const extractions = new PrismaWorkspaceInboxExtractions(
      asStore(store),
      'workspace-1',
    );

    await expect(
      extractions.createExtraction({ inboxItemIds: ['inbox-1'] }, 'user-1'),
    ).rejects.toThrow('must be active');
    expect(store.workspaceSequence.upsert).not.toHaveBeenCalled();
    expect(store.inboxExtraction.create).not.toHaveBeenCalled();
  });

  it('does not substitute a missing selected source', async () => {
    const store = mockPrismaStore();
    store.inboxItem.findMany.mockResolvedValue([itemRow()]);
    const extractions = new PrismaWorkspaceInboxExtractions(
      asStore(store),
      'workspace-1',
    );

    await expect(
      extractions.createExtraction(
        { inboxItemIds: ['inbox-1', 'inbox-2'] },
        'user-1',
      ),
    ).rejects.toThrow('Inbox item inbox-2 not found');
  });

  it('scopes lookup to the owning Workspace', async () => {
    const store = mockPrismaStore();
    store.inboxExtraction.findFirst.mockResolvedValue(extractionRow());
    const extractions = new PrismaWorkspaceInboxExtractions(
      asStore(store),
      'workspace-1',
    );

    await expect(
      extractions.findExtraction('extraction-1'),
    ).resolves.toMatchObject({
      identity: expect.any(Function),
    });
    expect(store.inboxExtraction.findFirst).toHaveBeenCalledWith({
      where: { id: 'extraction-1', workspaceId: 'workspace-1' },
      include: { sources: { orderBy: { position: 'asc' } } },
    });
  });
});
