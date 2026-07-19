import { randomUUID } from 'node:crypto';
import {
  DomainError,
  UserWorkspaces,
  Workspace,
  WorkspaceDescription,
} from '@evidence/server-nest-domain';
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
  w.id,
  w.title,
  w.description,
  w.status,
  w.metadata,
  w.created_at AS createdAt,
  w.updated_at AS updatedAt
`;

export class SqliteUserWorkspaces
  extends EntityList<Workspace>
  implements UserWorkspaces
{
  constructor(
    private readonly registry: SqliteRegistry,
    private readonly userId: string | null,
  ) {
    super();
  }

  protected override async findEntities(
    from: number,
    to: number,
  ): Promise<Workspace[]> {
    const { join, condition, parameters } = this.visibility();
    const rows = this.registry.database
      .prepare(
        `SELECT ${WORKSPACE_COLUMNS}
           FROM workspaces w ${join}
          WHERE ${condition}
          ORDER BY w.updated_at DESC
          LIMIT ? OFFSET ?`,
      )
      .all(...parameters, Math.max(to - from, 0), from) as SqliteWorkspaceRow[];
    return rows.map((row) => assembleSqliteWorkspace(this.registry, row));
  }

  protected override async findEntity(id: string): Promise<Workspace | null> {
    const { join, condition, parameters } = this.visibility();
    const row = this.registry.database
      .prepare(
        `SELECT ${WORKSPACE_COLUMNS}
           FROM workspaces w ${join}
          WHERE ${condition} AND w.id = ?`,
      )
      .get(...parameters, id) as SqliteWorkspaceRow | undefined;
    return row ? assembleSqliteWorkspace(this.registry, row) : null;
  }

  override async size(): Promise<number> {
    const { join, condition, parameters } = this.visibility();
    const row = this.registry.database
      .prepare(
        `SELECT COUNT(*) AS total FROM workspaces w ${join} WHERE ${condition}`,
      )
      .get(...parameters) as { total: number };
    return Number(row.total);
  }

  async list(
    page: number,
    pageSize: number,
    query: string | null,
  ): Promise<[Workspace[], number]> {
    rejectInvalidPage(page, pageSize);
    const { join, condition, parameters } = this.visibility();
    const normalizedQuery = query?.trim() ?? '';
    const searchCondition = normalizedQuery
      ? " AND (lower(w.title) LIKE lower(?) OR lower(COALESCE(w.description, '')) LIKE lower(?))"
      : '';
    const searchParameters = normalizedQuery
      ? [`%${normalizedQuery}%`, `%${normalizedQuery}%`]
      : [];
    const allParameters = [...parameters, ...searchParameters];

    const rows = this.registry.database
      .prepare(
        `SELECT ${WORKSPACE_COLUMNS}
           FROM workspaces w ${join}
          WHERE ${condition}${searchCondition}
          ORDER BY w.updated_at DESC
          LIMIT ? OFFSET ?`,
      )
      .all(
        ...allParameters,
        pageSize,
        (page - 1) * pageSize,
      ) as SqliteWorkspaceRow[];
    const total = this.registry.database
      .prepare(
        `SELECT COUNT(*) AS total
           FROM workspaces w ${join}
          WHERE ${condition}${searchCondition}`,
      )
      .get(...allParameters) as { total: number };

    return [
      rows.map((row) => assembleSqliteWorkspace(this.registry, row)),
      Number(total.total),
    ];
  }

  async create(desc: WorkspaceDescription): Promise<Workspace> {
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

      if (this.userId) {
        this.registry.database
          .prepare(
            `INSERT INTO workspace_members
              (id, workspace_id, user_id, role, created_at, updated_at)
             VALUES (?, ?, ?, 'owner', ?, ?)`,
          )
          .run(randomUUID(), id, this.userId, timestamp, timestamp);
      }
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

  private visibility(): {
    join: string;
    condition: string;
    parameters: string[];
  } {
    if (!this.userId) {
      return {
        join: '',
        condition: 'w.deleted_at IS NULL',
        parameters: [],
      };
    }
    return {
      join: 'JOIN workspace_members wm ON wm.workspace_id = w.id',
      condition: 'w.deleted_at IS NULL AND wm.user_id = ?',
      parameters: [this.userId],
    };
  }
}

function rejectInvalidPage(page: number, pageSize: number): void {
  if (page === 0 || pageSize === 0) {
    throw DomainError.validation('page and pageSize must be greater than 0');
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
