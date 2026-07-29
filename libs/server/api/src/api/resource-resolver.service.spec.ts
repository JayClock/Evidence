import { describe, expect, it, vi } from 'vitest';
import { CurrentPrincipal } from './current-principal';
import type {
  User,
  UserMemberships,
  Users,
  Workspace,
  Workspaces,
} from '@evidence/server-domain';
import { ResourceResolver } from './resource-resolver.service';

function fixture() {
  const currentUser = { identity: () => 'desktop-user' } as User;
  const workspace = { identity: () => 'workspace-1' } as Workspace;
  const memberships = {
    findByWorkspaceIdentity: vi.fn(async (workspaceId: string) =>
      workspaceId === 'workspace-1' ? { member: {} as never, workspace } : null,
    ),
  } as unknown as UserMemberships;
  const workspaces = {
    update: vi.fn(async () => workspace),
    delete: vi.fn(async () => undefined),
  } as unknown as Workspaces;
  const users = {
    findByIdentity: vi.fn(async (userId: string) =>
      userId === 'desktop-user' ? currentUser : null,
    ),
    memberships: vi.fn(() => memberships),
    workspaces: vi.fn(() => workspaces),
  } as unknown as Users;
  const principal = new CurrentPrincipal();
  principal.establish({ userId: 'desktop-user', authentication: 'local' });
  return {
    currentUser,
    memberships,
    resolver: new ResourceResolver(users, principal),
    users,
    workspace,
    workspaces,
  };
}

describe('ResourceResolver access boundary', () => {
  it('only resolves the configured current user', async () => {
    const { resolver, users } = fixture();

    await expect(resolver.requireUser('desktop-user')).resolves.toBeDefined();
    await expect(resolver.requireUser('other-user')).rejects.toMatchObject({
      kind: 'notFound',
    });
    expect(users.findByIdentity).toHaveBeenCalledTimes(1);
  });

  it('resolves Workspaces through current-user membership', async () => {
    const { memberships, resolver, users, workspace } = fixture();

    await expect(resolver.requireWorkspace('workspace-1')).resolves.toBe(
      workspace,
    );
    expect(users.memberships).toHaveBeenCalledWith('desktop-user');
    expect(memberships.findByWorkspaceIdentity).toHaveBeenCalledWith(
      'workspace-1',
    );
  });

  it('hides Workspaces outside the current-user boundary', async () => {
    const { resolver, workspaces } = fixture();

    await expect(
      resolver.requireWorkspace('workspace-2'),
    ).rejects.toMatchObject({ kind: 'notFound' });
    await expect(resolver.deleteWorkspace('workspace-2')).rejects.toMatchObject(
      { kind: 'notFound' },
    );
    expect(workspaces.delete).not.toHaveBeenCalled();
  });
});
