import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PrismaUserWorkspaces } from './user-workspaces';
import {
  asStore,
  memberRow,
  mockPrismaStore,
  workspaceDescription,
  workspaceRow,
} from './test-support';

const temporaryPaths: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryPaths
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe('PrismaUserWorkspaces', () => {
  it('reads only non-deleted workspaces visible to the scoped user', async () => {
    const store = mockPrismaStore();
    store.workspace.findMany.mockResolvedValue([workspaceRow()]);
    store.workspace.findFirst.mockResolvedValue(workspaceRow());
    store.workspace.count.mockResolvedValue(1);
    const workspaces = new PrismaUserWorkspaces(asStore(store), 'user-1');

    await expect(
      workspaces.findAll().subCollection(0, 10).toArray(),
    ).resolves.toHaveLength(1);
    await expect(
      workspaces.findByIdentity('workspace-1'),
    ).resolves.toMatchObject({ identity: expect.any(Function) });
    await expect(workspaces.findAll().size()).resolves.toBe(1);

    expect(store.workspace.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          members: { some: { userId: 'user-1' } },
        },
        skip: 0,
        take: 10,
      }),
    );
    expect(store.workspace.findFirst).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        members: { some: { userId: 'user-1' } },
        id: 'workspace-1',
      },
    });
  });

  it('creates a workspace and owner member in one transaction', async () => {
    const repositoryRoot = await temporaryDirectory();
    const store = mockPrismaStore();
    store.workspace.create.mockResolvedValue(
      workspaceRow({ id: 'created-workspace' }),
    );
    store.workspaceMember.create.mockResolvedValue(memberRow());
    const workspaces = new PrismaUserWorkspaces(asStore(store), 'user-1');

    const workspace = await workspaces.create(
      workspaceDescription({
        title: '  Created Workspace  ',
        metadata: { path: repositoryRoot },
      }),
    );

    expect(workspace.identity()).toBe('created-workspace');
    expect(store.$transaction).toHaveBeenCalledOnce();
    const workspaceCreate = store.workspace.create.mock.calls[0]?.[0];
    expect(workspaceCreate).toMatchObject({
      data: expect.objectContaining({
        id: expect.any(String),
        title: 'Created Workspace',
        status: 'active',
        metadata: {
          path: repositoryRoot,
          repositoryRoot,
          evidenceRoot: join(repositoryRoot, '.evidence'),
        },
      }),
    });
    expect(store.workspaceMember.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: workspaceCreate.data.id,
        userId: 'user-1',
        role: 'owner',
      }),
    });
  });

  it('preserves normalized workspace paths when update metadata is omitted', async () => {
    const repositoryRoot = await temporaryDirectory();
    const metadata = {
      repositoryRoot,
      evidenceRoot: join(repositoryRoot, '.evidence'),
    };
    const store = mockPrismaStore();
    store.workspace.findFirst.mockResolvedValue(workspaceRow({ metadata }));
    store.workspace.update.mockResolvedValue(workspaceRow({ metadata }));
    const workspaces = new PrismaUserWorkspaces(asStore(store), 'user-1');

    await workspaces.update(
      'workspace-1',
      workspaceDescription({ metadata: {} }),
    );

    expect(store.workspace.update).toHaveBeenCalledWith({
      where: { id: 'workspace-1' },
      data: expect.objectContaining({ metadata }),
    });
  });

  it('soft deletes existing workspaces', async () => {
    const store = mockPrismaStore();
    store.workspace.findFirst.mockResolvedValue(workspaceRow());
    store.workspace.update.mockResolvedValue(workspaceRow());
    const workspaces = new PrismaUserWorkspaces(asStore(store), 'user-1');

    await expect(workspaces.delete('workspace-1')).resolves.toBeUndefined();

    expect(store.workspace.update).toHaveBeenCalledWith({
      where: { id: 'workspace-1' },
      data: {
        deletedAt: expect.any(Date),
        updatedAt: expect.any(Date),
      },
    });
  });
});

async function temporaryDirectory(): Promise<string> {
  const path = await realpath(
    await mkdtemp(join(tmpdir(), 'evidence-workspace-')),
  );
  temporaryPaths.push(path);
  return path;
}
