import { randomUUID } from 'node:crypto';
import {
  closeSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  rmdirSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

import { digestBytes } from '../adapter/fmAdapter.js';
import { canonicalJson } from '../canonicalJson.js';
import type { ContextDeliveryPlan } from './contextDelivery.js';

export interface ContextSyncResult {
  directory: string;
  changedFiles: readonly string[];
  synced: number;
  blocked: number;
}

const statOf = (file: string) => lstatSync(file, { throwIfNoEntry: false });

function readRegular(file: string): Buffer | undefined {
  const stat = statOf(file);
  if (!stat) return undefined;
  if (!stat.isFile())
    throw new Error(`DELIVERY_UNSAFE_OUTPUT: ${file} is not a regular file`);
  return readFileSync(file);
}

function checkDirectory(dir: string, create: boolean): void {
  const stat = statOf(dir);
  if (stat) {
    if (!stat.isDirectory())
      throw new Error(`DELIVERY_UNSAFE_OUTPUT: ${dir} is not a directory`);
    return;
  }
  if (create) mkdirSync(dir);
}

/** Check all descendants of a real project root without following symbolic links. */
export function contextOutputDirectory(
  project: string,
  relative = 'delivery',
): string {
  const root = path.resolve(project);
  const out = path.resolve(root, relative);
  const segments = path.relative(root, out).split(path.sep);
  if (
    path.isAbsolute(relative) ||
    relative.includes('\\') ||
    relative.includes('\0') ||
    segments.some(
      (part) =>
        !part ||
        part === '..' ||
        ['.git', '.evidence'].includes(part.toLowerCase()),
    )
  )
    throw new Error(
      'DELIVERY_UNSAFE_OUTPUT: use a dedicated relative directory inside the project',
    );
  let cursor = root;
  for (const segment of segments) {
    cursor = path.join(cursor, segment);
    checkDirectory(cursor, false);
  }
  return out;
}

/** Generated files only. The manifest is the commit marker for each context. */
export function contextDeliveryFiles(
  plan: ContextDeliveryPlan,
  sourceKey?: string,
): ReadonlyMap<string, string> {
  const files = new Map<string, string>();
  for (const { contextId, contract } of plan.contexts) {
    if (!contract) continue;
    if (
      !/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/i.test(contextId) ||
      /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(contextId)
    )
      throw new Error(
        `DELIVERY_UNSAFE_OUTPUT: invalid context path ${contextId}`,
      );
    const directory = `services/${contextId}`;
    const openapi = canonicalJson(contract);
    const readme = `# ${contract.info.title.replace(/[\r\n]+/g, ' ')}\n\n业务上下文：\`${contextId}\`。此文件由模型自动生成，不代表部署边界或发布授权。\n`;
    files.set(`${directory}/openapi.json`, openapi);
    files.set(`${directory}/README.md`, readme);
    files.set(
      `${directory}/.context-manifest.json`,
      canonicalJson({
        contextId,
        modelId: plan.modelId,
        mode: 'draft',
        releaseAuthorized: false,
        files: {
          'openapi.json': digestBytes(openapi),
          'README.md': digestBytes(readme),
        },
      }),
    );
  }
  const gateway = canonicalJson(plan.gateway);
  files.set('openapi.json', gateway);
  files.set(
    'delivery-status.json',
    canonicalJson({
      schemaVersion: 1,
      modelId: plan.modelId,
      modelDigest: plan.modelDigest,
      ...(sourceKey === undefined ? {} : { sourceKey }),
      mode: 'draft',
      releaseAuthorized: false,
      gatewayDigest: digestBytes(gateway),
      contexts: plan.contexts.map(({ contextId, status, issues }) => ({
        contextId,
        status: status === 'ready' ? 'synced' : status,
        issues,
      })),
    }),
  );
  return files;
}

function directoriesTo(dir: string, create: boolean): void {
  const parent = path.dirname(dir);
  if (parent !== dir) directoriesTo(parent, create);
  // On platforms such as macOS /var is a symlink; callers canonicalize trusted ancestors first.
  checkDirectory(dir, create);
}

function filePath(root: string, relative: string, create: boolean): string {
  const file = path.join(root, relative);
  if (path.dirname(file) !== root) {
    checkDirectory(path.join(root, 'services'), create);
    checkDirectory(path.dirname(file), create);
  }
  return file;
}

const sourceKeyOf = (out: string, modelSource?: string): string | undefined =>
  modelSource === undefined
    ? undefined
    : path.relative(out, modelSource).split(path.sep).join('/');

function checkOwner(root: string, modelId: string, sourceKey?: string): void {
  const status = readRegular(path.join(root, 'delivery-status.json'));
  if (!status) return;
  const previous = JSON.parse(status.toString('utf8')) as {
    modelId?: string;
    sourceKey?: string;
  } | null;
  if (previous?.modelId !== modelId || previous.sourceKey !== sourceKey)
    throw new Error(
      'DELIVERY_MODEL_MISMATCH: the output belongs to a different model source',
    );
}

export function verifyContextDelivery(
  out: string,
  plan: ContextDeliveryPlan,
  modelSource?: string,
): readonly string[] {
  directoriesTo(out, false);
  const sourceKey = sourceKeyOf(out, modelSource);
  checkOwner(out, plan.modelId, sourceKey);
  return [...contextDeliveryFiles(plan, sourceKey)].flatMap(
    ([relative, content]) =>
      readRegular(filePath(out, relative, false))?.equals(Buffer.from(content))
        ? []
        : [relative],
  );
}

/**
 * Stage every changed file before replacing any. Renames are atomic per file,
 * not across files: replace each manifest after its artifacts, and status last.
 * A later run repairs interrupted output by comparing actual bytes, not markers.
 */
export function writeContextDelivery(
  out: string,
  plan: ContextDeliveryPlan,
  modelSource?: string,
): ContextSyncResult {
  const sourceKey = sourceKeyOf(out, modelSource);
  const files = contextDeliveryFiles(plan, sourceKey);
  directoriesTo(out, true);
  const lock = path.join(out, '.context-sync.lock');
  try {
    mkdirSync(lock);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST')
      throw new Error('DELIVERY_BUSY: another sync owns this output directory');
    throw error;
  }
  const pending: { relative: string; file: string; temp: string }[] = [];
  try {
    checkOwner(out, plan.modelId, sourceKey);
    for (const [relative, content] of files) {
      const file = filePath(out, relative, true);
      const bytes = Buffer.from(content);
      if (readRegular(file)?.equals(bytes)) continue;
      const temp = path.join(path.dirname(file), `.sync-${randomUUID()}.tmp`);
      const fd = openSync(temp, 'wx');
      pending.push({ relative, file, temp });
      try {
        writeFileSync(fd, bytes);
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
    }
    for (const { temp, file } of pending) renameSync(temp, file);
    return {
      directory: out,
      changedFiles: pending.map(({ relative }) => relative),
      synced: plan.contexts.filter(({ status }) => status === 'ready').length,
      blocked: plan.contexts.filter(({ status }) => status === 'blocked')
        .length,
    };
  } finally {
    try {
      for (const { temp } of pending) rmSync(temp, { force: true });
    } finally {
      rmdirSync(lock);
    }
  }
}
