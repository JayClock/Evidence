import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { fullLifecycleIndex } from '../testing/fixtures.js';
import { planContextDelivery } from './contextDelivery.js';
import {
  contextOutputDirectory,
  verifyContextDelivery,
  writeContextDelivery,
} from './contextDeliveryOutput.js';

let root: string;
let out: string;
beforeEach(() => {
  root = mkdtempSync(path.join(realpathSync(tmpdir()), 'context-delivery-'));
  out = contextOutputDirectory(root);
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

it('updates ready outputs, retains blocked bytes, and restores the complete gateway on repair', async () => {
  const model = structuredClone((await fullLifecycleIndex()).document);
  const complete = await planContextDelivery(model);
  expect(writeContextDelivery(out, complete)).toMatchObject({
    synced: 4,
    blocked: 0,
  });
  expect(writeContextDelivery(out, complete).changedFiles).toEqual([]);
  const procurement = path.join(
    out,
    'services/context.product-procurement/openapi.json',
  );
  const before = readFileSync(procurement);
  const rule = model.rules.find(
    ({ contextRef }) => contextRef === 'context.product-procurement',
  )!;
  const expression = rule.expression;
  rule.expression = '(';
  const partial = await planContextDelivery(model);
  expect(writeContextDelivery(out, partial)).toMatchObject({
    synced: 3,
    blocked: 1,
  });
  expect(readFileSync(procurement)).toEqual(before);
  const gateway = path.join(out, 'openapi.json');
  expect(JSON.parse(readFileSync(gateway, 'utf8'))).toMatchObject({
    'x-evidence-delivery-state': 'partial',
  });
  expect(verifyContextDelivery(out, partial)).toEqual([]);
  writeFileSync(gateway, '{}');
  expect(verifyContextDelivery(out, partial)).toEqual(['openapi.json']);
  rule.expression = expression;
  expect(
    writeContextDelivery(out, await planContextDelivery(model)),
  ).toMatchObject({ synced: 4, blocked: 0 });
  expect(readdirSync(out).sort()).toEqual([
    'delivery-status.json',
    'openapi.json',
    'services',
  ]);
  expect(
    JSON.parse(readFileSync(gateway, 'utf8'))['x-evidence-delivery-state'],
  ).toBe('complete');
});

it('rejects project escapes, symlinked artifacts and an output owned by another model source', async () => {
  const { document } = await fullLifecycleIndex();
  const plan = await planContextDelivery(document);
  const source = path.join(root, 'one.evidence.json');
  expect(() => contextOutputDirectory(root, '../other')).toThrow(
    'DELIVERY_UNSAFE_OUTPUT',
  );
  expect(() => contextOutputDirectory(root, '.evidence/fm')).toThrow(
    'DELIVERY_UNSAFE_OUTPUT',
  );
  expect(() => contextOutputDirectory(root, '.git/hooks')).toThrow(
    'DELIVERY_UNSAFE_OUTPUT',
  );
  writeContextDelivery(out, plan, source);
  expect(() =>
    writeContextDelivery(out, plan, path.join(root, 'two.evidence.json')),
  ).toThrow('DELIVERY_MODEL_MISMATCH');
  if (process.platform === 'win32') return; // Creating symlinks requires Windows developer mode.
  const gateway = path.join(out, 'openapi.json');
  writeFileSync(source, 'model source');
  rmSync(gateway);
  symlinkSync(source, gateway);
  expect(() => writeContextDelivery(out, plan, source)).toThrow(
    'DELIVERY_UNSAFE_OUTPUT',
  );
  expect(readFileSync(source, 'utf8')).toBe('model source');
  expect(readdirSync(out).sort()).toEqual([
    'delivery-status.json',
    'openapi.json',
    'services',
  ]);
});
