import { describe, expect, it, vi } from 'vitest';
import type { HasMany } from '../core';
import type { Workspace, WorkspaceDescription } from '../workspace';
import { User, type UserDescription } from './user';
import type { UserWorkspaces } from './user-workspaces';

const userDescription: UserDescription = {
  name: 'Desktop User',
  email: 'desktop@example.com',
};

const workspaceDescription: WorkspaceDescription = {
  title: 'Default Workspace',
  description: 'Seed workspace',
  status: 'active',
  metadata: { source: 'test' },
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function userWorkspacesFixture() {
  const workspace = {} as Workspace;
  const collection = {
    findAll: vi.fn(async () => [workspace]),
    findByIdentity: vi.fn(async () => workspace),
    size: vi.fn(async () => 1),
    list: vi.fn(async () => [[workspace], 1] as [Workspace[], number]),
    create: vi.fn(async () => workspace),
    update: vi.fn(async () => workspace),
    delete: vi.fn(async () => undefined),
  } satisfies UserWorkspaces;

  return { collection, workspace };
}

describe('User', () => {
  it('returns identity and description', () => {
    const { collection } = userWorkspacesFixture();
    const user = new User('desktop-user', userDescription, collection);

    expect(user.identity()).toBe('desktop-user');
    expect(user.description()).toBe(userDescription);
  });

  it('exposes workspaces as a HasMany collection', async () => {
    const { collection, workspace } = userWorkspacesFixture();
    const user = new User('desktop-user', userDescription, collection);

    const workspaces: HasMany<Workspace> = user.workspaces();

    await expect(workspaces.findAll(0, 10)).resolves.toEqual([workspace]);
    await expect(workspaces.findByIdentity('workspace-1')).resolves.toBe(
      workspace,
    );
    await expect(workspaces.size()).resolves.toBe(1);
    expect(collection.findAll).toHaveBeenCalledWith(0, 10);
    expect(collection.findByIdentity).toHaveBeenCalledWith('workspace-1');
    expect(collection.size).toHaveBeenCalledWith();
  });

  it('delegates workspace commands to the user workspace collection', async () => {
    const { collection, workspace } = userWorkspacesFixture();
    const user = new User('desktop-user', userDescription, collection);

    await expect(user.createWorkspace(workspaceDescription)).resolves.toBe(
      workspace,
    );
    await expect(
      user.updateWorkspace('workspace-1', workspaceDescription),
    ).resolves.toBe(workspace);
    await expect(user.deleteWorkspace('workspace-1')).resolves.toBeUndefined();

    expect(collection.create).toHaveBeenCalledWith(workspaceDescription);
    expect(collection.update).toHaveBeenCalledWith(
      'workspace-1',
      workspaceDescription,
    );
    expect(collection.delete).toHaveBeenCalledWith('workspace-1');
  });

  it('delegates paginated workspace listing to the user workspace collection', async () => {
    const { collection, workspace } = userWorkspacesFixture();
    const user = new User('desktop-user', userDescription, collection);

    await expect(user.listWorkspaces(2, 25, 'default')).resolves.toEqual([
      [workspace],
      1,
    ]);

    expect(collection.list).toHaveBeenCalledWith(2, 25, 'default');
  });
});
