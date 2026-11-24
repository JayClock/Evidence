import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { watchModelSource, type ModelWatcher } from './modelWatcher';

describe('model source watching (real filesystem)', () => {
  let root: string;
  let watcher: ModelWatcher | undefined;
  let batches: readonly string[][];

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'evidence-watch-'));
    batches = [];
  });
  afterEach(async () => {
    await watcher?.close();
    await rm(root, { recursive: true, force: true });
  });
  const start = async (source: string) => {
    watcher = watchModelSource(
      source,
      (paths) => {
        batches = [...batches, [...paths]];
      },
      100,
    );
    await watcher.ready;
  };
  const seen = () => batches.flat();
  const received = async (file: string) => {
    await expect.poll(() => seen(), { timeout: 5000 }).toContain(file);
  };

  it('ignores initial discovery and non-model files, but sees nested sources', async () => {
    const fm = path.join(root, 'fm');
    await mkdir(path.join(fm, 'entities', 'nested'), { recursive: true });
    await writeFile(path.join(fm, 'model.json'), '{}');
    await start(fm);
    await delay(400);
    expect(batches).toEqual([]);
    await writeFile(path.join(fm, 'README.md'), 'ignored');
    await writeFile(path.join(fm, 'entities', 'notes.txt'), 'ignored');
    await writeFile(path.join(root, 'unrelated.json'), '{}');
    const entity = path.join(fm, 'entities', 'nested', 'one.json');
    await writeFile(entity, '{}');
    await received(entity);
    expect(seen()).toEqual([entity]);
    await rm(entity);
    await expect.poll(() => batches.length, { timeout: 5000 }).toBe(2);
  });

  it('discovers a missing root and survives deletion and recreation of the tree', async () => {
    const fm = path.join(root, 'absent', '.evidence', 'model');
    await start(fm);
    const rule = path.join(fm, 'rules', 'nested', 'one.json');
    const create = async () => {
      await mkdir(path.dirname(rule), { recursive: true });
      await writeFile(rule, '{}');
    };
    await create();
    await received(rule);
    await rm(fm, { recursive: true });
    await expect.poll(() => batches.length, { timeout: 5000 }).toBe(2);
    await create();
    await expect.poll(() => batches.length, { timeout: 5000 }).toBe(3);
    expect(batches[2]).toContain(rule);
  });

  it('coalesces rapid writes across files into one batch', async () => {
    const fm = path.join(root, 'fm');
    await mkdir(path.join(fm, 'entities'), { recursive: true });
    await start(fm);
    const a = path.join(fm, 'model.json');
    const b = path.join(fm, 'entities', 'one.json');
    for (let i = 0; i < 5; i++) {
      await Promise.all([writeFile(a, String(i)), writeFile(b, String(i))]);
      await delay(20);
    }
    await received(b);
    await delay(400);
    expect(batches).toEqual([[a, b].sort()]);
  });

  it('cancels pending notifications and releases resources on close', async () => {
    const model = path.join(root, '.evidence/model');
    await mkdir(model, { recursive: true });
    const manifest = path.join(model, 'model.json');
    await start(model);
    await writeFile(manifest, '{}');
    await delay(30);
    await watcher?.close();
    await watcher?.close();
    await writeFile(manifest, '{"changed":true}');
    await delay(500);
    expect(batches).toEqual([]);
  });
});
