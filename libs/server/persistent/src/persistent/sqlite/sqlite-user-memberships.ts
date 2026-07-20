import {
  DomainError,
  MembershipView,
  UserMemberships,
} from '@evidence/server-domain';
import {
  assembleSqliteMember,
  assembleSqliteWorkspace,
  type SqliteMemberRow,
  type SqliteWorkspaceRow,
} from './sqlite-mappers';
import { SqliteRegistry } from './sqlite-registry';

interface SqliteMembershipRow {
  memberId: string;
  memberWorkspaceId: string;
  memberUserId: string;
  memberRole: string;
  memberCreatedAt: string;
  memberUpdatedAt: string;
  workspaceId: string;
  workspaceTitle: string;
  workspaceDescription: string | null;
  workspaceStatus: string;
  workspaceMetadata: string;
  workspaceCreatedAt: string;
  workspaceUpdatedAt: string;
}

const MEMBERSHIP_COLUMNS = `
  wm.id AS memberId,
  wm.workspace_id AS memberWorkspaceId,
  wm.user_id AS memberUserId,
  wm.role AS memberRole,
  wm.created_at AS memberCreatedAt,
  wm.updated_at AS memberUpdatedAt,
  w.id AS workspaceId,
  w.title AS workspaceTitle,
  w.description AS workspaceDescription,
  w.status AS workspaceStatus,
  w.metadata AS workspaceMetadata,
  w.created_at AS workspaceCreatedAt,
  w.updated_at AS workspaceUpdatedAt
`;

export class SqliteUserMemberships implements UserMemberships {
  constructor(
    private readonly registry: SqliteRegistry,
    private readonly userId: string,
  ) {}

  async list(
    page: number,
    pageSize: number,
  ): Promise<[MembershipView[], number]> {
    rejectInvalidPage(page, pageSize);
    const rows = this.registry.database
      .prepare(
        `SELECT ${MEMBERSHIP_COLUMNS}
           FROM workspace_members wm
           JOIN workspaces w ON w.id = wm.workspace_id
          WHERE wm.user_id = ? AND w.deleted_at IS NULL
          ORDER BY wm.created_at ASC
          LIMIT ? OFFSET ?`,
      )
      .all(
        this.userId,
        pageSize,
        (page - 1) * pageSize,
      ) as SqliteMembershipRow[];
    const total = this.registry.database
      .prepare(
        `SELECT COUNT(*) AS total
           FROM workspace_members wm
           JOIN workspaces w ON w.id = wm.workspace_id
          WHERE wm.user_id = ? AND w.deleted_at IS NULL`,
      )
      .get(this.userId) as { total: number };

    return [rows.map((row) => this.toMembership(row)), Number(total.total)];
  }

  async findByWorkspaceIdentity(
    workspaceId: string,
  ): Promise<MembershipView | null> {
    const row = this.registry.database
      .prepare(
        `SELECT ${MEMBERSHIP_COLUMNS}
           FROM workspace_members wm
           JOIN workspaces w ON w.id = wm.workspace_id
          WHERE wm.user_id = ?
            AND wm.workspace_id = ?
            AND w.deleted_at IS NULL`,
      )
      .get(this.userId, workspaceId) as SqliteMembershipRow | undefined;
    return row ? this.toMembership(row) : null;
  }

  private toMembership(row: SqliteMembershipRow): MembershipView {
    const memberRow: SqliteMemberRow = {
      id: row.memberId,
      workspaceId: row.memberWorkspaceId,
      userId: row.memberUserId,
      role: row.memberRole,
      createdAt: row.memberCreatedAt,
      updatedAt: row.memberUpdatedAt,
    };
    const workspaceRow: SqliteWorkspaceRow = {
      id: row.workspaceId,
      title: row.workspaceTitle,
      description: row.workspaceDescription,
      status: row.workspaceStatus,
      metadata: row.workspaceMetadata,
      createdAt: row.workspaceCreatedAt,
      updatedAt: row.workspaceUpdatedAt,
    };
    return {
      member: assembleSqliteMember(memberRow),
      workspace: assembleSqliteWorkspace(this.registry, workspaceRow),
    };
  }
}

function rejectInvalidPage(page: number, pageSize: number): void {
  if (page <= 0 || pageSize <= 0) {
    throw DomainError.validation('page and pageSize must be greater than 0');
  }
}
