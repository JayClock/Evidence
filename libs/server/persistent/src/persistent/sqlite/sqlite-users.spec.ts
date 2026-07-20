import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Ref } from '@evidence/server-domain';
import { SqliteRegistry } from './sqlite-registry';
import { SqliteUsers } from './sqlite-users';

let testRoot: string;
let registry: SqliteRegistry;
let users: SqliteUsers;

beforeEach(async () => {
  testRoot = await mkdtemp(join(tmpdir(), 'evidence-sqlite-'));
  registry = new SqliteRegistry(join(testRoot, 'registry.sqlite'));
  await registry.open();
  users = new SqliteUsers(registry);
});

afterEach(async () => {
  registry.close();
  await rm(testRoot, { recursive: true, force: true });
});

describe('SQLite workspace registry', () => {
  it('seeds the desktop user and its local workspace membership', async () => {
    const user = await users.findByIdentity('desktop-user');

    expect(user?.description().email).toBe('desktop@evidence.local');
    const [memberships] = await users.memberships('desktop-user').list(1, 20);
    expect(memberships).toHaveLength(1);
    expect(memberships[0]?.workspace.identity()).toBe('default-workspace');
    expect(memberships[0]?.workspace.description().metadata.evidenceRoot).toBe(
      join(await realpath(join(testRoot, 'default-workspace')), '.evidence'),
    );
  });

  it('persists a path-backed workspace and owner membership', async () => {
    const projectRoot = join(testRoot, 'customer-project');
    await mkdir(projectRoot, { recursive: true });
    const workspace = await users.workspaces().create('desktop-user', {
      title: '',
      description: 'Local model',
      status: '',
      metadata: { path: projectRoot },
      createdAt: '',
      updatedAt: '',
    });

    expect(workspace.description().title).toBe('customer-project');
    expect(workspace.description().metadata.repositoryRoot).toBe(
      await realpath(projectRoot),
    );
    const members = await workspace.members().findAll().toArray();
    expect(members).toHaveLength(1);
    expect(members[0].description().role).toBe('owner');

    await expect(
      workspace.addMember({
        workspace: new Ref(workspace.identity()),
        user: new Ref('desktop-user'),
        role: 'member',
        createdAt: '',
        updatedAt: '',
      }),
    ).rejects.toMatchObject({ kind: 'conflict' });
    await expect(
      workspace.removeMember(members[0].identity()),
    ).rejects.toMatchObject({ kind: 'conflict' });
  });

  it('retains workspaces after reopening the registry', async () => {
    const projectRoot = join(testRoot, 'retained-project');
    await mkdir(projectRoot, { recursive: true });
    const workspace = await users.workspaces().create('desktop-user', {
      title: 'Retained',
      description: null,
      status: 'active',
      metadata: { path: projectRoot },
      createdAt: '',
      updatedAt: '',
    });

    registry.close();
    registry = new SqliteRegistry(join(testRoot, 'registry.sqlite'));
    await registry.open();
    users = new SqliteUsers(registry);
    const reopenedMembership = await users
      .memberships('desktop-user')
      .findByWorkspaceIdentity(workspace.identity());

    expect(reopenedMembership).not.toBeNull();
  });
});
