import { randomUUID } from 'node:crypto';
import {
  DomainError,
  Workspace,
  WorkspaceDescription,
  Workspaces,
} from '@evidence/server-domain';
import { EntityList } from '../database';
import {
  normalizeWorkspaceMetadata,
  workspaceTitleFromMetadata,
} from '../workspace-paths';
import {
  assembleSqliteWorkspace,
  type SqliteWorkspaceRow,
} from './sqlite-mappers';
import { SqliteRegistry } from './sqlite-registry';

const WORKSPACE_COLUMNS = `
  id,
  title,
  description,
  status,
  metadata,
  created_at AS createdAt,
  updated_at AS updatedAt
`;

export class SqliteWorkspaces
  extends EntityList<Workspace>
  implements Workspaces
{
  constructor(private readonly registry: SqliteRegistry) {
    super();
  }

  protected override async findEntities(
    from: number,
    to: number,
  ): Promise<Workspace[]> {
    const rows = this.registry.database
      .prepare(
        `SELECT ${WORKSPACE_COLUMNS}
           FROM workspaces
          WHERE deleted_at IS NULL
          ORDER BY updated_at DESC
          LIMIT ? OFFSET ?`,
      )
      .all(Math.max(to - from, 0), from) as SqliteWorkspaceRow[];
    return rows.map((row) => assembleSqliteWorkspace(this.registry, row));
  }

  protected override async findEntity(id: string): Promise<Workspace | null> {
    const row = this.registry.database
      .prepare(
        `SELECT ${WORKSPACE_COLUMNS}
           FROM workspaces
          WHERE deleted_at IS NULL AND id = ?`,
      )
      .get(id) as SqliteWorkspaceRow | undefined;
    return row ? assembleSqliteWorkspace(this.registry, row) : null;
  }

  override async size(): Promise<number> {
    const row = this.registry.database
      .prepare(
        'SELECT COUNT(*) AS total FROM workspaces WHERE deleted_at IS NULL',
      )
      .get() as { total: number };
    return Number(row.total);
  }

  async create(
    ownerUserId: string,
    desc: WorkspaceDescription,
  ): Promise<Workspace> {
    const id = randomUUID();
    const timestamp = new Date().toISOString();
    const metadata = await normalizeWorkspaceMetadata(desc.metadata);
    const title = normalizeTitle(desc.title, metadata);

    this.registry.transaction(() => {
      this.registry.database
        .prepare(
          `INSERT INTO workspaces
            (id, title, description, status, metadata, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          title,
          desc.description,
          defaultIfBlank(desc.status, 'active'),
          JSON.stringify(metadata),
          timestamp,
          timestamp,
        );

      this.registry.database
        .prepare(
          `INSERT INTO workspace_members
            (id, workspace_id, user_id, role, created_at, updated_at)
           VALUES (?, ?, ?, 'owner', ?, ?)`,
        )
        .run(randomUUID(), id, ownerUserId, timestamp, timestamp);
    });

    const created = await this.findByIdentity(id);
    if (!created) {
      throw DomainError.internal(`workspace ${id} was not persisted`);
    }
    return created;
  }

  async update(id: string, desc: WorkspaceDescription): Promise<Workspace> {
    const current = await this.findByIdentity(id);
    if (!current) {
      throw DomainError.notFound(`workspace ${id} not found`);
    }

    const metadataInput =
      Object.keys(desc.metadata).length === 0
        ? current.description().metadata
        : desc.metadata;
    const metadata = await normalizeWorkspaceMetadata(metadataInput);
    this.registry.database
      .prepare(
        `UPDATE workspaces
            SET title = ?, description = ?, status = ?, metadata = ?, updated_at = ?
          WHERE id = ? AND deleted_at IS NULL`,
      )
      .run(
        normalizeTitle(desc.title, metadata),
        desc.description,
        defaultIfBlank(desc.status, 'active'),
        JSON.stringify(metadata),
        new Date().toISOString(),
        id,
      );

    const updated = await this.findByIdentity(id);
    if (!updated) {
      throw DomainError.internal(`workspace ${id} was not updated`);
    }
    return updated;
  }

  async delete(id: string): Promise<void> {
    const timestamp = new Date().toISOString();
    const result = this.registry.database
      .prepare(
        `UPDATE workspaces
            SET deleted_at = ?, updated_at = ?
          WHERE id = ? AND deleted_at IS NULL`,
      )
      .run(timestamp, timestamp, id);
    if (Number(result.changes) === 0) {
      throw DomainError.notFound(`workspace ${id} not found`);
    }
  }
}

function defaultIfBlank(value: string, defaultValue: string): string {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : defaultValue;
}

function normalizeTitle(
  title: string,
  metadata: Record<string, string>,
): string {
  const normalized = title.trim();
  if (normalized.length > 0) {
    return normalized;
  }

  const fallback = workspaceTitleFromMetadata(metadata);
  if (!fallback) {
    throw DomainError.validation('workspace title must not be empty');
  }
  return fallback;
}
