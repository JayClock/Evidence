import { randomUUID } from 'node:crypto';
import {
  DomainError,
  Member,
  MemberDescription,
  WorkspaceMembers,
} from '@evidence/server-domain';
import { EntityList } from '../database';
import { assembleMember } from './mappers';
import type { PrismaStore } from './types';
import { defaultIfBlank, isUniqueConflict, now } from './utils';

export class PrismaWorkspaceMembers
  extends EntityList<Member>
  implements WorkspaceMembers
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
  ): Promise<Member[]> {
    const rows = await this.store.workspaceMember.findMany({
      where: { workspaceId: this.workspaceId },
      orderBy: { createdAt: 'asc' },
      skip: from,
      take: Math.max(to - from, 0),
    });
    return rows.map(assembleMember);
  }

  protected override async findEntity(id: string): Promise<Member | null> {
    const row = await this.store.workspaceMember.findFirst({
      where: { id, workspaceId: this.workspaceId },
    });
    return row ? assembleMember(row) : null;
  }

  override async size(): Promise<number> {
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

  async updateMember(memberId: string, role: string): Promise<Member> {
    const row = await this.requireMember(memberId);
    const normalizedRole = defaultIfBlank(role, '');
    if (!normalizedRole) {
      throw DomainError.validation('workspace member role must not be empty');
    }
    await this.assertOwnerRemains(row.role, normalizedRole);
    const updated = await this.store.workspaceMember.update({
      where: { id: row.id },
      data: { role: normalizedRole, updatedAt: now() },
    });
    return assembleMember(updated);
  }

  async removeMember(memberId: string): Promise<void> {
    const row = await this.requireMember(memberId);
    await this.assertOwnerRemains(row.role, null);
    await this.store.workspaceMember.delete({ where: { id: row.id } });
  }

  private async requireMember(memberId: string) {
    const row = await this.store.workspaceMember.findFirst({
      where: { id: memberId, workspaceId: this.workspaceId },
    });
    if (!row) {
      throw DomainError.notFound(`workspace member ${memberId} not found`);
    }
    return row;
  }

  private async assertOwnerRemains(
    currentRole: string,
    nextRole: string | null,
  ): Promise<void> {
    if (currentRole !== 'owner' || nextRole === 'owner') {
      return;
    }
    const owners = await this.store.workspaceMember.count({
      where: { workspaceId: this.workspaceId, role: 'owner' },
    });
    if (owners <= 1) {
      throw DomainError.conflict('workspace must retain at least one owner');
    }
  }
}
