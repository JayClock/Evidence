import { Member, Ref, User, Workspace } from '@evidence/server-domain';
import { FileWorkspaceDiagram } from '../filesystem/workspace-diagram';
import { FileWorkspaceLogicalEntities } from '../filesystem/workspace-logical-entities';
import { FileWorkspaceLogicalRelationships } from '../filesystem/workspace-logical-relationships';
import { evidenceRootFromMetadata } from '../workspace-paths';
import { SqliteRegistry } from './sqlite-registry';
import { SqliteWorkspaceMembers } from './sqlite-workspace-members';

export interface SqliteUserRow {
  id: string;
  name: string;
  email: string;
}

export interface SqliteWorkspaceRow {
  id: string;
  title: string;
  description: string | null;
  status: string;
  metadata: string;
  createdAt: string;
  updatedAt: string;
}

export interface SqliteMemberRow {
  id: string;
  workspaceId: string;
  userId: string;
  role: string;
  createdAt: string;
  updatedAt: string;
}

export function assembleSqliteUser(row: SqliteUserRow): User {
  return new User(row.id, { name: row.name, email: row.email });
}

export function assembleSqliteWorkspace(
  registry: SqliteRegistry,
  row: SqliteWorkspaceRow,
): Workspace {
  const metadata = parseMetadata(row.metadata);
  const evidenceRoot = evidenceRootFromMetadata(metadata);
  return new Workspace(
    row.id,
    {
      title: row.title,
      description: row.description,
      status: row.status,
      metadata,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    },
    new SqliteWorkspaceMembers(registry, row.id),
    new FileWorkspaceDiagram(row.id, evidenceRoot),
    new FileWorkspaceLogicalEntities(row.id, evidenceRoot),
    new FileWorkspaceLogicalRelationships(row.id, evidenceRoot),
  );
}

export function assembleSqliteMember(row: SqliteMemberRow): Member {
  return new Member(row.id, {
    workspace: new Ref(row.workspaceId),
    user: new Ref(row.userId),
    role: row.role,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

function parseMetadata(value: string): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    );
  } catch {
    return {};
  }
}
