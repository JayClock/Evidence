import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { WorkspaceBindingStore } from './workspace-binding-store';

const temporaryPaths: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryPaths
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe('WorkspaceBindingStore', () => {
  it('persists a canonical local repository per API and Workspace', async () => {
    const root = await temporaryDirectory();
    const repository = join(root, 'repository');
    await mkdir(repository);
    const storePath = join(root, 'state', 'workspace-bindings.json');
    const store = new WorkspaceBindingStore(storePath);

    const binding = await store.bind({
      apiBaseUrl: 'https://api.example.com/api/',
      workspaceId: 'workspace-1',
      repositoryRoot: repository,
    });

    expect(binding).toMatchObject({
      apiBaseUrl: 'https://api.example.com/api',
      workspaceId: 'workspace-1',
      repositoryRoot: await realpath(repository),
    });
    await expect(
      new WorkspaceBindingStore(storePath).find(
        'https://api.example.com/api',
        'workspace-1',
      ),
    ).resolves.toEqual(binding);
  });

  it('serializes concurrent bindings without dropping either Workspace', async () => {
    const root = await temporaryDirectory();
    const first = join(root, 'first');
    const second = join(root, 'second');
    await Promise.all([mkdir(first), mkdir(second)]);
    const store = new WorkspaceBindingStore(join(root, 'bindings.json'));

    await Promise.all([
      store.bind({
        apiBaseUrl: 'https://api.example.com/api',
        workspaceId: 'workspace-1',
        repositoryRoot: first,
      }),
      store.bind({
        apiBaseUrl: 'https://api.example.com/api',
        workspaceId: 'workspace-2',
        repositoryRoot: second,
      }),
    ]);

    await expect(
      store.find('https://api.example.com/api', 'workspace-1'),
    ).resolves.toMatchObject({ repositoryRoot: await realpath(first) });
    await expect(
      store.find('https://api.example.com/api', 'workspace-2'),
    ).resolves.toMatchObject({ repositoryRoot: await realpath(second) });
  });

  it('rejects inaccessible repositories and malformed stores', async () => {
    const root = await temporaryDirectory();
    const storePath = join(root, 'bindings.json');
    const store = new WorkspaceBindingStore(storePath);

    await expect(
      store.bind({
        apiBaseUrl: 'https://api.example.com/api',
        workspaceId: 'workspace-1',
        repositoryRoot: join(root, 'missing'),
      }),
    ).rejects.toThrow('not accessible');

    await writeFile(storePath, '{not-json}\n');
    await expect(
      store.find('https://api.example.com/api', 'workspace-1'),
    ).rejects.toThrow('invalid JSON');
  });
});

async function temporaryDirectory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'evidence-bindings-'));
  temporaryPaths.push(path);
  return path;
}
