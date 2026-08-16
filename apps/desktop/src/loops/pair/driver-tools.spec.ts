import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createPairDriverTools,
  type PairDriverToolState,
} from './driver-tools';

const temporaryPaths: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryPaths
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe('Pair Driver tools', () => {
  it('lets Test Driver change only test files in the approved nearest roots', async () => {
    const worktree = await worktreeFixture();
    const state = driverState();
    const tools = await createPairDriverTools(
      worktree,
      {
        role: 'test',
        allowedTestRoots: ['apps/desktop/src'],
        allowedProductionRoots: [],
        frozenTestPaths: [],
      },
      state,
    );

    expect(tools.map(({ name }) => name)).toEqual([
      'read',
      'edit',
      'write',
      'search',
      'list_files',
      'evidence_complete_pair_driver',
    ]);
    expect(tools.map(({ name }) => name)).not.toContain('bash');
    expect(tools.map(({ name }) => name)).not.toContain('run_quality_gate');
    await execute(requiredTool(tools, 'write'), {
      path: 'apps/desktop/src/pair.spec.ts',
      content: 'export {};\n',
    });
    await expect(
      execute(requiredTool(tools, 'write'), {
        path: 'apps/desktop/src/pair.ts',
        content: 'export {};\n',
      }),
    ).rejects.toThrow('non-test path');
    await expect(
      execute(requiredTool(tools, 'write'), {
        path: 'libs/server-java/domain/src/test/java/PairTest.java',
        content: 'export {};\n',
      }),
    ).rejects.toThrow('non-test path');
    expect(
      await readFile(join(worktree, 'apps/desktop/src/pair.spec.ts'), 'utf8'),
    ).toBe('export {};\n');
  });

  it('freezes tests and protected config for Production Driver', async () => {
    const worktree = await worktreeFixture();
    const state = driverState();
    const tools = await createPairDriverTools(
      worktree,
      {
        role: 'production',
        allowedTestRoots: [],
        allowedProductionRoots: ['apps/desktop'],
        frozenTestPaths: ['apps/desktop/src/existing.spec.ts'],
      },
      state,
    );
    const write = requiredTool(tools, 'write');

    await execute(write, {
      path: 'apps/desktop/src/pair.ts',
      content: 'export const pair = true;\n',
    });
    await expect(
      execute(write, {
        path: 'apps/desktop/src/existing.spec.ts',
        content: 'changed\n',
      }),
    ).rejects.toThrow('frozen test');
    await expect(
      execute(write, {
        path: 'apps/desktop/package.json',
        content: '{}',
      }),
    ).rejects.toThrow('protected config');
    await expect(
      execute(write, {
        path: '.evidence/entities/story.yaml',
        content: 'forbidden',
      }),
    ).rejects.toThrow('protected path');
  });

  it('does not read through protected roots or escaping symlinks', async () => {
    const worktree = await worktreeFixture();
    const outside = join(await temporaryDirectory(), 'outside.txt');
    await writeFile(outside, 'secret\n');
    await symlink(outside, join(worktree, 'outside-link'));
    const tools = await createPairDriverTools(
      worktree,
      {
        role: 'production',
        allowedTestRoots: [],
        allowedProductionRoots: ['apps/desktop'],
        frozenTestPaths: [],
      },
      driverState(),
    );
    const read = requiredTool(tools, 'read');

    await expect(execute(read, { path: '.pi/secret.txt' })).rejects.toThrow(
      'protected path',
    );
    await expect(execute(read, { path: 'outside-link' })).rejects.toThrow(
      'outside the Iteration worktree',
    );
  });

  it('records one bounded completion without granting checkpoint authority', async () => {
    const worktree = await worktreeFixture();
    const state = driverState();
    const tools = await createPairDriverTools(
      worktree,
      {
        role: 'refactor',
        allowedTestRoots: [],
        allowedProductionRoots: ['apps/desktop'],
        frozenTestPaths: ['apps/desktop/src/existing.spec.ts'],
      },
      state,
    );
    const complete = requiredTool(tools, 'evidence_complete_pair_driver');

    await execute(complete, {
      summary: 'No safe refactor was needed for this process step.',
    });
    expect(state).toEqual({
      completed: true,
      summary: 'No safe refactor was needed for this process step.',
    });
    await expect(
      execute(complete, { summary: 'Attempt a second completion.' }),
    ).rejects.toThrow('one-shot');
  });
});

async function worktreeFixture(): Promise<string> {
  const root = await temporaryDirectory();
  const worktree = join(root, 'worktree');
  await mkdir(join(worktree, 'apps/desktop/src'), { recursive: true });
  await mkdir(join(worktree, '.pi'), { recursive: true });
  await writeFile(
    join(worktree, 'apps/desktop/src/existing.spec.ts'),
    'export {};\n',
  );
  await writeFile(
    join(worktree, 'apps/desktop/src/existing.ts'),
    'export {};\n',
  );
  await writeFile(join(worktree, 'apps/desktop/package.json'), '{}');
  await writeFile(join(worktree, '.pi/secret.txt'), 'internal\n');
  return worktree;
}

function driverState(): PairDriverToolState {
  return { completed: false, summary: null };
}

function requiredTool(tools: ToolDefinition[], name: string): ToolDefinition {
  const tool = tools.find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`Missing ${name} tool`);
  return tool;
}

async function execute(
  tool: ToolDefinition,
  params: Record<string, unknown>,
): Promise<unknown> {
  return tool.execute(
    'tool-call-1',
    params,
    new AbortController().signal,
    undefined,
    undefined as never,
  );
}

async function temporaryDirectory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'evidence-pair-driver-tools-'));
  temporaryPaths.push(path);
  return path;
}
