import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createEmptyDomainModel } from '@evidence-poc/evidence-schema';
import { afterEach, beforeEach, expect, it } from 'vitest';
import {
  checkWorkspacePath,
  findWorkspace,
  initializeWorkspace,
  openWorkspace,
  workspacePaths,
} from './workspace.js';

let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'evidence-workspace-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

it('initializes a non-empty directory without touching its contents and discovers it from a child', async () => {
  const child = path.join(root, 'code');
  await mkdir(child);
  const sentinel = path.join(child, 'keep');
  await writeFile(sentinel, 'code');
  const paths = await initializeWorkspace(root, createEmptyDomainModel());
  expect(findWorkspace(child)).toEqual(openWorkspace(root));
  expect(await readFile(paths.config, 'utf8')).toBe('{"version":1}\n');
  expect(
    await readFile(path.join(paths.evidence, '.gitignore'), 'utf8'),
  ).toContain('/cache/');
  expect(await readFile(sentinel, 'utf8')).toBe('code');
});

it('does not fall back to a parent workspace or overwrite an incomplete child workspace', async () => {
  await initializeWorkspace(root, createEmptyDomainModel());
  const child = path.join(root, 'child');
  const evidence = workspacePaths(child).evidence;
  await mkdir(evidence, { recursive: true });
  const sentinel = path.join(evidence, 'notes.txt');
  await writeFile(sentinel, 'owner content');
  expect(() => findWorkspace(child)).toThrow('WORKSPACE_NOT_INITIALIZED');
  await expect(
    initializeWorkspace(child, createEmptyDomainModel()),
  ).rejects.toThrow('WORKSPACE_ALREADY_EXISTS');
  expect(await readFile(sentinel, 'utf8')).toBe('owner content');
});

it('rejects out-of-workspace and symbolic-link destinations', async () => {
  const paths = await initializeWorkspace(root, createEmptyDomainModel());
  const outside = path.join(root, 'src');
  await mkdir(outside);
  await symlink(outside, paths.delivery, 'junction');
  expect(() => checkWorkspacePath(paths.root, outside, 'directory')).toThrow(
    'WORKSPACE_UNSAFE_PATH',
  );
  expect(() =>
    checkWorkspacePath(paths.root, paths.release, 'directory'),
  ).toThrow('not a symlink');
  expect(workspacePaths(root).model).toBe(path.join(root, '.evidence/model'));
});
