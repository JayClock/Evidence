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
import { EntityList } from '../database';
import { hashInboxSource, type NormalizedInboxSource } from '../inbox-content';
import { SqliteRegistry } from './sqlite-registry';

type SqlValue = string | number | bigint | Uint8Array | null;

interface InboxItemRow {
  id: string;
  workspaceId: string;
  sourceKind: string;
  externalKey: string;
  title: string;
  status: string;
  latestRevisionId: string;
  latestRevisionSha256: string;
  revisionCount: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

interface InboxRevisionRow {
  id: string;
  inboxItemId: string;
  revisionNumber: number;
  title: string;
  body: string;
  contentType: string;
  uri: string | null;
  providerMetadata: string;
  sourceUpdatedAt: string | null;
  capturedAt: string;
  contentSha256: string;
}

const ITEM_COLUMNS = `
  i.id,
  i.workspace_id AS workspaceId,
  i.source_kind AS sourceKind,
  i.external_key AS externalKey,
  i.title,
  i.status,
  i.latest_revision_id AS latestRevisionId,
  latest.content_sha256 AS latestRevisionSha256,
  (SELECT COUNT(*) FROM inbox_revisions counted WHERE counted.inbox_item_id = i.id) AS revisionCount,
  i.version,
  i.created_at AS createdAt,
  i.updated_at AS updatedAt
`;

const REVISION_COLUMNS = `
  r.id,
  r.inbox_item_id AS inboxItemId,
  r.revision_number AS revisionNumber,
  r.title,
  r.body,
  r.content_type AS contentType,
  r.uri,
  r.provider_metadata AS providerMetadata,
  r.source_updated_at AS sourceUpdatedAt,
  r.captured_at AS capturedAt,
  r.content_sha256 AS contentSha256
`;

export class SqliteWorkspaceInbox
  extends EntityList<InboxItem>
  implements WorkspaceInbox
{
  constructor(
    private readonly registry: SqliteRegistry,
    private readonly workspaceId: string,
  ) {
    super();
  }

  protected override async findEntities(
    from: number,
    to: number,
  ): Promise<InboxItem[]> {
    const rows = this.registry.database
      .prepare(
        `${itemSelect()}
         WHERE i.workspace_id = ?
         ORDER BY i.updated_at DESC
         LIMIT ? OFFSET ?`,
      )
      .all(
        this.workspaceId,
        Math.max(to - from, 0),
        from,
      ) as unknown as InboxItemRow[];
    return rows.map(assembleInboxItem);
  }

  protected override async findEntity(id: string): Promise<InboxItem | null> {
    const row = this.itemRow(id);
    return row ? assembleInboxItem(row) : null;
  }

  override async size(): Promise<number> {
    const row = this.registry.database
      .prepare(
        'SELECT COUNT(*) AS total FROM inbox_items WHERE workspace_id = ?',
      )
      .get(this.workspaceId) as { total: number };
    return Number(row.total);
  }

  async list(query: InboxListQuery): Promise<[InboxItem[], number]> {
    validatePage(query.page, query.pageSize);
    const { where, parameters } = listFilter(this.workspaceId, query);
    const rows = this.registry.database
      .prepare(
        `${itemSelect()}
         WHERE ${where}
         ORDER BY i.updated_at DESC
         LIMIT ? OFFSET ?`,
      )
      .all(
        ...parameters,
        query.pageSize,
        (query.page - 1) * query.pageSize,
      ) as unknown as InboxItemRow[];
    const count = this.registry.database
      .prepare(`SELECT COUNT(*) AS total FROM inbox_items i WHERE ${where}`)
      .get(...parameters) as { total: number };
    return [rows.map(assembleInboxItem), Number(count.total)];
  }

  async capture(sourceInput: InboxSourceInput): Promise<CapturedInboxItem> {
    const { source, contentSha256 } = hashInboxSource(sourceInput);
    const itemId = randomUUID();
    const revisionId = randomUUID();
    const timestamp = new Date().toISOString();

    try {
      this.registry.transaction(() => {
        this.registry.database
          .prepare(
            `INSERT INTO inbox_items
              (id, workspace_id, source_kind, external_key, title, status,
               latest_revision_id, version, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, 'active', NULL, 1, ?, ?)`,
          )
          .run(
            itemId,
            this.workspaceId,
            source.sourceKind,
            source.externalKey,
            source.title,
            timestamp,
            timestamp,
          );
        this.insertRevision(
          revisionId,
          itemId,
          1,
          source,
          contentSha256,
          timestamp,
        );
        this.registry.database
          .prepare('UPDATE inbox_items SET latest_revision_id = ? WHERE id = ?')
          .run(revisionId, itemId);
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
      this.registry.transaction(() => {
        const current = this.requireItemRow(itemId);
        assertSameSource(current, source);
        if (
          expectedLatestRevisionSha256 !== undefined &&
          current.latestRevisionSha256 !== expectedLatestRevisionSha256
        ) {
          throw DomainError.conflict(
            `Inbox item ${itemId} latest revision has changed`,
          );
        }
        if (current.latestRevisionSha256 === contentSha256) {
          revisionId = current.latestRevisionId;
          return;
        }

        revisionId = randomUUID();
        const timestamp = new Date().toISOString();
        this.insertRevision(
          revisionId,
          itemId,
          current.revisionCount + 1,
          source,
          contentSha256,
          timestamp,
        );
        const updated = this.registry.database
          .prepare(
            `UPDATE inbox_items
                SET title = ?, latest_revision_id = ?, version = version + 1,
                    updated_at = ?
              WHERE id = ? AND workspace_id = ? AND version = ?`,
          )
          .run(
            source.title,
            revisionId,
            timestamp,
            itemId,
            this.workspaceId,
            current.version,
          );
        if (Number(updated.changes) !== 1) {
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
    if (!this.itemRow(itemId)) {
      throw DomainError.notFound(`Inbox item ${itemId} not found`);
    }
    const updated = this.registry.database
      .prepare(
        `UPDATE inbox_items
            SET status = ?, version = version + 1, updated_at = ?
          WHERE id = ? AND workspace_id = ? AND version = ?`,
      )
      .run(
        status,
        new Date().toISOString(),
        itemId,
        this.workspaceId,
        expectedVersion,
      );
    if (Number(updated.changes) !== 1) {
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
    this.requireItemRow(itemId);
    const rows = this.registry.database
      .prepare(
        `${revisionSelect()}
         WHERE r.inbox_item_id = ?
         ORDER BY r.revision_number DESC
         LIMIT ? OFFSET ?`,
      )
      .all(
        itemId,
        pageSize,
        (page - 1) * pageSize,
      ) as unknown as InboxRevisionRow[];
    const count = this.registry.database
      .prepare(
        'SELECT COUNT(*) AS total FROM inbox_revisions WHERE inbox_item_id = ?',
      )
      .get(itemId) as { total: number };
    return [rows.map(assembleInboxRevision), Number(count.total)];
  }

  async findRevision(
    itemId: string,
    revisionId: string,
  ): Promise<InboxRevision | null> {
    const row = this.registry.database
      .prepare(
        `${revisionSelect()}
         JOIN inbox_items item ON item.id = r.inbox_item_id
         WHERE r.id = ? AND r.inbox_item_id = ? AND item.workspace_id = ?`,
      )
      .get(revisionId, itemId, this.workspaceId) as unknown as
      | InboxRevisionRow
      | undefined;
    return row ? assembleInboxRevision(row) : null;
  }

  private itemRow(itemId: string): InboxItemRow | undefined {
    return this.registry.database
      .prepare(
        `${itemSelect()}
         WHERE i.id = ? AND i.workspace_id = ?`,
      )
      .get(itemId, this.workspaceId) as unknown as InboxItemRow | undefined;
  }

  private requireItemRow(itemId: string): InboxItemRow {
    const item = this.itemRow(itemId);
    if (!item) {
      throw DomainError.notFound(`Inbox item ${itemId} not found`);
    }
    return item;
  }

  private insertRevision(
    revisionId: string,
    itemId: string,
    revisionNumber: number,
    source: NormalizedInboxSource,
    contentSha256: string,
    capturedAt: string,
  ): void {
    this.registry.database
      .prepare(
        `INSERT INTO inbox_revisions
          (id, inbox_item_id, revision_number, title, body, content_type, uri,
           provider_metadata, source_updated_at, captured_at, content_sha256)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        revisionId,
        itemId,
        revisionNumber,
        source.title,
        source.body,
        source.contentType,
        source.uri,
        JSON.stringify(source.providerMetadata),
        source.sourceUpdatedAt,
        capturedAt,
        contentSha256,
      );
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
}

function itemSelect(): string {
  return `SELECT ${ITEM_COLUMNS}
            FROM inbox_items i
            JOIN inbox_revisions latest ON latest.id = i.latest_revision_id`;
}

function revisionSelect(): string {
  return `SELECT ${REVISION_COLUMNS} FROM inbox_revisions r`;
}

function listFilter(
  workspaceId: string,
  query: InboxListQuery,
): { where: string; parameters: SqlValue[] } {
  const conditions = ['i.workspace_id = ?'];
  const parameters: SqlValue[] = [workspaceId];
  if (query.status) {
    conditions.push('i.status = ?');
    parameters.push(query.status);
  }
  if (query.sourceKind?.trim()) {
    conditions.push('i.source_kind = ?');
    parameters.push(query.sourceKind.trim());
  }
  if (query.query?.trim()) {
    conditions.push('(LOWER(i.title) LIKE ? OR LOWER(i.external_key) LIKE ?)');
    const pattern = `%${query.query.trim().toLowerCase()}%`;
    parameters.push(pattern, pattern);
  }
  return { where: conditions.join(' AND '), parameters };
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

function assembleInboxItem(row: InboxItemRow): InboxItem {
  return new InboxItem(row.id, {
    workspace: new Ref(row.workspaceId),
    sourceKind: row.sourceKind,
    externalKey: row.externalKey,
    title: row.title,
    status: row.status as InboxItemStatus,
    latestRevisionId: row.latestRevisionId,
    latestRevisionSha256: row.latestRevisionSha256,
    revisionCount: Number(row.revisionCount),
    version: Number(row.version),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

function assembleInboxRevision(row: InboxRevisionRow): InboxRevision {
  return new InboxRevision(row.id, {
    item: new Ref(row.inboxItemId),
    revisionNumber: Number(row.revisionNumber),
    title: row.title,
    body: row.body,
    contentType: row.contentType as InboxContentType,
    uri: row.uri,
    providerMetadata: parseMetadata(row.providerMetadata),
    sourceUpdatedAt: row.sourceUpdatedAt,
    capturedAt: row.capturedAt,
    contentSha256: row.contentSha256,
  });
}

function parseMetadata(value: string): Record<string, JsonValue> {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    return parsed as Record<string, JsonValue>;
  } catch {
    throw DomainError.internal('Inbox provider metadata is invalid');
  }
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

function isUniqueConflict(error: unknown): boolean {
  return (
    error instanceof Error && error.message.includes('UNIQUE constraint failed')
  );
}
