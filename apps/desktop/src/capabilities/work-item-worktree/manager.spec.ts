import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { changedPathsBetween, IterationWorktreeManager } from './manager';
import { gitHead, runGit } from '../../adapters/git/repository';

const temporaryPaths: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryPaths
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe('IterationWorktreeManager', () => {
  it('creates an isolated branch and worktree at the locked base commit', async () => {
    const root = await temporaryDirectory();
    const repository = await createRepository(root);
    const baseCommitSha = await gitHead(repository);
    const manager = new IterationWorktreeManager(join(root, 'managed'));

    const worktree = await manager.prepare({
      iterationId: 'iteration-1',
      repositoryRoot: repository,
      baseCommitSha,
    });

    expect(worktree).toMatchObject({
      iterationId: 'iteration-1',
      repositoryRoot: repository,
      branchName: 'evidence/iter-iteration-1',
      baseCommitSha,
    });
    expect(await gitHead(worktree.worktreeRoot)).toBe(baseCommitSha);
    expect(
      await runGit(repository, [
        'show-ref',
        '--verify',
        'refs/heads/evidence/iter-iteration-1',
      ]),
    ).toContain(baseCommitSha);

    await writeFile(join(worktree.worktreeRoot, 'tracked.txt'), 'changed\n');
    await writeFile(join(worktree.worktreeRoot, 'new-file.ts'), 'export {};\n');
    const diff = await manager.inspect(worktree);
    expect(diff).toMatchObject({
      sha256: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      changedFileCount: 2,
    });
    expect(diff.content).toContain('new-file.ts');
    expect(await readFile(join(repository, 'tracked.txt'), 'utf8')).toBe(
      'original\n',
    );

    const commitSha = await manager.commit(
      worktree,
      diff.sha256,
      'feat(workspace): implement reviewed story',
    );
    expect(commitSha).not.toBe(baseCommitSha);
    expect(await manager.inspectForReview(worktree, commitSha)).toEqual(diff);
    await expect(
      manager.commit(
        worktree,
        diff.sha256,
        'feat(workspace): implement reviewed story',
      ),
    ).resolves.toBe(commitSha);
    expect(await gitHead(repository)).toBe(baseCommitSha);
  }, 15_000);

  it('locks Showcase observations to one clean approved commit', async () => {
    const root = await temporaryDirectory();
    const repository = await createRepository(root);
    const baseCommitSha = await gitHead(repository);
    const manager = new IterationWorktreeManager(join(root, 'managed'));
    const worktree = await manager.prepare({
      iterationId: 'iteration-showcase',
      repositoryRoot: repository,
      baseCommitSha,
    });
    await writeFile(join(worktree.worktreeRoot, 'tracked.txt'), 'approved\n');
    const diff = await manager.inspect(worktree);
    const approvedCommitSha = await manager.commit(
      worktree,
      diff.sha256,
      'feat(workspace): approve showcase increment',
    );

    await expect(
      manager.snapshotApproved(worktree, approvedCommitSha),
    ).resolves.toMatchObject({
      headSha: approvedCommitSha,
      changedFileCount: 0,
      changedPaths: [],
    });

    await writeFile(join(worktree.worktreeRoot, 'tracked.txt'), 'drifted\n');
    await expect(
      manager.snapshotApproved(worktree, approvedCommitSha),
    ).rejects.toThrow('must remain clean');
  }, 15_000);

  it('prepares locked pnpm dependencies without changing tracked files', async () => {
    const root = await temporaryDirectory();
    const repository = await createPnpmRepository(root);
    const manager = new IterationWorktreeManager(join(root, 'managed'));

    const worktree = await manager.prepare({
      iterationId: 'iteration-dependencies',
      repositoryRoot: repository,
      baseCommitSha: await gitHead(repository),
    });

    expect(
      JSON.parse(
        await readFile(
          join(
            worktree.worktreeRoot,
            'node_modules',
            '@fixture',
            'tool',
            'package.json',
          ),
          'utf8',
        ),
      ),
    ).toMatchObject({ name: '@fixture/tool' });
    expect(
      await runGit(worktree.worktreeRoot, [
        'status',
        '--porcelain=v1',
        '--untracked-files=all',
      ]),
    ).toBe('');
  }, 15_000);

  it('reuses the isolation boundary with a locked Iteration namespace', async () => {
    const root = await temporaryDirectory();
    const repository = await createRepository(root);
    const manager = new IterationWorktreeManager(
      join(root, 'managed-iterations'),
      async () => undefined,
    );

    const worktree = await manager.prepare({
      iterationId: 'iteration-1',
      repositoryRoot: repository,
      baseCommitSha: await gitHead(repository),
    });

    expect(worktree.branchName).toBe('evidence/iter-iteration-1');
    await expect(manager.recover(worktree)).resolves.toEqual(worktree);
  });

  it('snapshots per-action changes and restores an exact binary checkpoint', async () => {
    const root = await temporaryDirectory();
    const repository = await createRepository(root);
    const manager = new IterationWorktreeManager(join(root, 'managed'));
    const worktree = await manager.prepare({
      iterationId: 'iteration-checkpoint',
      repositoryRoot: repository,
      baseCommitSha: await gitHead(repository),
    });

    const clean = await manager.snapshot(worktree);
    await writeFile(join(worktree.worktreeRoot, 'tracked.txt'), 'first\n');
    const first = await manager.snapshot(worktree);
    await writeFile(
      join(worktree.worktreeRoot, 'production.ts'),
      'export const paired = true;\n',
    );
    const second = await manager.snapshot(worktree);

    expect(changedPathsBetween(clean, first)).toEqual(['tracked.txt']);
    expect(changedPathsBetween(first, second)).toEqual(['production.ts']);
    expect(first.worktreeSha256).not.toBe(second.worktreeSha256);

    const restored = await manager.restoreCheckpoint(
      worktree,
      first.content,
      first.sha256,
    );
    expect(restored).toMatchObject({
      sha256: first.sha256,
      changedPaths: ['tracked.txt'],
      pathFingerprints: first.pathFingerprints,
    });
    expect(
      await readFile(join(worktree.worktreeRoot, 'tracked.txt'), 'utf8'),
    ).toBe('first\n');
    await expect(
      readFile(join(worktree.worktreeRoot, 'production.ts')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('removes rejected work and its temporary branch', async () => {
    const root = await temporaryDirectory();
    const repository = await createRepository(root);
    const manager = new IterationWorktreeManager(join(root, 'managed'));
    const worktree = await manager.prepare({
      iterationId: 'iteration-2',
      repositoryRoot: repository,
      baseCommitSha: await gitHead(repository),
    });

    await manager.remove(worktree, { deleteBranch: true });

    await expect(
      readFile(join(worktree.worktreeRoot, 'tracked.txt')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(
      runGit(repository, [
        'show-ref',
        '--verify',
        'refs/heads/evidence/iter-iteration-2',
      ]),
    ).rejects.toBeDefined();
  });

  it('refuses to commit a diff that changed after review', async () => {
    const root = await temporaryDirectory();
    const repository = await createRepository(root);
    const manager = new IterationWorktreeManager(join(root, 'managed'));
    const worktree = await manager.prepare({
      iterationId: 'iteration-stale',
      repositoryRoot: repository,
      baseCommitSha: await gitHead(repository),
    });
    await writeFile(join(worktree.worktreeRoot, 'tracked.txt'), 'reviewed\n');
    const reviewed = await manager.inspect(worktree);
    await writeFile(
      join(worktree.worktreeRoot, 'tracked.txt'),
      'changed again\n',
    );

    await expect(
      manager.commit(
        worktree,
        reviewed.sha256,
        'feat(workspace): implement reviewed story',
      ),
    ).rejects.toThrow('diff changed after review');
  });

  it('rejects unsafe identities and unknown base commits', async () => {
    const root = await temporaryDirectory();
    const repository = await createRepository(root);
    const manager = new IterationWorktreeManager(join(root, 'managed'));

    await expect(
      manager.prepare({
        iterationId: '../outside',
        repositoryRoot: repository,
        baseCommitSha: await gitHead(repository),
      }),
    ).rejects.toThrow('identity is invalid');
    await expect(
      manager.prepare({
        iterationId: 'iteration-3',
        repositoryRoot: repository,
        baseCommitSha: 'f'.repeat(40),
      }),
    ).rejects.toBeDefined();
  });
});

async function createPnpmRepository(root: string): Promise<string> {
  const repository = join(root, 'pnpm-repository');
  await mkdir(join(repository, 'packages', 'tool'), { recursive: true });
  await runGit(repository, ['init', '--initial-branch=main']);
  await runGit(repository, ['config', 'user.name', 'Evidence Test']);
  await runGit(repository, ['config', 'user.email', 'test@evidence.local']);
  await writeFile(join(repository, '.gitignore'), '**/node_modules/\n');
  await writeFile(
    join(repository, 'package.json'),
    JSON.stringify({
      private: true,
      packageManager: 'pnpm@10.14.0',
      dependencies: { '@fixture/tool': 'workspace:*' },
    }),
  );
  await writeFile(
    join(repository, 'pnpm-workspace.yaml'),
    "packages:\n  - 'packages/*'\n",
  );
  await writeFile(
    join(repository, 'pnpm-lock.yaml'),
    `lockfileVersion: '9.0'

settings:
  autoInstallPeers: true
  excludeLinksFromLockfile: false

importers:
  .:
    dependencies:
      '@fixture/tool':
        specifier: workspace:*
        version: link:packages/tool

  packages/tool: {}
`,
  );
  await writeFile(
    join(repository, 'packages', 'tool', 'package.json'),
    JSON.stringify({ name: '@fixture/tool', version: '1.0.0' }),
  );
  await runGit(repository, ['add', '.']);
  await runGit(repository, ['commit', '-m', 'Initial pnpm workspace']);
  return realpath(repository);
}

async function createRepository(root: string): Promise<string> {
  const repository = join(root, 'repository');
  await mkdir(repository);
  await runGit(repository, ['init', '--initial-branch=main']);
  await runGit(repository, ['config', 'user.name', 'Evidence Test']);
  await runGit(repository, ['config', 'user.email', 'test@evidence.local']);
  await writeFile(join(repository, 'tracked.txt'), 'original\n');
  await runGit(repository, ['add', 'tracked.txt']);
  await runGit(repository, ['commit', '-m', 'Initial commit']);
  return realpath(repository);
}

async function temporaryDirectory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'evidence-worktree-'));
  temporaryPaths.push(path);
  return path;
}
