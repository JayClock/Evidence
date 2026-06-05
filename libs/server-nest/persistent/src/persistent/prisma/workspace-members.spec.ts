import { describe, expect, it } from 'vitest';
import { PrismaWorkspaceMembers } from './workspace-members';
import {
  asStore,
  memberDescription,
  memberRow,
  mockPrismaStore,
  userRow,
  workspaceRow,
} from './test-support';

describe('PrismaWorkspaceMembers', () => {
  it('reads members only from the scoped workspace', async () => {
    const store = mockPrismaStore();
    store.workspaceMember.findMany.mockResolvedValue([memberRow()]);
    store.workspaceMember.findFirst.mockResolvedValue(memberRow());
    store.workspaceMember.count.mockResolvedValue(1);
    const members = new PrismaWorkspaceMembers(asStore(store), 'workspace-1');

    await expect(members.findAll(0, 10)).resolves.toHaveLength(1);
    await expect(members.findByIdentity('member-1')).resolves.toMatchObject({
      identity: expect.any(Function),
    });
    await expect(members.size()).resolves.toBe(1);

    expect(store.workspaceMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: 'workspace-1' },
        skip: 0,
        take: 10,
      }),
    );
    expect(store.workspaceMember.findFirst).toHaveBeenCalledWith({
      where: { id: 'member-1', workspaceId: 'workspace-1' },
    });
  });

  it('adds a member after validating user and workspace existence', async () => {
    const store = mockPrismaStore();
    store.user.findUnique.mockResolvedValue(userRow());
    store.workspace.findFirst.mockResolvedValue(workspaceRow());
    store.workspaceMember.create.mockResolvedValue(
      memberRow({ id: 'member-2', role: 'member' }),
    );
    const members = new PrismaWorkspaceMembers(asStore(store), 'workspace-1');

    const member = await members.addMember(memberDescription({ role: '  ' }));

    expect(member.identity()).toBe('member-2');
    expect(member.description().role).toBe('member');
    expect(store.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
    });
    expect(store.workspace.findFirst).toHaveBeenCalledWith({
      where: { id: 'workspace-1', deletedAt: null },
    });
    expect(store.workspaceMember.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: 'workspace-1',
        userId: 'user-1',
        role: 'member',
      }),
    });
  });

  it('maps duplicate membership writes to a domain conflict', async () => {
    const store = mockPrismaStore();
    store.user.findUnique.mockResolvedValue(userRow());
    store.workspace.findFirst.mockResolvedValue(workspaceRow());
    store.workspaceMember.create.mockRejectedValue({ code: 'P2002' });
    const members = new PrismaWorkspaceMembers(asStore(store), 'workspace-1');

    await expect(members.addMember(memberDescription())).rejects.toMatchObject({
      kind: 'conflict',
    });
  });

  it('removes a member by user id within the scoped workspace', async () => {
    const store = mockPrismaStore();
    store.workspaceMember.findFirst.mockResolvedValue(
      memberRow({ id: 'member-1' }),
    );
    store.workspaceMember.delete.mockResolvedValue(memberRow());
    const members = new PrismaWorkspaceMembers(asStore(store), 'workspace-1');

    await expect(members.removeMember('user-1')).resolves.toBeUndefined();

    expect(store.workspaceMember.findFirst).toHaveBeenCalledWith({
      where: { workspaceId: 'workspace-1', userId: 'user-1' },
    });
    expect(store.workspaceMember.delete).toHaveBeenCalledWith({
      where: { id: 'member-1' },
    });
  });
});
