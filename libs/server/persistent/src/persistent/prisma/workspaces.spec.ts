import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PrismaWorkspaces } from './workspaces';
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

describe('PrismaWorkspaces', () => {
  it('reads non-deleted workspaces by canonical identity', async () => {
    const store = mockPrismaStore();
    store.workspace.findMany.mockResolvedValue([workspaceRow()]);
    store.workspace.findFirst.mockResolvedValue(workspaceRow());
    store.workspace.count.mockResolvedValue(1);
    const workspaces = new PrismaWorkspaces(asStore(store));

    await expect(
      workspaces.findAll().subCollection(0, 10).toArray(),
    ).resolves.toHaveLength(1);
    await expect(
      workspaces.findByIdentity('workspace-1'),
    ).resolves.toMatchObject({ identity: expect.any(Function) });

    expect(store.workspace.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deletedAt: null },
        skip: 0,
        take: 10,
      }),
    );
    expect(store.workspace.findFirst).toHaveBeenCalledWith({
      where: { id: 'workspace-1', deletedAt: null },
    });
  });

  it('creates a workspace and owner membership in one transaction', async () => {
    const repositoryRoot = await temporaryDirectory();
    const store = mockPrismaStore();
    store.workspace.create.mockResolvedValue(
      workspaceRow({ id: 'created-workspace' }),
    );
    store.workspaceMember.create.mockResolvedValue(memberRow());
    const workspaces = new PrismaWorkspaces(asStore(store), repositoryRoot);

    const workspace = await workspaces.create(
      'owner-1',
      workspaceDescription({
        title: '  Created Workspace  ',
        metadata: { path: '/desktop/repository', purpose: 'modeling' },
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
        metadata: { purpose: 'modeling' },
        modelRoot: expect.stringMatching(
          new RegExp(`^${repositoryRoot}/.+/\\.evidence$`),
        ),
      }),
    });
    expect(store.workspaceMember.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: workspaceCreate.data.id,
        userId: 'owner-1',
        role: 'owner',
      }),
    });
  });

  it('soft deletes an existing workspace', async () => {
    const store = mockPrismaStore();
    store.workspace.findFirst.mockResolvedValue(workspaceRow());
    store.workspace.update.mockResolvedValue(workspaceRow());
    const workspaces = new PrismaWorkspaces(asStore(store));

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
