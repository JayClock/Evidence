import { randomUUID } from 'node:crypto';
import {
  DomainError,
  Member,
  MemberDescription,
  WorkspaceMembers,
} from '@evidence/server-nest-domain';
import { EntityList } from '../database';
import {
  assembleSqliteMember,
  type SqliteMemberRow,
} from './sqlite-mappers';
import { SqliteRegistry } from './sqlite-registry';

const MEMBER_COLUMNS = `
  id,
  workspace_id AS workspaceId,
  user_id AS userId,
  role,
  created_at AS createdAt,
  updated_at AS updatedAt
`;

export class SqliteWorkspaceMembers
  extends EntityList<Member>
  implements WorkspaceMembers
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
  ): Promise<Member[]> {
    const rows = this.registry.database
      .prepare(
        `SELECT ${MEMBER_COLUMNS}
           FROM workspace_members
          WHERE workspace_id = ?
          ORDER BY created_at ASC
          LIMIT ? OFFSET ?`,
      )
      .all(
        this.workspaceId,
        Math.max(to - from, 0),
        from,
      ) as SqliteMemberRow[];
    return rows.map(assembleSqliteMember);
  }

  protected override async findEntity(id: string): Promise<Member | null> {
    const row = this.registry.database
      .prepare(
        `SELECT ${MEMBER_COLUMNS}
           FROM workspace_members
          WHERE workspace_id = ? AND id = ?`,
      )
      .get(this.workspaceId, id) as SqliteMemberRow | undefined;
    return row ? assembleSqliteMember(row) : null;
  }

  override async size(): Promise<number> {
    const row = this.registry.database
      .prepare(
        `SELECT COUNT(*) AS total
           FROM workspace_members
          WHERE workspace_id = ?`,
      )
      .get(this.workspaceId) as { total: number };
    return Number(row.total);
  }

  async addMember(desc: MemberDescription): Promise<Member> {
    const workspaceId = desc.workspace.id();
    if (workspaceId !== this.workspaceId) {
      throw DomainError.validation(
        `member workspace ${workspaceId} does not match scoped workspace ${this.workspaceId}`,
      );
    }

    const userId = desc.user.id();
    this.assertUserAndWorkspaceExist(userId);
    const timestamp = new Date().toISOString();
    const id = randomUUID();

    try {
      this.registry.database
        .prepare(
          `INSERT INTO workspace_members
            (id, workspace_id, user_id, role, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          this.workspaceId,
          userId,
          defaultIfBlank(desc.role, 'member'),
          timestamp,
          timestamp,
        );
    } catch (error) {
      if (isUniqueConflict(error)) {
        throw DomainError.conflict(
          `user ${userId} is already a workspace member`,
        );
      }
      throw error;
    }

    const member = await this.findByIdentity(id);
    if (!member) {
      throw DomainError.internal(`workspace member ${id} was not persisted`);
    }
    return member;
  }

  async removeMember(userId: string): Promise<void> {
    const result = this.registry.database
      .prepare(
        'DELETE FROM workspace_members WHERE workspace_id = ? AND user_id = ?',
      )
      .run(this.workspaceId, userId);
    if (Number(result.changes) === 0) {
      throw DomainError.notFound(`workspace member ${userId} not found`);
    }
  }

  private assertUserAndWorkspaceExist(userId: string): void {
    const user = this.registry.database
      .prepare('SELECT id FROM users WHERE id = ?')
      .get(userId);
    if (!user) {
      throw DomainError.notFound(`user ${userId} not found`);
    }

    const workspace = this.registry.database
      .prepare(
        'SELECT id FROM workspaces WHERE id = ? AND deleted_at IS NULL',
      )
      .get(this.workspaceId);
    if (!workspace) {
      throw DomainError.notFound(`workspace ${this.workspaceId} not found`);
    }
  }
}

function defaultIfBlank(value: string, defaultValue: string): string {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : defaultValue;
}

function isUniqueConflict(error: unknown): boolean {
  return (
    error instanceof Error &&
    /UNIQUE constraint failed: workspace_members\.workspace_id, workspace_members\.user_id/.test(
      error.message,
    )
  );
}
