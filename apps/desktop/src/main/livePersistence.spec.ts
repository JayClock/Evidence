import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEmptyDomainModel } from '@evidence-poc/evidence-schema';
import { createLivePersistence } from './livePersistence';

const saved = (sourceDigest: string) => ({
  success: true as const,
  sourceDigest,
  written: [],
  unchanged: [],
  removed: [],
  savedAt: 'now',
});

function setup() {
  vi.useFakeTimers();
  const write = vi.fn<Parameters<typeof createLivePersistence>[0]['write']>(
    async (doc) => saved(doc.manifest.name),
  );
  const options = {
    id: 'editor',
    rootPath: '/workspace',
    sourceDigest: 'base',
    write,
    publish: vi.fn(),
    committed: vi.fn(),
  };
  const lane = createLivePersistence(options);
  const enqueue = (revision: number) =>
    lane.enqueue({
      persistenceId: 'editor',
      revision,
      document: createEmptyDomainModel({ name: `revision-${revision}` }),
    });
  return { ...options, lane, enqueue };
}

afterEach(() => vi.useRealTimers());

describe('live persistence', () => {
  it('debounces in main, serializes active writes and retains the latest waiting revision', async () => {
    const { lane, write, enqueue, committed } = setup();
    let finish!: (result: ReturnType<typeof saved>) => void;
    write.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    enqueue(1);
    await vi.advanceTimersByTimeAsync(399);
    enqueue(2);
    await vi.advanceTimersByTimeAsync(399);
    expect(write).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(write).toHaveBeenCalledOnce();
    enqueue(3);
    enqueue(4);
    await vi.advanceTimersByTimeAsync(400);
    expect(write).toHaveBeenCalledOnce();
    finish(saved('first'));
    expect(await lane.flush()).toEqual({ success: true });
    expect(
      write.mock.calls.map(([doc, digest]) => [doc.manifest.name, digest]),
    ).toEqual([
      ['revision-2', 'base'],
      ['revision-4', 'first'],
    ]);
    expect(committed.mock.calls.map(([value]) => value.revision)).toEqual([
      2, 4,
    ]);
  });

  it('never flushes across an external conflict and keeps later edits queued', async () => {
    const { lane, write, enqueue, publish, committed } = setup();
    write.mockResolvedValueOnce({
      success: false,
      conflict: true,
      error: 'changed',
    });
    enqueue(1);
    await vi.advanceTimersByTimeAsync(400);
    enqueue(2);
    expect(await lane.flush()).toEqual({ success: false, error: 'changed' });
    expect(lane.hasPending()).toBe(true);
    expect(write).toHaveBeenCalledOnce();
    expect(committed).not.toHaveBeenCalled();
    expect(publish).toHaveBeenLastCalledWith({
      persistenceId: 'editor',
      kind: 'conflict',
      revision: 2,
      error: 'changed',
    });
  });

  it('flushes without waiting for the timer and can retry a failed write', async () => {
    const { lane, enqueue, write, committed } = setup();
    write.mockRejectedValueOnce(new Error('disk full'));
    enqueue(1);
    expect(await lane.flush()).toMatchObject({ success: false });
    expect(committed).not.toHaveBeenCalled();
    expect(await lane.flush()).toEqual({ success: true });
    expect(committed).toHaveBeenCalledOnce();
  });
});
