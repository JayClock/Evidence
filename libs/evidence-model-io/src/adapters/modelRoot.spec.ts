import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createProcurementModel } from '@evidence-poc/evidence-model-core/testing';
import {
  modelDigestOf,
  readModelRoot,
  readModelRootBytes,
  writeModelDirectory,
} from '../index.js';

let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'evidence-model-source-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('model source selection', () => {
  it('ignores files outside the model source trees without changing them', async () => {
    const model = path.join(root, 'model');
    await writeModelDirectory(model, createProcurementModel());
    const before = await readModelRoot(model);
    const readDigest = async () =>
      modelDigestOf(
        (await readModelRootBytes(model)).map(({ path, bytes }) => ({
          path,
          content: bytes,
        })),
      );
    const digest = await readDigest();
    const notes = path.join(model, 'notes');
    await mkdir(notes);
    const file = path.join(notes, 'scratch.json');
    await writeFile(file, '{');

    expect(before.issues).toEqual([]);
    expect(await readModelRoot(model)).toEqual(before);
    expect(await readDigest()).toBe(digest);
    expect(await readFile(file, 'utf8')).toBe('{');
  });
});
