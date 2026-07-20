import { MembershipView, UserMemberships } from '@evidence/server-domain';
import { assembleMember, assembleWorkspace } from './mappers';
import type { PrismaStore } from './types';
import { rejectInvalidPage } from './utils';

export class PrismaUserMemberships implements UserMemberships {
  constructor(
    private readonly store: PrismaStore,
    private readonly userId: string,
  ) {}

  async list(
    page: number,
    pageSize: number,
  ): Promise<[MembershipView[], number]> {
    rejectInvalidPage(page, pageSize);
    const where = this.visibleWhere();
    const [rows, total] = await Promise.all([
      this.store.workspaceMember.findMany({
        where,
        include: { workspace: true },
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.store.workspaceMember.count({ where }),
    ]);

    return [
      rows.map((row) => ({
        member: assembleMember(row),
        workspace: assembleWorkspace(this.store, row.workspace),
      })),
      total,
    ];
  }

  async findByWorkspaceIdentity(
    workspaceId: string,
  ): Promise<MembershipView | null> {
    const row = await this.store.workspaceMember.findFirst({
      where: { ...this.visibleWhere(), workspaceId },
      include: { workspace: true },
    });
    return row
      ? {
          member: assembleMember(row),
          workspace: assembleWorkspace(this.store, row.workspace),
        }
      : null;
  }

  private visibleWhere() {
    return {
      userId: this.userId,
      workspace: { deletedAt: null },
    };
  }
}
