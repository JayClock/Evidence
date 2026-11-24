import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  initializeWorkspace,
  readModelRoot,
} from '@evidence-poc/evidence-model-io';
import {
  planContextDelivery,
  type ContextDeliveryPlan,
} from '@evidence-poc/evidence-api';
import { createArtifactPipeline } from './artifactPipeline';
import { createLivePersistence } from './livePersistence';
import { createProjectStore } from './projectStore';

let root: string;
beforeEach(async () => {
  root = await realpath(
    await mkdtemp(path.join(tmpdir(), 'evidence-artifacts-')),
  );
});
afterEach(async () => rm(root, { recursive: true, force: true }));

const example = async (relative: string) =>
  (
    await readModelRoot(
      path.resolve(import.meta.dirname, '../../../../', relative),
    )
  ).document;

it('writes API and Bruno outputs from the same persisted revision, blocks bad CEL and preserves prior products', async () => {
  const document = await example('examples/b2b-escrow/.evidence/model');
  const workspace = await initializeWorkspace(root, document);
  const store = createProjectStore({
    recentProjectsFile: path.join(root, 'recents.json'),
  });
  const digest = (await store.fingerprint(root))!;
  const pipeline = createArtifactPipeline({ fingerprint: store.fingerprint });
  const status = vi.fn();
  let revision = 0;
  const editor = createLivePersistence({
    id: 'editor',
    rootPath: root,
    sourceDigest: digest,
    write: (model, base) => store.write(root, model, base),
    publish: vi.fn(),
    committed(snapshot) {
      revision = snapshot.revision;
      pipeline.schedule({
        snapshot,
        isCurrent: () => revision === snapshot.revision,
        publish: status,
      });
    },
  });
  const manifest = path.join(workspace.acceptance, 'evidence-acceptance.json');
  const gateway = path.join(workspace.delivery, 'openapi.json');
  editor.enqueue({ persistenceId: 'editor', revision: 1, document });
  await expect(readFile(gateway)).rejects.toMatchObject({ code: 'ENOENT' });
  expect(status).not.toHaveBeenCalled();
  expect(await editor.flush()).toEqual({ success: true });
  await pipeline.drain();
  expect(status).toHaveBeenLastCalledWith(
    expect.objectContaining({
      sourceDigest: digest,
      revision: 1,
      delivery: expect.objectContaining({ kind: 'synced', blocked: 0 }),
      acceptance: expect.objectContaining({ kind: 'synced' }),
      sensors: expect.objectContaining({ kind: 'checked' }),
    }),
  );
  const previous = await readFile(manifest);
  const draft = structuredClone(document);
  draft.rules[0]!.expression = 'true && (';
  editor.enqueue({ persistenceId: 'editor', revision: 2, document: draft });
  expect(await editor.flush()).toEqual({ success: true });
  await pipeline.drain();
  expect(status).toHaveBeenLastCalledWith(
    expect.objectContaining({
      revision: 2,
      acceptance: expect.objectContaining({ kind: 'blocked' }),
      sensors: expect.objectContaining({
        kind: 'checked',
        report: expect.objectContaining({ passed: false }),
      }),
    }),
  );
  expect(await readFile(manifest)).toEqual(previous);
  expect(
    JSON.parse(await readFile(gateway, 'utf8'))['x-evidence-delivery-state'],
  ).toBe('partial');

  // A user-created file in the generated tree must never disappear during autosync.
  await writeFile(
    path.join(workspace.acceptance, 'notes.md'),
    'hand-maintained',
  );
  editor.enqueue({ persistenceId: 'editor', revision: 3, document });
  expect(await editor.flush()).toEqual({ success: true });
  await pipeline.drain();
  expect(status).toHaveBeenLastCalledWith(
    expect.objectContaining({
      revision: 3,
      acceptance: expect.objectContaining({ kind: 'failed' }),
    }),
  );
  expect(
    await readFile(path.join(workspace.acceptance, 'notes.md'), 'utf8'),
  ).toBe('hand-maintained');
}, 20000);

it('drops the outputs of a superseded pending plan even if it completes', async () => {
  const document = await example(
    'libs/evidence-api/tests/fixtures/full-lifecycle/fm',
  );
  await initializeWorkspace(root, document);
  const projection = await planContextDelivery(document);
  const writeDelivery = vi.fn(() => ({
    directory: root,
    synced: 4,
    blocked: 0,
    changedFiles: [],
  }));
  let completeFirst!: (plan: ContextDeliveryPlan) => void;
  const plan = vi
    .fn(async () => projection)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          completeFirst = resolve;
        }),
    );
  const status = vi.fn();
  let current = 1;
  const pipeline = createArtifactPipeline({
    fingerprint: async () => 'same',
    writeDelivery,
    plan,
  });
  const schedule = (revision: number) =>
    pipeline.schedule({
      snapshot: {
        persistenceId: 'editor',
        rootPath: root,
        revision,
        sourceDigest: 'same',
        document,
      },
      isCurrent: () => current === revision,
      publish: status,
    });
  schedule(1);
  await vi.waitFor(() => expect(plan).toHaveBeenCalledOnce());
  current = 2;
  schedule(2);
  completeFirst(projection);
  await pipeline.drain();
  expect(writeDelivery).toHaveBeenCalledOnce();
  expect(status).toHaveBeenLastCalledWith(
    expect.objectContaining({ revision: 2 }),
  );
});
