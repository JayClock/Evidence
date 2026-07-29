import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { CurrentPrincipal } from '@evidence/server-api';
import type {
  Member,
  MembershipView,
  UserMemberships,
  Users,
  Workspace,
} from '@evidence/server-domain';
import { WorkspaceAuthorizationGuard } from './workspace-authorization.guard';

describe('WorkspaceAuthorizationGuard', () => {
  it('does not authorize routes outside a workspace boundary', async () => {
    const { guard } = fixture('viewer');

    await expect(
      guard.canActivate(context('POST', '/api/workspaces')),
    ).resolves.toBe(true);
  });

  it.each([
    ['viewer', 'GET', '/api/workspaces/workspace-1/inbox-items', true],
    ['viewer', 'POST', '/api/workspaces/workspace-1/inbox-items', false],
    ['member', 'POST', '/api/workspaces/workspace-1/inbox-items', true],
    ['member', 'PATCH', '/api/workspaces/workspace-1/members/member-1', false],
    ['owner', 'PATCH', '/api/workspaces/workspace-1/members/member-1', true],
    ['member', 'DELETE', '/api/workspaces/workspace-1', false],
    ['owner', 'DELETE', '/api/workspaces/workspace-1', true],
  ] as const)(
    'allows role=%s to use %s when permitted: %s',
    async (role, method, path, allowed) => {
      const { guard } = fixture(role);
      const result = guard.canActivate(
        context(method, path, { workspaceId: 'workspace-1' }),
      );

      if (allowed) {
        await expect(result).resolves.toBe(true);
      } else {
        await expect(result).rejects.toMatchObject({ kind: 'forbidden' });
      }
    },
  );

  it('hides a workspace when the principal is not a member', async () => {
    const { guard, memberships } = fixture('member');
    memberships.findByWorkspaceIdentity.mockResolvedValue(null);

    await expect(
      guard.canActivate(
        context('GET', '/api/workspaces/workspace-2', {
          workspaceId: 'workspace-2',
        }),
      ),
    ).rejects.toMatchObject({ kind: 'notFound' });
  });
});

function fixture(role: string) {
  const memberships = {
    findByWorkspaceIdentity: vi.fn(
      async (): Promise<MembershipView | null> => ({
        member: {
          description: () => ({ role }),
        } as Member,
        workspace: {} as Workspace,
      }),
    ),
  };
  const users = {
    memberships: vi.fn(() => memberships as unknown as UserMemberships),
  } as unknown as Users;
  const principal = new CurrentPrincipal();
  principal.establish({ userId: 'user-1', authentication: 'oidc' });
  return {
    guard: new WorkspaceAuthorizationGuard(users, principal),
    memberships,
  };
}

function context(
  method: string,
  path: string,
  params: { workspaceId?: string } = {},
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ method, path, params }),
    }),
  } as ExecutionContext;
}
