import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import {
  initializeWorkspace,
  workspacePaths,
} from '@evidence-poc/evidence-model-io';
import { createEmptyDomainModel } from '@evidence-poc/evidence-schema';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createStoryNarrationCache } from './storyNarrationCache';

let directory: string;
let a: string;
let b: string;
const signal = new AbortController().signal;
const key = (index: number) => index.toString(16).padStart(64, '0');
const draft = (prose: string) => ({
  narrative: { headline: '业务故事', prose },
});

beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'story-narration-cache-'));
  a = path.join(directory, 'a');
  b = path.join(directory, 'b');
  for (const root of [a, b]) {
    await mkdir(root);
    await initializeWorkspace(root, createEmptyDomainModel());
  }
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

it('merges concurrent windows atomically, scopes entries by project, and reads them from a new cache instance', async () => {
  const cache = createStoryNarrationCache();
  await Promise.all([
    cache(a).write(new Map([[key(1), draft('第一份草稿')]])),
    cache(a).write(new Map([[key(2), draft('第二份草稿')]])),
    cache(b).write(new Map([[key(1), draft('另一项目的草稿')]])),
  ]);
  const reopened = createStoryNarrationCache();
  expect(await reopened(a).read(signal)).toEqual(
    new Map([
      [key(1), draft('第一份草稿')],
      [key(2), draft('第二份草稿')],
    ]),
  );
  expect(await reopened(b).read(signal)).toEqual(
    new Map([[key(1), draft('另一项目的草稿')]]),
  );
  expect(await readdir(workspacePaths(a).cache)).toEqual(['narration.json']);
});

it('bounds each project and treats corrupt, stale-version, and oversized files as cache misses', async () => {
  const cache = createStoryNarrationCache()(a);
  await cache.write(
    new Map(
      Array.from({ length: 300 }, (_, i) => [key(i), draft(`草稿 ${i}`)]),
    ),
  );
  const entries = await cache.read(signal);
  expect(entries.size).toBe(256);
  expect(entries.has(key(0))).toBe(false);
  expect(entries.get(key(299))).toEqual(draft('草稿 299'));
  const file = path.join(workspacePaths(a).cache, 'narration.json');
  for (const contents of [
    '{incomplete',
    JSON.stringify({ version: 1, entries: [[key(1), '旧旁白']] }),
    JSON.stringify({
      version: 2,
      entries: [[key(1), { headline: '旧草稿', prose: '缺少场景标识' }]],
    }),
    JSON.stringify({
      version: 3,
      entries: [[key(1), { narrative: { prose: '缺少标题' } }]],
    }),
    'x'.repeat(1024 * 1024 + 1),
  ]) {
    await writeFile(file, contents);
    expect(await cache.read(signal)).toEqual(new Map());
  }
  await cache.write(
    new Map([
      ['not-a-hash', draft('忽略坏的键')],
      [key(0), draft('x'.repeat(601))],
      [key(3), draft('恢复后的草稿')],
    ]),
  );
  expect(await cache.read(signal)).toEqual(
    new Map([[key(3), draft('恢复后的草稿')]]),
  );
});
