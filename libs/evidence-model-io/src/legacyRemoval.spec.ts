import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { serializeModelBundle } from '@evidence-poc/evidence-model-core';
import { createProcurementModel } from '@evidence-poc/evidence-model-core/testing';
import {
  modelDigestOf,
  readModelRoot,
  readModelRootBytes,
  unpackModelBundle,
  writeModelDirectory,
} from './index.js';

let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'evidence-no-legacy-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('breaking removal of validation files', () => {
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
    const retired = path.join(model, 'validation/scenarios');
    await mkdir(retired, { recursive: true });
    const file = path.join(retired, 'old.json');
    await writeFile(file, '{');

    expect(before.issues).toEqual([]);
    expect(await readModelRoot(model)).toEqual(before);
    expect(await readDigest()).toBe(digest);
    expect(await readFile(file, 'utf8')).toBe('{');
  });
  it('refuses unpacking an old envelope without creating or overwriting output', async () => {
    const file = path.join(root, 'old.evidence.json');
    const legacy = {
      ...JSON.parse(serializeModelBundle(createProcurementModel())),
      validation: { instances: [], scenarios: [] },
    };
    await writeFile(file, JSON.stringify(legacy));
    const out = path.join(root, 'existing');
    await mkdir(out);
    await writeFile(path.join(out, 'keep.txt'), 'untouched');
    const result = await unpackModelBundle(file, out);
    expect(result.issues.some((issue) => issue.path === 'validation')).toBe(
      true,
    );
    expect(result.result).toEqual({ written: [], unchanged: [] });
    expect(await readdir(out)).toEqual(['keep.txt']);
    expect(await readFile(path.join(out, 'keep.txt'), 'utf8')).toBe(
      'untouched',
    );
  });
});
