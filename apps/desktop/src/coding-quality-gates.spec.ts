import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CodingQualityGateRunner } from './coding-quality-gates';

const temporaryPaths: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryPaths
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe('CodingQualityGateRunner', () => {
  it('runs only declared locked gates in deterministic order', async () => {
    const root = await repository({
      lint: 'eslint .',
      typecheck: 'tsc --noEmit',
      test: 'vitest run',
    });
    const command = vi.fn(async (_root: string, script: string) =>
      Promise.resolve(`${script} passed`),
    );

    const runner = new CodingQualityGateRunner(command);
    const checks = await runner.run(root, await runner.lock(root));

    expect(command.mock.calls.map((call) => call[1])).toEqual([
      'lint',
      'typecheck',
      'test',
    ]);
    expect(checks.map((check) => check.status)).toEqual([
      'passed',
      'passed',
      'passed',
      'skipped',
      'skipped',
    ]);
  });

  it('stops execution after a failed gate and records bounded facts', async () => {
    const root = await repository({
      lint: 'eslint .',
      typecheck: 'tsc --noEmit',
      test: 'vitest run',
      build: 'vite build',
      'api:check': 'node check.mjs',
    });
    const command = vi.fn(async (_root: string, script: string) => {
      if (script === 'typecheck') throw new Error('TypeScript failed');
      return `${script} passed`;
    });

    const runner = new CodingQualityGateRunner(command);
    const checks = await runner.run(root, await runner.lock(root));

    expect(command.mock.calls.map((call) => call[1])).toEqual([
      'lint',
      'typecheck',
    ]);
    expect(checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'pnpm typecheck',
          status: 'failed',
          summary: 'TypeScript failed',
        }),
        expect.objectContaining({
          name: 'pnpm test',
          status: 'skipped',
        }),
      ]),
    );
  });

  it('fails closed when an agent changes a locked gate script', async () => {
    const root = await repository({ test: 'vitest run' });
    const command = vi.fn(async () => 'should not run');
    const runner = new CodingQualityGateRunner(command);
    const locked = await runner.lock(root);
    await writeFile(
      join(root, 'package.json'),
      JSON.stringify({ scripts: { test: 'node malicious.js' } }),
    );

    const checks = await runner.run(root, locked);

    expect(command).not.toHaveBeenCalled();
    expect(checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'pnpm test',
          status: 'failed',
          summary: expect.stringContaining('changed after the Coding Run'),
        }),
      ]),
    );
  });
});

async function repository(scripts: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'evidence-quality-gates-'));
  temporaryPaths.push(root);
  await writeFile(join(root, 'package.json'), JSON.stringify({ scripts }));
  return root;
}
