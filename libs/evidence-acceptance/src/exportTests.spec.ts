import {
  mkdtempSync,
  renameSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { writeModelDirectory } from '@evidence-poc/evidence-model-io';
import { exportAcceptanceTests } from './exportTests.js';
import { suiteManifest } from './renderer/brunoSuite.js';
import { createAcceptanceModel } from '@evidence-poc/evidence-api/testing';

let root: string, fm: string, out: string;
const exportSuite = () => exportAcceptanceTests({ fm, out });
beforeEach(async () => {
  root = mkdtempSync(path.join(os.tmpdir(), 'evidence-acceptance-export-'));
  fm = path.join(root, 'model');
  out = path.join(root, 'generated-tests');
  await writeModelDirectory(fm, createAcceptanceModel());
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('exportAcceptanceTests', () => {
  it('exports a native Bruno collection deterministically from a model directory', async () => {
    await exportSuite();
    expect(readdirSync(out).sort()).toEqual([
      'bruno.json',
      'collection.bru',
      'environments',
      suiteManifest,
      'flows',
    ]);
    const manifest = readFileSync(path.join(out, suiteManifest), 'utf8');
    expect(JSON.parse(manifest).projection.flows[0].steps).toHaveLength(3);
    await exportSuite();
    expect(readFileSync(path.join(out, suiteManifest), 'utf8')).toBe(manifest);
    expect(readdirSync(fm)).not.toContain('validation');
  });
  it.each([
    ['int', '1857392817294827136', '1857392817294827137'],
    ['uint', '18446744073709551614', '18446744073709551615'],
  ] as const)(
    'exports exact %s derived assertions without bigint or number rounding',
    async (type, quantity, expected) => {
      const model = createAcceptanceModel();
      const request = model.entities.find(
        (entity) => entity.id === 'request.payment',
      );
      const confirmation = model.entities.find(
        (entity) => entity.id === 'confirmation.payment',
      );
      const quantityField = request?.attributes?.find(
        (attribute) => attribute.name === 'quantity',
      );
      const amountField = confirmation?.attributes?.find(
        (attribute) => attribute.name === 'total_amount',
      );
      const requestExample = request?.examples?.[0];
      const confirmationExample = confirmation?.examples?.[0];
      const rule = model.rules.find((item) => item.id === 'rule.total-amount');
      if (
        !quantityField ||
        !amountField ||
        !requestExample ||
        !confirmationExample ||
        !rule
      ) {
        throw new Error('Incomplete acceptance fixture');
      }
      quantityField.valueType = type;
      requestExample.value.quantity = quantity;
      amountField.valueType = type;
      confirmationExample.value.total_amount = expected;
      rule.expression = `request.quantity + ${type === 'uint' ? '1u' : '1'}`;
      rule.resultType = type;
      await writeModelDirectory(fm, model);

      await exportSuite();
      const dir = path.join(out, 'flows/flow-001');
      const requests = readdirSync(dir)
        .filter((file) => /^\d/.test(file))
        .sort();
      expect(readFileSync(path.join(dir, requests[1]!), 'utf8')).toContain(
        `"quantity": "${quantity}"`,
      );
      expect(readFileSync(path.join(dir, requests[2]!), 'utf8')).toContain(
        `eq "${expected}"`,
      );
    },
  );

  it('replaces artifacts from earlier exports', async () => {
    await exportSuite();
    writeFileSync(path.join(out, 'acceptance.stepci.yml'), 'old');
    await exportSuite();
    expect(readdirSync(out)).not.toContain('acceptance.stepci.yml');
  });
  it('does not replace an existing suite when model validation fails', async () => {
    await exportSuite();
    const before = readFileSync(path.join(out, suiteManifest), 'utf8');
    const model = createAcceptanceModel();
    model.entities.find(
      (entity) => entity.id === 'confirmation.payment',
    )!.examples![0]!.value.total_amount = 501;
    await writeModelDirectory(fm, model);
    await expect(exportSuite()).rejects.toThrow('disagrees');
    expect(readFileSync(path.join(out, suiteManifest), 'utf8')).toBe(before);
  });
  it('refuses missing sources and models without executable examples', async () => {
    rmSync(fm, { recursive: true });
    await expect(exportSuite()).rejects.toThrow('model.json is required');
    const model = createAcceptanceModel();
    for (const entity of model.entities) entity.examples = [];
    await writeModelDirectory(fm, model);
    await expect(exportSuite()).rejects.toThrow(
      'no examples with test metadata',
    );
  });
  it('surfaces invalid JSON and does not create output directories', async () => {
    writeFileSync(path.join(fm, 'model.json'), '{bad');
    await expect(exportSuite()).rejects.toThrow();
    expect(readdirSync(root)).toEqual(['model']);
  });
  it('rejects a file input without changing the existing suite', async () => {
    await exportSuite();
    const manifest = path.join(out, suiteManifest);
    const before = readFileSync(manifest, 'utf8');
    renameSync(fm, path.join(root, 'model-tree'));
    writeFileSync(fm, '{}');
    await expect(exportSuite()).rejects.toThrow();
    expect(readFileSync(manifest, 'utf8')).toBe(before);
    expect(readFileSync(fm, 'utf8')).toBe('{}');
  });
});
