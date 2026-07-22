import { mkdtemp, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  evidenceRootFromMetadata,
  initializeWorkspaceModelRoot,
  normalizeWorkspaceMetadata,
  publicWorkspaceMetadata,
  workspaceTitleFromMetadata,
} from './workspace-paths';

const temporaryPaths: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryPaths
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe('workspace paths', () => {
  it('canonicalizes a selected repository and initializes Evidence directories', async () => {
    const repositoryRoot = await temporaryDirectory();

    const metadata = await normalizeWorkspaceMetadata({
      path: repositoryRoot,
      purpose: 'modeling',
    });

    const evidenceRoot = join(repositoryRoot, '.evidence');
    expect(metadata).toMatchObject({
      purpose: 'modeling',
      repositoryRoot,
      evidenceRoot,
    });
    await expect(directory(join(evidenceRoot, 'entities'))).resolves.toBe(true);
    await expect(directory(join(evidenceRoot, 'associations'))).resolves.toBe(
      true,
    );
    expect(workspaceTitleFromMetadata(metadata)).toBe(basename(repositoryRoot));
    expect(evidenceRootFromMetadata(metadata)).toBe(evidenceRoot);
  });

  it('uses the configured default root when metadata has no path', async () => {
    const repositoryRoot = await temporaryDirectory();

    const metadata = await normalizeWorkspaceMetadata({}, repositoryRoot);

    expect(metadata.repositoryRoot).toBe(repositoryRoot);
    expect(metadata.evidenceRoot).toBe(join(repositoryRoot, '.evidence'));
  });

  it('allocates one private model root per workspace', async () => {
    const storageRoot = await temporaryDirectory();

    const modelRoot = await initializeWorkspaceModelRoot(
      'workspace-1',
      storageRoot,
    );

    expect(modelRoot).toBe(join(storageRoot, 'workspace-1', '.evidence'));
    await expect(directory(join(modelRoot, 'entities'))).resolves.toBe(true);
    await expect(directory(join(modelRoot, 'associations'))).resolves.toBe(
      true,
    );
  });

  it('removes private filesystem keys from public metadata', () => {
    expect(
      publicWorkspaceMetadata({
        purpose: 'modeling',
        path: '/client/repository',
        rootPath: '/legacy/repository',
        repositoryRoot: '/server/repository',
        evidenceRoot: '/server/repository/.evidence',
      }),
    ).toEqual({ purpose: 'modeling' });
  });

  it('rejects inaccessible paths and regular files', async () => {
    const repositoryRoot = await temporaryDirectory();
    const file = join(repositoryRoot, 'model.yaml');
    await writeFile(file, 'id: model\n');

    await expect(
      normalizeWorkspaceMetadata({ path: join(repositoryRoot, 'missing') }),
    ).rejects.toMatchObject({ kind: 'validation' });
    await expect(
      normalizeWorkspaceMetadata({ path: file }),
    ).rejects.toMatchObject({ kind: 'validation' });
  });
});

async function temporaryDirectory(): Promise<string> {
  const path = await realpath(
    await mkdtemp(join(tmpdir(), 'evidence-workspace-')),
  );
  temporaryPaths.push(path);
  return path;
}

async function directory(path: string): Promise<boolean> {
  return (await stat(path)).isDirectory();
}
