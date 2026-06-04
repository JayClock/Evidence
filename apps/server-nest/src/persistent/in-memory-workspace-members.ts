import { randomUUID } from 'node:crypto';
import {
  HasMany,
  Member,
  MemberDescription,
  Ref,
  ServerError,
  WorkspaceMembers,
} from '../domain';
import { defaultIfBlank, InMemoryStore, MemberRecord, now } from './records';

export class InMemoryWorkspaceMembers
  implements WorkspaceMembers, HasMany<Member>
{
  constructor(
    private readonly store: InMemoryStore,
    private readonly workspaceId: string,
  ) {}

  async findAll(from: number, to: number): Promise<Member[]> {
    const rows = this.visibleMembers()
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .slice(from, to);
    return rows.map((record) => this.assemble(record));
  }

  async findByIdentity(id: string): Promise<Member | null> {
    const record = this.store.members.get(id);
    if (!record || record.workspaceId !== this.workspaceId) {
      return null;
    }
    return this.assemble(record);
  }

  async size(): Promise<number> {
    return this.visibleMembers().length;
  }

  async addMember(desc: MemberDescription): Promise<Member> {
    const workspaceId = desc.workspace.id();
    if (workspaceId !== this.workspaceId) {
      throw ServerError.validation(
        `member workspace ${workspaceId} does not match scoped workspace ${this.workspaceId}`,
      );
    }

    const userId = desc.user.id();
    if (!this.store.users.has(userId)) {
      throw ServerError.notFound(`user ${userId} not found`);
    }

    const workspace = this.store.workspaces.get(this.workspaceId);
    if (!workspace || workspace.deletedAt !== null) {
      throw ServerError.notFound(`workspace ${this.workspaceId} not found`);
    }

    const alreadyMember = this.visibleMembers().some(
      (member) => member.userId === userId,
    );
    if (alreadyMember) {
      throw ServerError.conflict(
        `user ${userId} is already a workspace member`,
      );
    }

    const timestamp = now();
    const record: MemberRecord = {
      id: randomUUID(),
      workspaceId: this.workspaceId,
      userId,
      role: defaultIfBlank(desc.role, 'member'),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.store.members.set(record.id, record);
    return this.assemble(record);
  }

  async removeMember(userId: string): Promise<void> {
    const member = this.visibleMembers().find((row) => row.userId === userId);
    if (!member) {
      throw ServerError.notFound(`workspace member ${userId} not found`);
    }
    this.store.members.delete(member.id);
  }

  private visibleMembers(): MemberRecord[] {
    return [...this.store.members.values()].filter(
      (record) => record.workspaceId === this.workspaceId,
    );
  }

  private assemble(record: MemberRecord): Member {
    return new Member(record.id, {
      workspace: new Ref(record.workspaceId),
      user: new Ref(record.userId),
      role: record.role,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }
}
