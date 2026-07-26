import { createHash } from 'node:crypto';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { IterationWorktreeSnapshot } from './iteration-worktree';
import {
  PairCheckpointStore,
  type PairCheckpointIdentity,
  type PairCheckpointInput,
} from './pair-checkpoint-store';

const temporaryPaths: string[] = [];
const identity: PairCheckpointIdentity = {
  apiBaseUrl: 'https://evidence.example/api',
  workspaceId: 'workspace-secret-name',
  iterationId: 'iteration-secret-name',
};

afterEach(async () => {
  await Promise.all(
    temporaryPaths
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe('PairCheckpointStore', () => {
  it('atomically preserves a content-addressed patch and pending evidence', async () => {
    const root = await temporaryDirectory();
    const store = new PairCheckpointStore(
      root,
      () => new Date('2026-08-03T10:00:00.000Z'),
    );
    const input = checkpoint('diff --git a/a.ts b/a.ts\npaired patch\n');

    const saved = await store.save(identity, input);
    const loaded = await store.load(identity);

    expect(loaded).toEqual(saved);
    expect(loaded).toMatchObject({
      schemaVersion: 1,
      pairRunId: 'pair-1',
      pairVersion: 3,
      checkpoint: 'test_written',
      pendingEvidence: {
        kind: 'exception',
        input: {
          pairRunId: 'pair-1',
          actionId: 'ACT-001',
          expectedPairVersion: 3,
          kind: 'runtime_failure',
          summary: 'Runtime stopped.',
        },
      },
      diagnostic: {
        actionId: 'ACT-001',
        observationId: null,
        stdout: 'focused output',
        stderr: '',
      },
    });
    expect(JSON.stringify(await readdir(root))).not.toContain('secret-name');
  });

  it('replaces authority metadata while reusing an immutable patch', async () => {
    const root = await temporaryDirectory();
    const store = new PairCheckpointStore(root);
    const input = checkpoint('same patch');

    await store.save(identity, input);
    await store.save(identity, {
      ...input,
      pairVersion: 4,
      checkpoint: 'red_observed',
      pendingEvidence: null,
      diagnostic: null,
    });

    await expect(store.load(identity)).resolves.toMatchObject({
      pairVersion: 4,
      checkpoint: 'red_observed',
      patch: 'same patch',
      pendingEvidence: null,
      diagnostic: null,
    });
  });

  it('rejects a corrupted local patch instead of restoring it', async () => {
    const root = await temporaryDirectory();
    const store = new PairCheckpointStore(root);
    const input = checkpoint('trusted patch');
    await store.save(identity, input);
    const [directory] = await readdir(root);
    expect(directory).toBeDefined();
    const files = await readdir(join(root, directory as string));
    const patch = files.find((file) => file.endsWith('.patch'));
    expect(patch).toBeDefined();
    await writeFile(
      join(root, directory as string, patch as string),
      'tampered',
    );

    await expect(store.load(identity)).rejects.toThrow(
      'patch SHA-256 does not match',
    );
  });

  it('clears local execution material without exposing repository paths', async () => {
    const root = await temporaryDirectory();
    const store = new PairCheckpointStore(root);
    await store.save(identity, checkpoint('patch'));

    await store.clear(identity);

    await expect(store.load(identity)).resolves.toBeNull();
  });
});

function checkpoint(content: string): PairCheckpointInput {
  const snapshot = localSnapshot(content);
  return {
    pairRunId: 'pair-1',
    pairVersion: 3,
    checkpoint: 'test_written',
    worktree: {
      iterationId: 'iteration-secret-name',
      repositoryRoot: '/private/repository',
      worktreeRoot: '/private/worktree',
      branchName: 'evidence/iter-iteration-secret-name',
      baseCommitSha: 'b'.repeat(40),
    },
    snapshot,
    pendingEvidence: {
      kind: 'exception',
      input: {
        pairRunId: 'pair-1',
        actionId: 'ACT-001',
        expectedPairVersion: 3,
        kind: 'runtime_failure',
        summary: 'Runtime stopped.',
      },
    },
    diagnostic: {
      actionId: 'ACT-001',
      observationId: null,
      termination: 'exited',
      exitCode: 1,
      signal: null,
      stdout: 'focused output',
      stderr: '',
      stdoutSha256: digest('focused output'),
      stderrSha256: digest(''),
    },
  };
}

function localSnapshot(content: string): IterationWorktreeSnapshot {
  return {
    content,
    sha256: digest(content),
    changedFileCount: 1,
    headSha: 'b'.repeat(40),
    changedPaths: ['a.ts'],
    pathFingerprints: { 'a.ts': 'blob:fixture' },
    worktreeSha256: digest(`worktree:${content}`),
  };
}

function digest(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

async function temporaryDirectory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'evidence-pair-checkpoint-'));
  temporaryPaths.push(path);
  return path;
}
