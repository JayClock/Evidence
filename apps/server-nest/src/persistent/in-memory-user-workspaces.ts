import { randomUUID } from 'node:crypto';
import {
  HasMany,
  DomainError,
  UserWorkspaces,
  Workspace,
  WorkspaceDescription,
} from '../domain';
import { InMemoryWorkspaceDiagrams } from './in-memory-workspace-diagrams';
import { InMemoryWorkspaceLogicalEntities } from './in-memory-workspace-logical-entities';
import { InMemoryWorkspaceLogicalRelationships } from './in-memory-workspace-logical-relationships';
import { InMemoryWorkspaceMembers } from './in-memory-workspace-members';
import {
  defaultIfBlank,
  InMemoryStore,
  MemberRecord,
  now,
  WorkspaceRecord,
} from './records';

export class InMemoryUserWorkspaces
  implements UserWorkspaces, HasMany<Workspace>
{
  constructor(
    private readonly store: InMemoryStore,
    private readonly userId: string | null,
  ) {}

  async findAll(from: number, to: number): Promise<Workspace[]> {
    const rows = this.visibleWorkspaces()
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(from, to);
    return rows.map((record) => this.assemble(record));
  }

  async findByIdentity(id: string): Promise<Workspace | null> {
    const record = this.visibleWorkspaces().find(
      (workspace) => workspace.id === id,
    );
    return record ? this.assemble(record) : null;
  }

  async size(): Promise<number> {
    return this.visibleWorkspaces().length;
  }

  async list(
    page: number,
    pageSize: number,
    query: string | null,
  ): Promise<[Workspace[], number]> {
    if (page === 0 || pageSize === 0) {
      throw DomainError.validation('page and pageSize must be greater than 0');
    }

    const normalizedQuery = query?.trim().toLocaleLowerCase() ?? '';
    const visible = this.visibleWorkspaces().filter((workspace) => {
      if (normalizedQuery.length === 0) {
        return true;
      }
      return (
        workspace.title.toLocaleLowerCase().includes(normalizedQuery) ||
        (workspace.description ?? '')
          .toLocaleLowerCase()
          .includes(normalizedQuery)
      );
    });
    const total = visible.length;
    const offset = (page - 1) * pageSize;
    const workspaces = visible
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(offset, offset + pageSize)
      .map((record) => this.assemble(record));

    return [workspaces, total];
  }

  async create(desc: WorkspaceDescription): Promise<Workspace> {
    const id = randomUUID();
    const timestamp = now();
    const record: WorkspaceRecord = {
      id,
      title: normalizeTitle(desc.title),
      description: desc.description,
      status: defaultIfBlank(desc.status, 'active'),
      metadata: desc.metadata,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
    };
    this.store.workspaces.set(id, record);

    if (this.userId) {
      const member: MemberRecord = {
        id: randomUUID(),
        workspaceId: id,
        userId: this.userId,
        role: 'owner',
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      this.store.members.set(member.id, member);
    }

    return this.assemble(record);
  }

  async update(id: string, desc: WorkspaceDescription): Promise<Workspace> {
    const record = this.visibleWorkspaces().find(
      (workspace) => workspace.id === id,
    );
    if (!record) {
      throw DomainError.notFound(`workspace ${id} not found`);
    }

    const updated: WorkspaceRecord = {
      ...record,
      title: normalizeTitle(desc.title),
      description: desc.description,
      status: defaultIfBlank(desc.status, 'active'),
      metadata: desc.metadata,
      updatedAt: now(),
    };
    this.store.workspaces.set(id, updated);
    return this.assemble(updated);
  }

  async delete(id: string): Promise<void> {
    const record = this.visibleWorkspaces().find(
      (workspace) => workspace.id === id,
    );
    if (!record) {
      throw DomainError.notFound(`workspace ${id} not found`);
    }

    this.store.workspaces.set(id, {
      ...record,
      deletedAt: now(),
      updatedAt: now(),
    });
  }

  private visibleWorkspaces(): WorkspaceRecord[] {
    const liveWorkspaces = [...this.store.workspaces.values()].filter(
      (workspace) => workspace.deletedAt === null,
    );
    if (!this.userId) {
      return liveWorkspaces;
    }

    const visibleIds = new Set(
      [...this.store.members.values()]
        .filter((member) => member.userId === this.userId)
        .map((member) => member.workspaceId),
    );
    return liveWorkspaces.filter((workspace) => visibleIds.has(workspace.id));
  }

  private assemble(record: WorkspaceRecord): Workspace {
    return new Workspace(
      record.id,
      {
        title: record.title,
        description: record.description,
        status: record.status,
        metadata: { ...record.metadata },
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      },
      new InMemoryWorkspaceMembers(this.store, record.id),
      new InMemoryWorkspaceDiagrams(this.store, record.id),
      new InMemoryWorkspaceLogicalEntities(this.store, record.id),
      new InMemoryWorkspaceLogicalRelationships(this.store, record.id),
    );
  }
}

function normalizeTitle(title: string): string {
  const normalized = title.trim();
  if (normalized.length === 0) {
    throw DomainError.validation('workspace title must not be empty');
  }
  return normalized;
}
