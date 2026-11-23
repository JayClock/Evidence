import {
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readModelRoot } from '@evidence-poc/evidence-model-io';
import {
  planContextDelivery,
  type ContextDeliveryPlan,
} from '@evidence-poc/evidence-api';
import { createContextDeliveryReactor } from './contextDeliveryReactor';

let directory: string;
let rootPath: string;
const documentOf = async () =>
  (
    await readModelRoot(
      path.resolve(
        import.meta.dirname,
        '../../../../libs/evidence-api/tests/fixtures/full-lifecycle/fm',
      ),
    )
  ).bundle;
beforeEach(() => {
  directory = mkdtempSync(
    path.join(realpathSync(tmpdir()), 'delivery-reactor-'),
  );
  rootPath = path.join(directory, 'model.evidence.json');
  writeFileSync(rootPath, 'disk must not be read');
});
afterEach(() => {
  vi.useRealTimers();
  rmSync(directory, { recursive: true, force: true });
});

it('uses the live editor snapshot automatically, respects configuration and restores a partial gateway', async () => {
  const document = await documentOf();
  const reactor = createContextDeliveryReactor({ delay: 1 });
  writeFileSync(
    path.join(directory, '.evidencerc.json'),
    JSON.stringify({ delivery: { outDir: 'generated/contracts' } }),
  );
  const gateway = path.join(directory, 'generated/contracts/openapi.json');
  const local = path.join(
    directory,
    'generated/contracts/services/context.product-procurement/openapi.json',
  );
  const publish = vi.fn();
  reactor.schedule(1, { rootPath, revision: 1, document }, publish);
  await vi.waitFor(() =>
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        revision: 1,
        result: expect.objectContaining({ kind: 'synced', synced: 4 }),
      }),
    ),
  );
  const before = readFileSync(local);
  const draft = structuredClone(document);
  draft.rules.find(
    ({ contextRef }) => contextRef === 'context.product-procurement',
  )!.expression = '(';
  reactor.schedule(1, { rootPath, revision: 2, document: draft }, publish);
  await vi.waitFor(() =>
    expect(publish).toHaveBeenLastCalledWith(
      expect.objectContaining({
        revision: 2,
        result: expect.objectContaining({ kind: 'synced', blocked: 1 }),
      }),
    ),
  );
  expect(readFileSync(local)).toEqual(before);
  expect(
    JSON.parse(readFileSync(gateway, 'utf8'))['x-evidence-delivery-state'],
  ).toBe('partial');
  reactor.schedule(1, { rootPath, revision: 3, document }, publish);
  await vi.waitFor(() =>
    expect(publish).toHaveBeenLastCalledWith(
      expect.objectContaining({
        revision: 3,
        result: expect.objectContaining({ kind: 'synced', blocked: 0 }),
      }),
    ),
  );
  expect(
    JSON.parse(readFileSync(gateway, 'utf8'))['x-evidence-delivery-state'],
  ).toBe('complete');
  expect(readFileSync(rootPath, 'utf8')).toBe('disk must not be read');
});

it('discards superseded plans and cancels writes when an editor detaches', async () => {
  const document = await documentOf();
  const projection = await planContextDelivery(document);
  vi.useFakeTimers();
  const resolvers: ((plan: ContextDeliveryPlan) => void)[] = [];
  const plan = vi.fn(
    () =>
      new Promise<ContextDeliveryPlan>((resolve) => resolvers.push(resolve)),
  );
  const write = vi.fn(() => ({
    directory,
    synced: 4,
    blocked: 0,
    changedFiles: [],
  }));
  const publish = vi.fn();
  const reactor = createContextDeliveryReactor({ plan, write });
  reactor.schedule(1, { rootPath, revision: 1, document }, publish);
  reactor.schedule(1, { rootPath, revision: 2, document }, publish);
  await vi.advanceTimersByTimeAsync(500);
  expect(plan).toHaveBeenCalledOnce();
  reactor.schedule(1, { rootPath, revision: 3, document }, publish);
  resolvers[0]!(projection);
  await vi.advanceTimersByTimeAsync(500);
  expect(write).not.toHaveBeenCalled();
  reactor.cancel(1, rootPath);
  resolvers[1]!(projection);
  await vi.advanceTimersByTimeAsync(0);
  expect(write).not.toHaveBeenCalled();
  expect(publish).not.toHaveBeenCalled();
});
