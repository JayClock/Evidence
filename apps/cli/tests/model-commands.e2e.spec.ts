import { execFile } from 'node:child_process';
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, expect, it } from 'vitest';

const cli = path.resolve(import.meta.dirname, '../dist/cli.js');
const fixture = path.resolve(
  import.meta.dirname,
  '../../../examples/b2b-escrow/.evidence/model',
);
let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'evidence-model-cli-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const run = (args: string[], cwd = root) =>
  promisify(execFile)(process.execPath, [cli, ...args], {
    cwd,
    timeout: 15000,
  });

it('initializes an existing directory explicitly and refuses to replace it', async () => {
  await writeFile(path.join(root, 'code'), 'owner content');
  await expect(run(['inspect'])).rejects.toMatchObject({
    stderr: expect.stringContaining('WORKSPACE_NOT_FOUND'),
  });
  await run(['init', '--name', 'Example']);
  const { stdout } = await run(['inspect', '--json']);
  expect(JSON.parse(stdout)).toMatchObject({
    modelName: 'Example',
    entities: 0,
  });
  await expect(run(['init'])).rejects.toMatchObject({
    stderr: expect.stringContaining('WORKSPACE_ALREADY_EXISTS'),
  });
  expect(await readdir(root)).toEqual(['.evidence', 'code']);
  expect(await readFile(path.join(root, 'code'), 'utf8')).toBe('owner content');
});

it('derives a checked snapshot and lineage inside .evidence from a nested cwd', async () => {
  await cp(fixture, path.join(root, '.evidence/model'), { recursive: true });
  const code = path.join(root, 'code');
  await mkdir(code);
  await run(['compile', '--compact'], code);
  await run(['lineage'], code);
  const compiled = await readFile(
    path.join(root, '.evidence/derived/model.json'),
    'utf8',
  );
  expect(compiled.trim().split('\n')).toHaveLength(1);
  expect(JSON.parse(compiled).entities.length).toBeGreaterThan(0);
  expect(
    JSON.parse(
      await readFile(path.join(root, '.evidence/derived/lineage.json'), 'utf8'),
    ),
  ).toBeTypeOf('object');
  expect(await readdir(code)).toEqual([]);
});
