import { randomUUID } from 'node:crypto';
import { lstatSync, realpathSync, readFileSync } from 'node:fs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { MODEL_MANIFEST_PATH } from '@evidence-poc/evidence-model-core';
import type { DomainModelDocument } from '@evidence-poc/evidence-schema';
import { writeModelDirectory } from './adapters/diskAdapter.js';

export const MODEL_DIRECTORY = path.join('.evidence', 'model');

export function workspacePaths(rootPath: string) {
  const root = path.resolve(rootPath);
  const evidence = path.join(root, '.evidence');
  const model = path.join(root, MODEL_DIRECTORY);
  const delivery = path.join(evidence, 'delivery');
  const cache = path.join(evidence, 'cache');
  return {
    root,
    evidence,
    model,
    delivery,
    cache,
    manifest: path.join(model, MODEL_MANIFEST_PATH),
    config: path.join(evidence, 'config.json'),
    release: path.join(delivery, 'release'),
    acceptance: path.join(evidence, 'acceptance'),
    derived: path.join(evidence, 'derived'),
    reports: path.join(evidence, 'reports'),
    stories: path.join(evidence, 'stories'),
  };
}

export const entryAt = (file: string) =>
  lstatSync(file, { throwIfNoEntry: false });

/** Require real directories and regular files below the selected root. Missing
 * entries are allowed for writes; callers requiring an input check for it. */
export function checkWorkspacePath(
  root: string,
  target: string,
  kind: 'file' | 'directory',
): void {
  const { evidence } = workspacePaths(root);
  const relative = path.relative(evidence, target);
  if (
    path.isAbsolute(relative) ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`)
  )
    throw new Error(
      'WORKSPACE_UNSAFE_PATH: project files must be inside .evidence',
    );
  const segments = ['.evidence', ...(relative ? relative.split(path.sep) : [])];
  let cursor = root;
  for (const [index, segment] of segments.entries()) {
    cursor = path.join(cursor, segment);
    const stat = entryAt(cursor);
    const file = kind === 'file' && index === segments.length - 1;
    if (stat && !(file ? stat.isFile() : stat.isDirectory()))
      throw new Error(
        `WORKSPACE_UNSAFE_PATH: ${cursor} must be a regular ${file ? 'file' : 'directory'} (not a symlink)`,
      );
  }
}

function resolveDirectory(rootPath: string) {
  const root = realpathSync(rootPath);
  if (!entryAt(root)?.isDirectory())
    throw new Error(`WORKSPACE_NOT_DIRECTORY: ${rootPath}`);
  return workspacePaths(root);
}

export function openWorkspace(rootPath: string) {
  const paths = resolveDirectory(rootPath);
  checkWorkspacePath(paths.root, paths.manifest, 'file');
  if (!entryAt(paths.manifest))
    throw new Error(`WORKSPACE_NOT_INITIALIZED: missing ${paths.manifest}`);
  checkWorkspacePath(paths.root, paths.config, 'file');
  if (entryAt(paths.config)) {
    const config: unknown = JSON.parse(readFileSync(paths.config, 'utf8'));
    if (
      !config ||
      typeof config !== 'object' ||
      Array.isArray(config) ||
      !('version' in config) ||
      config.version !== 1 ||
      Object.keys(config).length !== 1
    )
      throw new Error(
        'WORKSPACE_CONFIG_INVALID: .evidence/config.json must contain only {"version":1}',
      );
  }
  return paths;
}

/** The nearest .evidence entry owns discovery, even without a model manifest.
 * Never silently select a parent workspace across a repository boundary. */
export function findWorkspace(from: string) {
  let directory = resolveDirectory(from).root;
  for (;;) {
    if (entryAt(workspacePaths(directory).evidence))
      return openWorkspace(directory);
    const parent = path.dirname(directory);
    if (parent === directory || entryAt(path.join(directory, '.git')))
      throw new Error(
        `WORKSPACE_NOT_FOUND: no .evidence/model/model.json from ${from}`,
      );
    directory = parent;
  }
}

/** Replace a single project artifact atomically, leaving equal bytes alone. */
export async function writeWorkspaceFile(
  root: string,
  file: string,
  content: string,
) {
  checkWorkspacePath(root, file, 'file');
  if (entryAt(file) && readFileSync(file, 'utf8') === content) return;
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp-${randomUUID()}`;
  try {
    await writeFile(temp, content, { flag: 'wx' });
    await rename(temp, file);
  } finally {
    await rm(temp, { force: true });
  }
}

/** Initialize only after an explicit request. Never overwrite an existing .evidence entry. */
export async function initializeWorkspace(
  rootPath: string,
  document: DomainModelDocument,
) {
  const paths = resolveDirectory(rootPath);
  if (entryAt(paths.evidence))
    throw new Error(
      `WORKSPACE_ALREADY_EXISTS: ${paths.evidence} 已存在，不会覆盖。`,
    );
  // Claim the directory exclusively; concurrent initializers cannot both write it.
  await mkdir(paths.evidence);
  const stage = path.join(paths.evidence, `.init-${randomUUID()}`);
  try {
    await mkdir(stage);
    await writeModelDirectory(path.join(stage, 'model'), document);
    await writeFile(
      path.join(paths.evidence, '.gitignore'),
      '/cache/\n/.init-*/\n*.tmp-*\n.sync-*.tmp\n*.stage-*\n*.backup-*\n.context-sync.lock/\n',
      { flag: 'wx' },
    );
    await writeFile(paths.config, '{"version":1}\n', { flag: 'wx' });
    await rename(path.join(stage, 'model'), paths.model);
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
  return paths;
}
