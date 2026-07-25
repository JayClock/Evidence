import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CodingRunStore,
  type LocalCodingRunRecordInput,
} from './coding-run-store';

const temporaryPaths: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryPaths
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe('CodingRunStore', () => {
  it('atomically persists local-only recovery facts', async () => {
    const root = await temporaryDirectory();
    const path = join(root, 'coding-runs.json');
    const store = new CodingRunStore(path);

    const saved = await store.save(record());

    expect(saved.updatedAt).toEqual(expect.any(String));
    expect(
      await new CodingRunStore(path).find(saved.apiBaseUrl, saved.runId),
    ).toEqual(saved);
    expect(await readFile(path, 'utf8')).toContain('/local/worktree');

    await store.remove(saved.apiBaseUrl, saved.runId);
    expect(await store.find(saved.apiBaseUrl, saved.runId)).toBeNull();
  });

  it('rejects review facts without their managed worktree', async () => {
    const root = await temporaryDirectory();
    const store = new CodingRunStore(join(root, 'coding-runs.json'));

    await expect(
      store.save({
        ...record(),
        worktree: null,
      }),
    ).rejects.toThrow('review facts require a worktree');
  });
});

function record(): LocalCodingRunRecordInput {
  return {
    apiBaseUrl: 'https://api.example.test/api',
    workspaceId: 'workspace-1',
    runId: 'run-1',
    worktree: {
      runId: 'run-1',
      repositoryRoot: '/local/repository',
      worktreeRoot: '/local/worktree',
      branchName: 'evidence/run-run-1',
      baseCommitSha: 'a'.repeat(40),
    },
    diffSha256: `sha256:${'b'.repeat(64)}`,
    changedFileCount: 2,
    commitSha: null,
  };
}

async function temporaryDirectory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'evidence-coding-run-store-'));
  temporaryPaths.push(path);
  return path;
}
