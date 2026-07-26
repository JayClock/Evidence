import { randomUUID } from 'node:crypto';
import {
  DomainError,
  InboxExtraction,
  Ref,
  normalizeCreateInboxExtractionInput,
  parseInboxContentType,
  parseInboxItemStatus,
  type CreateInboxExtractionInput,
  type InboxExtractionSourceDescription,
  type JsonValue,
} from '@evidence/server-domain';
import { Prisma } from '@prisma/client';
import type { PrismaStore } from './types';
import { inputJson } from './utils';
import { allocateWorkspaceReference } from './workflow-sequence';

const EXTRACTION_INCLUDE = {
  sources: { orderBy: { position: 'asc' } },
} satisfies Prisma.InboxExtractionInclude;

const ITEM_INCLUDE = {
  latestRevision: true,
} satisfies Prisma.InboxItemInclude;

type ExtractionRow = Prisma.InboxExtractionGetPayload<{
  include: typeof EXTRACTION_INCLUDE;
}>;
type ExtractionSourceRow = ExtractionRow['sources'][number];
type ItemRow = Prisma.InboxItemGetPayload<{ include: typeof ITEM_INCLUDE }>;

export class PrismaWorkspaceInboxExtractions {
  constructor(
    private readonly store: PrismaStore,
    private readonly workspaceId: string,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async createExtraction(
    input: CreateInboxExtractionInput,
    requestedByUserId: string,
  ): Promise<InboxExtraction> {
    const normalized = normalizeCreateInboxExtractionInput(input);
    const requestedAt = this.clock();
    const extractionId = randomUUID();

    await this.store.$transaction(async (store) => {
      const items = await store.inboxItem.findMany({
        where: {
          id: { in: normalized.inboxItemIds },
          workspaceId: this.workspaceId,
        },
        include: ITEM_INCLUDE,
      });
      const orderedItems = requireSelectedItems(normalized.inboxItemIds, items);
      const reference = await allocateWorkspaceReference(
        store,
        this.workspaceId,
        'extraction',
        requestedAt,
      );

      await store.inboxExtraction.create({
        data: {
          id: extractionId,
          reference,
          workspaceId: this.workspaceId,
          status: 'awaiting_agent',
          version: 1,
          requestedByUserId,
          requestedAt,
        },
      });
      await store.inboxExtractionSource.createMany({
        data: orderedItems.map((item, position) => {
          const revision = requireLatestRevision(item);
          return {
            id: randomUUID(),
            extractionId,
            inboxItemId: item.id,
            inboxRevisionId: revision.id,
            position,
            revisionNumber: revision.revisionNumber,
            sourceKind: item.sourceKind,
            externalKey: item.externalKey,
            itemStatus: item.status,
            title: revision.title,
            body: revision.body,
            contentType: revision.contentType,
            uri: revision.uri,
            providerMetadata: inputJson(revision.providerMetadata),
            sourceUpdatedAt: revision.sourceUpdatedAt,
            capturedAt: revision.capturedAt,
            contentSha256: revision.contentSha256,
          };
        }),
      });
    });

    return this.requireExtraction(extractionId);
  }

  async findExtraction(extractionId: string): Promise<InboxExtraction | null> {
    const row = await this.store.inboxExtraction.findFirst({
      where: { id: extractionId, workspaceId: this.workspaceId },
      include: EXTRACTION_INCLUDE,
    });
    return row ? assembleExtraction(row) : null;
  }

  async requireExtraction(extractionId: string): Promise<InboxExtraction> {
    const extraction = await this.findExtraction(extractionId);
    if (!extraction) {
      throw DomainError.notFound(`Inbox Extraction ${extractionId} not found`);
    }
    return extraction;
  }
}

export function assembleExtraction(row: ExtractionRow): InboxExtraction {
  return new InboxExtraction(row.id, {
    reference: row.reference,
    workspace: new Ref(row.workspaceId),
    status: parseExtractionStatus(row.status),
    sources: row.sources.map(assembleExtractionSource),
    version: row.version,
    requestedBy: new Ref(row.requestedByUserId),
    requestedAt: row.requestedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    failureSummary: row.failureSummary,
  });
}

export function extractionInclude() {
  return EXTRACTION_INCLUDE;
}

function assembleExtractionSource(
  row: ExtractionSourceRow,
): InboxExtractionSourceDescription {
  return {
    position: row.position,
    inboxItem: new Ref(row.inboxItemId),
    inboxRevision: new Ref(row.inboxRevisionId),
    revisionNumber: row.revisionNumber,
    sourceKind: row.sourceKind,
    externalKey: row.externalKey,
    itemStatus: parseInboxItemStatus(row.itemStatus),
    title: row.title,
    body: row.body,
    contentType: parseInboxContentType(row.contentType),
    uri: row.uri,
    providerMetadata: row.providerMetadata as Record<string, JsonValue>,
    sourceUpdatedAt: row.sourceUpdatedAt?.toISOString() ?? null,
    capturedAt: row.capturedAt.toISOString(),
    contentSha256: row.contentSha256,
  };
}

function requireSelectedItems(
  selectedIds: string[],
  rows: ItemRow[],
): ItemRow[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return selectedIds.map((itemId) => {
    const row = byId.get(itemId);
    if (!row) {
      throw DomainError.notFound(`Inbox item ${itemId} not found`);
    }
    if (row.status !== 'active') {
      throw DomainError.conflict(
        `Inbox item ${itemId} must be active for extraction`,
      );
    }
    requireLatestRevision(row);
    return row;
  });
}

function requireLatestRevision(row: ItemRow) {
  if (!row.latestRevision) {
    throw DomainError.internal(`Inbox item ${row.id} has no latest Revision`);
  }
  return row.latestRevision;
}

function parseExtractionStatus(
  value: string,
): 'awaiting_agent' | 'completed' | 'failed' | 'cancelled' {
  if (
    value === 'awaiting_agent' ||
    value === 'completed' ||
    value === 'failed' ||
    value === 'cancelled'
  ) {
    return value;
  }
  throw DomainError.internal(`unsupported Inbox Extraction status: ${value}`);
}
