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
import { CodingWorktreeManager } from './coding-worktree';
import { gitHead, runGit } from './git-repository';

const temporaryPaths: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryPaths
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe('CodingWorktreeManager', () => {
  it('creates an isolated branch and worktree at the locked base commit', async () => {
    const root = await temporaryDirectory();
    const repository = await createRepository(root);
    const baseCommitSha = await gitHead(repository);
    const manager = new CodingWorktreeManager(join(root, 'managed'));

    const worktree = await manager.prepare({
      runId: 'run-1',
      repositoryRoot: repository,
      baseCommitSha,
    });

    expect(worktree).toMatchObject({
      runId: 'run-1',
      repositoryRoot: repository,
      branchName: 'evidence/run-run-1',
      baseCommitSha,
    });
    expect(await gitHead(worktree.worktreeRoot)).toBe(baseCommitSha);
    expect(
      await runGit(repository, [
        'show-ref',
        '--verify',
        'refs/heads/evidence/run-run-1',
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
    expect(await gitHead(repository)).toBe(baseCommitSha);
  });

  it('removes rejected work and its temporary branch', async () => {
    const root = await temporaryDirectory();
    const repository = await createRepository(root);
    const manager = new CodingWorktreeManager(join(root, 'managed'));
    const worktree = await manager.prepare({
      runId: 'run-2',
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
        'refs/heads/evidence/run-run-2',
      ]),
    ).rejects.toBeDefined();
  });

  it('refuses to commit a diff that changed after review', async () => {
    const root = await temporaryDirectory();
    const repository = await createRepository(root);
    const manager = new CodingWorktreeManager(join(root, 'managed'));
    const worktree = await manager.prepare({
      runId: 'run-stale',
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
    const manager = new CodingWorktreeManager(join(root, 'managed'));

    await expect(
      manager.prepare({
        runId: '../outside',
        repositoryRoot: repository,
        baseCommitSha: await gitHead(repository),
      }),
    ).rejects.toThrow('identity is invalid');
    await expect(
      manager.prepare({
        runId: 'run-3',
        repositoryRoot: repository,
        baseCommitSha: 'f'.repeat(40),
      }),
    ).rejects.toBeDefined();
  });
});

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
