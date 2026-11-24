import { describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { readModelRoot } from '@evidence-poc/evidence-model-io';
import type { LiveDeliveryInput } from '@evidence-poc/desktop-contracts/delivery';
import { EVIDENCE_IPC_CHANNELS } from '@evidence-poc/desktop-contracts/ipc';

const handlers = new Map<string, (...args: unknown[]) => unknown>();
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) =>
      handlers.set(channel, handler),
  },
}));
const { registerDeliveryIpc } = await import('./deliveryIpc');
const input = async (): Promise<LiveDeliveryInput> => {
  const document = (
    await readModelRoot(
      path.resolve(
        import.meta.dirname,
        '../../../../libs/evidence-api/tests/fixtures/full-lifecycle/fm',
      ),
    )
  ).document;
  return {
    rootPath: path.resolve('/not-on-disk'),
    revision: 7,
    document,
    baseDocument: structuredClone(document),
  };
};
const invoke = (value: unknown) =>
  handlers.get(EVIDENCE_IPC_CHANNELS.deliveryLivePreview)!(
    { sender: {} },
    value,
  );

describe('live delivery IPC', () => {
  it('only registers a read-only preview and projects unsaved edits', async () => {
    registerDeliveryIpc();
    expect([...handlers.keys()]).toEqual([
      EVIDENCE_IPC_CHANNELS.deliveryLivePreview,
    ]);
    const value = await input();
    value.document.entities.find(
      (entity) => entity.id === 'contract.product-procurement',
    )!.label = '新合同';
    expect(await invoke({ ...value, includeArtifacts: true })).toMatchObject({
      success: true,
      analysis: {
        revision: 7,
        diff: expect.any(Object),
        artifacts: expect.arrayContaining([
          expect.objectContaining({ path: 'openapi.json' }),
          expect.objectContaining({ path: 'draft-status.json' }),
        ]),
      },
    });
  });

  it('keeps a malformed model envelope out and reports an attributed draft diagnostic without diffing', async () => {
    registerDeliveryIpc();
    expect(await invoke(null)).toMatchObject({ success: false });
    const value = await input();
    const edge = value.document.relationships.find(
      ({ kind }) => kind === 'references',
    )!;
    edge.targetRef = 'missing.entity';
    expect(await invoke(value)).toMatchObject({
      success: true,
      analysis: {
        diff: null,
        issues: expect.arrayContaining([
          expect.objectContaining({ code: 'FM_INVALID', severity: 'block' }),
        ]),
      },
    });
  });
});
