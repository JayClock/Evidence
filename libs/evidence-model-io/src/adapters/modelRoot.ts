import { createHash } from 'node:crypto';
import type { Dirent } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { DomainModelDocument } from '@evidence-poc/evidence-schema';

import {
  MODEL_MANIFEST_PATH,
  MODEL_SOURCE_TREES,
  parseModelSourceFiles,
  type ModelSourceFile,
  type ModelSourceIssue,
} from '@evidence-poc/evidence-model-core';

/** Tree holding output the checks never read back. */
export const MODEL_GENERATED_TREE = 'generated';

/** Files the checks never read: generated output, caches and dot directories. */
const isIgnored = (relativePath: string): boolean =>
  relativePath
    .split('/')
    .some(
      (part) =>
        part === MODEL_GENERATED_TREE ||
        part === '__pycache__' ||
        part.startsWith('.'),
    );

/** The model source files, decoded from the same set used for input digests. */
export async function readModelRootFiles(
  root: string,
): Promise<ModelSourceFile[]> {
  return (await readModelRootBytes(root)).map(({ path, bytes }) => ({
    path,
    content: bytes.toString('utf8'),
  }));
}

/** One file as the digest reads it: its path and its bytes. */
export interface ModelRootBytes {
  path: string;
  bytes: Buffer;
}

const readTreeBytes = async (
  root: string,
  relativeDirectory = '',
): Promise<ModelRootBytes[]> => {
  const absolute = path.join(root, relativeDirectory);
  let entries: Dirent[];

  try {
    entries = await readdir(absolute, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }

    throw error;
  }

  const files: ModelRootBytes[] = [];

  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    const relative =
      relativeDirectory === ''
        ? entry.name
        : `${relativeDirectory}/${entry.name}`;

    if (isIgnored(relative)) {
      continue;
    }

    const sourceTree =
      !relativeDirectory &&
      MODEL_SOURCE_TREES.some((tree) => tree === relative);
    const sourceFile = relativeDirectory
      ? entry.name.endsWith('.json')
      : relative === MODEL_MANIFEST_PATH || relative === 'README.md';
    if (sourceTree && !entry.isDirectory())
      throw new Error(
        `MODEL_UNSAFE_PATH: ${path.join(root, relative)} is not a directory`,
      );
    if (
      sourceFile &&
      !entry.isFile() &&
      (!relativeDirectory || !entry.isDirectory())
    )
      throw new Error(
        `MODEL_UNSAFE_PATH: ${path.join(root, relative)} is not a regular file`,
      );
    if (entry.isDirectory()) {
      if (relativeDirectory || sourceTree)
        files.push(...(await readTreeBytes(root, relative)));
      continue;
    }
    if (!entry.isFile() || !sourceFile) continue;

    files.push({
      path: relative,
      bytes: await readFile(path.join(root, relative)),
    });
  }

  return files;
};

/**
 * Managed files under a model root, with their original bytes.
 */
export async function readModelRootBytes(
  root: string,
): Promise<ModelRootBytes[]> {
  return (await readTreeBytes(root)).sort((left, right) =>
    left.path.localeCompare(right.path),
  );
}

/**
 * `sha256:...` over the sorted `path → sha256(bytes)` map.
 *
 * Independent of where the model tree lives and of generated output.
 */
export const modelDigestOf = (
  files: readonly { path: string; content: string | Buffer }[],
): string => {
  const hashes: Record<string, string> = {};

  for (const file of files) {
    hashes[file.path] = createHash('sha256').update(file.content).digest('hex');
  }

  const content = JSON.stringify(
    Object.fromEntries(
      Object.entries(hashes).sort(([left], [right]) =>
        left < right ? -1 : left > right ? 1 : 0,
      ),
    ),
  );

  return `sha256:${createHash('sha256').update(content, 'utf8').digest('hex')}`;
};

/** Reads a model root and reports file-level problems as issues. */
export async function readModelRoot(root: string): Promise<{
  bundle: DomainModelDocument;
  issues: ModelSourceIssue[];
  files: ModelSourceFile[];
}> {
  const files = await readModelRootFiles(root);
  const { document, issues } = parseModelSourceFiles(files);
  return { bundle: document, issues, files };
}
