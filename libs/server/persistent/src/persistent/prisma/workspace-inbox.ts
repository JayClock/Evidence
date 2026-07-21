import { randomUUID } from 'node:crypto';
import {
  assertInboxVersion,
  DomainError,
  InboxItem,
  InboxRevision,
  Ref,
  type CapturedInboxItem,
  type InboxContentType,
  type InboxItemStatus,
  type InboxListQuery,
  type InboxSourceInput,
  type JsonValue,
  type WorkspaceInbox,
} from '@evidence/server-domain';
import { Prisma } from '@prisma/client';
import { EntityList } from '../database';
import { hashInboxSource, type NormalizedInboxSource } from '../inbox-content';
import type { PrismaStore } from './types';
import { inputJson, isUniqueConflict } from './utils';

const ITEM_INCLUDE = {
  latestRevision: true,
  _count: { select: { revisions: true } },
} satisfies Prisma.InboxItemInclude;

type InboxItemRow = Prisma.InboxItemGetPayload<{
  include: typeof ITEM_INCLUDE;
}>;
type InboxRevisionRow = Prisma.InboxRevisionGetPayload<Record<string, never>>;

export class PrismaWorkspaceInbox
  extends EntityList<InboxItem>
  implements WorkspaceInbox
{
  constructor(
    private readonly store: PrismaStore,
    private readonly workspaceId: string,
  ) {
    super();
  }

  protected override async findEntities(
    from: number,
    to: number,
  ): Promise<InboxItem[]> {
    const rows = await this.store.inboxItem.findMany({
      where: { workspaceId: this.workspaceId },
      include: ITEM_INCLUDE,
      orderBy: { updatedAt: 'desc' },
      skip: from,
      take: Math.max(to - from, 0),
    });
    return rows.map(assembleInboxItem);
  }

  protected override async findEntity(id: string): Promise<InboxItem | null> {
    const row = await this.store.inboxItem.findFirst({
      where: { id, workspaceId: this.workspaceId },
      include: ITEM_INCLUDE,
    });
    return row ? assembleInboxItem(row) : null;
  }

  override async size(): Promise<number> {
    return this.store.inboxItem.count({
      where: { workspaceId: this.workspaceId },
    });
  }

  async list(query: InboxListQuery): Promise<[InboxItem[], number]> {
    validatePage(query.page, query.pageSize);
    const where = listWhere(this.workspaceId, query);
    const [rows, total] = await Promise.all([
      this.store.inboxItem.findMany({
        where,
        include: ITEM_INCLUDE,
        orderBy: { updatedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.store.inboxItem.count({ where }),
    ]);
    return [rows.map(assembleInboxItem), total];
  }

  async capture(sourceInput: InboxSourceInput): Promise<CapturedInboxItem> {
    const { source, contentSha256 } = hashInboxSource(sourceInput);
    const itemId = randomUUID();
    const revisionId = randomUUID();
    const timestamp = new Date();

    try {
      await this.transaction(async (store) => {
        await store.inboxItem.create({
          data: {
            id: itemId,
            workspaceId: this.workspaceId,
            sourceKind: source.sourceKind,
            externalKey: source.externalKey,
            title: source.title,
            status: 'active',
            latestRevisionId: null,
            version: 1,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        });
        await store.inboxRevision.create({
          data: revisionData(
            revisionId,
            itemId,
            1,
            source,
            contentSha256,
            timestamp,
          ),
        });
        await store.inboxItem.update({
          where: { id: itemId },
          data: { latestRevisionId: revisionId },
        });
      });
    } catch (error) {
      if (isUniqueConflict(error)) {
        throw DomainError.conflict(
          `Inbox source ${source.sourceKind}/${source.externalKey} already exists`,
        );
      }
      throw error;
    }

    return this.captureResult(itemId, revisionId, true);
  }

  async appendRevision(
    itemId: string,
    sourceInput: InboxSourceInput,
    expectedLatestRevisionSha256?: string,
  ): Promise<CapturedInboxItem> {
    const { source, contentSha256 } = hashInboxSource(sourceInput);
    let revisionId = '';
    let revisionCreated = false;

    try {
      await this.transaction(async (store) => {
        const current = await requireItem(store, this.workspaceId, itemId);
        const latestRevision = requireLatestRevision(current);
        assertSameSource(current, source);
        if (
          expectedLatestRevisionSha256 !== undefined &&
          latestRevision.contentSha256 !== expectedLatestRevisionSha256
        ) {
          throw DomainError.conflict(
            `Inbox item ${itemId} latest revision has changed`,
          );
        }
        if (latestRevision.contentSha256 === contentSha256) {
          revisionId = latestRevision.id;
          return;
        }

        revisionId = randomUUID();
        const timestamp = new Date();
        await store.inboxRevision.create({
          data: revisionData(
            revisionId,
            itemId,
            current._count.revisions + 1,
            source,
            contentSha256,
            timestamp,
          ),
        });
        const updated = await store.inboxItem.updateMany({
          where: {
            id: itemId,
            workspaceId: this.workspaceId,
            version: current.version,
          },
          data: {
            title: source.title,
            latestRevisionId: revisionId,
            version: { increment: 1 },
            updatedAt: timestamp,
          },
        });
        if (updated.count !== 1) {
          throw DomainError.conflict(`Inbox item ${itemId} has changed`);
        }
        revisionCreated = true;
      });
    } catch (error) {
      if (isUniqueConflict(error)) {
        throw DomainError.conflict(`Inbox item ${itemId} has changed`);
      }
      throw error;
    }

    return this.captureResult(itemId, revisionId, revisionCreated);
  }

  async changeStatus(
    itemId: string,
    status: InboxItemStatus,
    expectedVersion: number,
  ): Promise<InboxItem> {
    assertInboxVersion(expectedVersion);
    const current = await this.findByIdentity(itemId);
    if (!current) {
      throw DomainError.notFound(`Inbox item ${itemId} not found`);
    }
    const updated = await this.store.inboxItem.updateMany({
      where: {
        id: itemId,
        workspaceId: this.workspaceId,
        version: expectedVersion,
      },
      data: {
        status,
        version: { increment: 1 },
        updatedAt: new Date(),
      },
    });
    if (updated.count !== 1) {
      throw DomainError.conflict(`Inbox item ${itemId} has changed`);
    }
    const item = await this.findByIdentity(itemId);
    if (!item) {
      throw DomainError.internal(`Inbox item ${itemId} was not persisted`);
    }
    return item;
  }

  async listRevisions(
    itemId: string,
    page: number,
    pageSize: number,
  ): Promise<[InboxRevision[], number]> {
    validatePage(page, pageSize);
    await this.requireOwnedItem(itemId);
    const where: Prisma.InboxRevisionWhereInput = { inboxItemId: itemId };
    const [rows, total] = await Promise.all([
      this.store.inboxRevision.findMany({
        where,
        orderBy: { revisionNumber: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.store.inboxRevision.count({ where }),
    ]);
    return [rows.map(assembleInboxRevision), total];
  }

  async findRevision(
    itemId: string,
    revisionId: string,
  ): Promise<InboxRevision | null> {
    const row = await this.store.inboxRevision.findFirst({
      where: {
        id: revisionId,
        inboxItemId: itemId,
        item: { workspaceId: this.workspaceId },
      },
    });
    return row ? assembleInboxRevision(row) : null;
  }

  private async captureResult(
    itemId: string,
    revisionId: string,
    revisionCreated: boolean,
  ): Promise<CapturedInboxItem> {
    const [item, revision] = await Promise.all([
      this.findByIdentity(itemId),
      this.findRevision(itemId, revisionId),
    ]);
    if (!item || !revision) {
      throw DomainError.internal(`Inbox item ${itemId} was not persisted`);
    }
    return { item, revision, revisionCreated };
  }

  private async requireOwnedItem(itemId: string): Promise<InboxItem> {
    const item = await this.findByIdentity(itemId);
    if (!item) {
      throw DomainError.notFound(`Inbox item ${itemId} not found`);
    }
    return item;
  }

  private async transaction<T>(
    operation: (store: PrismaStore) => Promise<T>,
  ): Promise<T> {
    if ('$transaction' in this.store) {
      return this.store.$transaction((transaction) => operation(transaction));
    }
    return operation(this.store);
  }
}

function listWhere(
  workspaceId: string,
  query: InboxListQuery,
): Prisma.InboxItemWhereInput {
  const search = query.query?.trim();
  return {
    workspaceId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.sourceKind ? { sourceKind: query.sourceKind.trim() } : {}),
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: 'insensitive' } },
            { externalKey: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
}

async function requireItem(
  store: PrismaStore,
  workspaceId: string,
  itemId: string,
): Promise<InboxItemRow> {
  const item = await store.inboxItem.findFirst({
    where: { id: itemId, workspaceId },
    include: ITEM_INCLUDE,
  });
  if (!item) {
    throw DomainError.notFound(`Inbox item ${itemId} not found`);
  }
  return item;
}

function requireLatestRevision(
  item: InboxItemRow,
): NonNullable<InboxItemRow['latestRevision']> {
  if (!item.latestRevision) {
    throw DomainError.internal(`Inbox item ${item.id} has no latest revision`);
  }
  return item.latestRevision;
}

function assertSameSource(
  item: InboxItemRow,
  source: NormalizedInboxSource,
): void {
  if (
    item.sourceKind !== source.sourceKind ||
    item.externalKey !== source.externalKey
  ) {
    throw DomainError.validation(
      `Inbox revision source must match item ${item.id}`,
    );
  }
}

function revisionData(
  id: string,
  inboxItemId: string,
  revisionNumber: number,
  source: NormalizedInboxSource,
  contentSha256: string,
  capturedAt: Date,
): Prisma.InboxRevisionUncheckedCreateInput {
  return {
    id,
    inboxItemId,
    revisionNumber,
    title: source.title,
    body: source.body,
    contentType: source.contentType,
    uri: source.uri,
    providerMetadata: inputJson(source.providerMetadata),
    sourceUpdatedAt: source.sourceUpdatedAt
      ? new Date(source.sourceUpdatedAt)
      : null,
    capturedAt,
    contentSha256,
  };
}

function assembleInboxItem(row: InboxItemRow): InboxItem {
  if (!row.latestRevisionId || !row.latestRevision) {
    throw DomainError.internal(`Inbox item ${row.id} has no latest revision`);
  }
  return new InboxItem(row.id, {
    workspace: new Ref(row.workspaceId),
    sourceKind: row.sourceKind,
    externalKey: row.externalKey,
    title: row.title,
    status: row.status as InboxItemStatus,
    latestRevisionId: row.latestRevisionId,
    latestRevisionSha256: row.latestRevision.contentSha256,
    revisionCount: row._count.revisions,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

function assembleInboxRevision(row: InboxRevisionRow): InboxRevision {
  return new InboxRevision(row.id, {
    item: new Ref(row.inboxItemId),
    revisionNumber: row.revisionNumber,
    title: row.title,
    body: row.body,
    contentType: row.contentType as InboxContentType,
    uri: row.uri,
    providerMetadata: jsonRecord(row.providerMetadata),
    sourceUpdatedAt: row.sourceUpdatedAt?.toISOString() ?? null,
    capturedAt: row.capturedAt.toISOString(),
    contentSha256: row.contentSha256,
  });
}

function jsonRecord(value: Prisma.JsonValue): Record<string, JsonValue> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, JsonValue>;
}

function validatePage(page: number, pageSize: number): void {
  if (
    !Number.isSafeInteger(page) ||
    page <= 0 ||
    !Number.isSafeInteger(pageSize) ||
    pageSize <= 0
  ) {
    throw DomainError.validation('page and pageSize must be greater than 0');
  }
}
