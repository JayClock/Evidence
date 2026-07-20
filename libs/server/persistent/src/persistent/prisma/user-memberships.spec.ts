import { describe, expect, it } from 'vitest';
import { PrismaUserMemberships } from './user-memberships';
import {
  asStore,
  memberRow,
  mockPrismaStore,
  workspaceRow,
} from './test-support';

describe('PrismaUserMemberships', () => {
  it('returns memberships with their non-deleted workspace projection', async () => {
    const store = mockPrismaStore();
    store.workspaceMember.findMany.mockResolvedValue([
      { ...memberRow(), workspace: workspaceRow() },
    ]);
    store.workspaceMember.count.mockResolvedValue(1);
    const memberships = new PrismaUserMemberships(asStore(store), 'user-1');

    const [items, total] = await memberships.list(1, 20);

    expect(total).toBe(1);
    expect(items[0]?.member.identity()).toBe('member-1');
    expect(items[0]?.workspace.identity()).toBe('workspace-1');
    expect(store.workspaceMember.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        workspace: { deletedAt: null },
      },
      include: { workspace: true },
      orderBy: { createdAt: 'asc' },
      skip: 0,
      take: 20,
    });
  });

  it('finds one membership by workspace identity', async () => {
    const store = mockPrismaStore();
    store.workspaceMember.findFirst.mockResolvedValue({
      ...memberRow(),
      workspace: workspaceRow(),
    });
    const memberships = new PrismaUserMemberships(asStore(store), 'user-1');

    await expect(
      memberships.findByWorkspaceIdentity('workspace-1'),
    ).resolves.toMatchObject({
      member: { identity: expect.any(Function) },
      workspace: { identity: expect.any(Function) },
    });
    expect(store.workspaceMember.findFirst).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        workspace: { deletedAt: null },
        workspaceId: 'workspace-1',
      },
      include: { workspace: true },
    });
  });
});
