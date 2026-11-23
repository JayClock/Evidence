import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { serializeModelBundle } from '@evidence-poc/evidence-model-core';
import { writeModelDirectory } from '@evidence-poc/evidence-model-io';
import { exportAcceptanceTests } from './exportTests.js';
import { suiteManifest } from './renderer/brunoSuite.js';
import { createAcceptanceModel } from '@evidence-poc/evidence-api/testing';

let root: string, fm: string, out: string;
const exportSuite = () => exportAcceptanceTests({ fm, out });
beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), 'evidence-acceptance-export-'));
  fm = path.join(root, 'model.evidence.json');
  out = path.join(root, 'generated-tests');
  writeFileSync(fm, serializeModelBundle(createAcceptanceModel()));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('exportAcceptanceTests', () => {
  it('exports a native Bruno collection deterministically from a bundle or source tree', async () => {
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
    fm = path.join(root, 'fm');
    await writeModelDirectory(fm, createAcceptanceModel());
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
      writeFileSync(fm, serializeModelBundle(model));

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
    writeFileSync(fm, serializeModelBundle(model));
    await expect(exportSuite()).rejects.toThrow('disagrees');
    expect(readFileSync(path.join(out, suiteManifest), 'utf8')).toBe(before);
  });
  it('refuses missing sources and models without executable examples', async () => {
    rmSync(fm);
    await expect(exportSuite()).rejects.toThrow('ENOENT');
    const model = createAcceptanceModel();
    for (const entity of model.entities) entity.examples = [];
    writeFileSync(fm, serializeModelBundle(model));
    await expect(exportSuite()).rejects.toThrow(
      'no examples with test metadata',
    );
  });
  it('surfaces invalid JSON and does not create output directories', async () => {
    writeFileSync(fm, '{bad');
    await expect(exportSuite()).rejects.toThrow();
    expect(readdirSync(root)).toEqual(['model.evidence.json']);
  });
  it('refuses legacy test envelopes and leaves the exported suite untouched', async () => {
    await exportSuite();
    const file = path.join(out, suiteManifest);
    const before = readFileSync(file, 'utf8');
    const legacy = {
      ...JSON.parse(serializeModelBundle(createAcceptanceModel())),
      validation: { instances: [], scenarios: [] },
    };
    writeFileSync(fm, JSON.stringify(legacy));
    await expect(exportSuite()).rejects.toThrow('no longer supported');
    expect(readFileSync(file, 'utf8')).toBe(before);
  });
});
