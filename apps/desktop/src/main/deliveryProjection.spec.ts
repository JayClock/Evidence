import { describe, expect, it } from 'vitest';
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { deliveryFilesOf, readDelivery } from './deliveryProjection';

const modelRoot = path.resolve(
  import.meta.dirname,
  '../../../../libs/evidence-api/tests/fixtures/full-lifecycle/fm',
);

describe('live delivery inputs', () => {
  it('builds a deterministic draft snapshot from a model directory', async () => {
    const files = deliveryFilesOf(await readDelivery(modelRoot));
    expect(deliveryFilesOf(await readDelivery(modelRoot))).toEqual(files);
    const snapshot = JSON.parse(
      files.find((item) => item.path === 'projection.json')!.content,
    );
    expect(snapshot.schemaVersion).toBe('7.0');
    expect(snapshot.mode).toBe('draft');
    expect(snapshot.digests.model).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(snapshot.digests.checkReport).toBeUndefined();
    expect(snapshot.diagnostics).toEqual([]);
  });

  it('does not export malformed or statically inconsistent model inputs', async () => {
    const directory = await mkdtemp(
      path.join(tmpdir(), 'desktop-api-invalid-'),
    );
    try {
      await cp(modelRoot, directory, { recursive: true });
      const manifest = path.join(directory, 'model.json');
      await writeFile(manifest, '{');
      await expect(readDelivery(directory)).rejects.toThrow('invalid JSON');
      await cp(path.join(modelRoot, 'model.json'), manifest);
      await writeFile(
        path.join(directory, 'entities', 'unresolved-role.json'),
        JSON.stringify({
          type: 'entity',
          category: 'role',
          kind: 'party',
          id: 'role.unresolved',
          label: 'Unresolved',
          contextRef: 'context.missing',
        }),
      );
      await expect(readDelivery(directory)).rejects.toThrow();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
