import { randomUUID } from 'node:crypto';
import {
  DomainError,
  HasMany,
  Member,
  MemberDescription,
  WorkspaceMembers,
} from '@evidence/server-nest-domain';
import { assembleMember } from './mappers';
import type { PrismaStore } from './types';
import { defaultIfBlank, isUniqueConflict, now } from './utils';

export class PrismaWorkspaceMembers
  implements WorkspaceMembers, HasMany<Member>
{
  constructor(
    private readonly store: PrismaStore,
    private readonly workspaceId: string,
  ) {}

  async findAll(from: number, to: number): Promise<Member[]> {
    const rows = await this.store.workspaceMember.findMany({
      where: { workspaceId: this.workspaceId },
      orderBy: { createdAt: 'asc' },
      skip: from,
      take: Math.max(to - from, 0),
    });
    return rows.map(assembleMember);
  }

  async findByIdentity(id: string): Promise<Member | null> {
    const row = await this.store.workspaceMember.findFirst({
      where: { id, workspaceId: this.workspaceId },
    });
    return row ? assembleMember(row) : null;
  }

  async size(): Promise<number> {
    return this.store.workspaceMember.count({
      where: { workspaceId: this.workspaceId },
    });
  }

  async addMember(desc: MemberDescription): Promise<Member> {
    const workspaceId = desc.workspace.id();
    if (workspaceId !== this.workspaceId) {
      throw DomainError.validation(
        `member workspace ${workspaceId} does not match scoped workspace ${this.workspaceId}`,
      );
    }

    const userId = desc.user.id();
    const [user, workspace] = await Promise.all([
      this.store.user.findUnique({ where: { id: userId } }),
      this.store.workspace.findFirst({
        where: { id: this.workspaceId, deletedAt: null },
      }),
    ]);
    if (!user) {
      throw DomainError.notFound(`user ${userId} not found`);
    }
    if (!workspace) {
      throw DomainError.notFound(`workspace ${this.workspaceId} not found`);
    }

    const timestamp = now();
    try {
      const row = await this.store.workspaceMember.create({
        data: {
          id: randomUUID(),
          workspaceId: this.workspaceId,
          userId,
          role: defaultIfBlank(desc.role, 'member'),
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      });
      return assembleMember(row);
    } catch (error) {
      if (isUniqueConflict(error)) {
        throw DomainError.conflict(
          `user ${userId} is already a workspace member`,
        );
      }
      throw error;
    }
  }

  async removeMember(userId: string): Promise<void> {
    const row = await this.store.workspaceMember.findFirst({
      where: { workspaceId: this.workspaceId, userId },
    });
    if (!row) {
      throw DomainError.notFound(`workspace member ${userId} not found`);
    }
    await this.store.workspaceMember.delete({ where: { id: row.id } });
  }
}
