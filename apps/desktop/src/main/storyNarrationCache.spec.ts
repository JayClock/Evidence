import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createStoryNarrationCache } from './storyNarrationCache';

let directory: string;
const signal = new AbortController().signal;
const key = (index: number) => index.toString(16).padStart(64, '0');

beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'story-narration-cache-'));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

it('merges concurrent windows atomically, scopes entries by project, and reads them from a new cache instance', async () => {
  const cache = createStoryNarrationCache(directory);
  await Promise.all([
    cache('/projects/a').write(new Map([[key(1), '第一份草稿']])),
    cache('/projects/a').write(new Map([[key(2), '第二份草稿']])),
    cache('/projects/b').write(new Map([[key(1), '另一项目的草稿']])),
  ]);
  const reopened = createStoryNarrationCache(directory);
  expect(await reopened('/projects/a').read(signal)).toEqual(
    new Map([
      [key(1), '第一份草稿'],
      [key(2), '第二份草稿'],
    ]),
  );
  expect(await reopened('/projects/b').read(signal)).toEqual(
    new Map([[key(1), '另一项目的草稿']]),
  );
  expect(await readdir(directory)).toEqual([
    expect.stringMatching(/^[a-f0-9]{64}\.json$/u),
    expect.stringMatching(/^[a-f0-9]{64}\.json$/u),
  ]);
});

it('bounds each project and treats corrupt, stale-version, and oversized files as cache misses', async () => {
  const cache = createStoryNarrationCache(directory)('/projects/a');
  await cache.write(
    new Map(Array.from({ length: 300 }, (_, i) => [key(i), `草稿 ${i}`])),
  );
  const entries = await cache.read(signal);
  expect(entries.size).toBe(256);
  expect(entries.has(key(0))).toBe(false);
  expect(entries.get(key(299))).toBe('草稿 299');
  const [file] = await readdir(directory);
  if (!file) throw new Error('Expected persisted cache');
  for (const contents of [
    '{incomplete',
    '{"version":2,"entries":[]}',
    'x'.repeat(1024 * 1024 + 1),
  ]) {
    await writeFile(path.join(directory, file), contents);
    expect(await cache.read(signal)).toEqual(new Map());
  }
  await cache.write(
    new Map([
      ['not-a-hash', '忽略坏的键'],
      [key(0), 'x'.repeat(601)],
      [key(3), '恢复后的草稿'],
    ]),
  );
  expect(await cache.read(signal)).toEqual(new Map([[key(3), '恢复后的草稿']]));
});
