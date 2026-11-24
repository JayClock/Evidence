import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as modelIo from '@evidence-poc/evidence-model-io';
import { vi } from 'vitest';

import { buildFmCheckReport } from '@evidence-poc/evidence-model-core';
import {
  modelDigestOf,
  readModelRoot,
  readModelRootBytes,
} from '@evidence-poc/evidence-model-io';

import {
  checkReportProblem,
  digestBytes,
  loadModel,
  loadModelFromDocument,
  partyRolesPlayedByParticipants,
} from './adapter/modelAdapter.js';
import { inspectSummary } from './inspect.js';

const modelDirectory = fileURLToPath(
  new URL('../tests/fixtures/full-lifecycle/fm', import.meta.url),
);

/** The check report the FM stage would have handed over. */
const checkReportOf = async (root: string) => {
  const { document, issues } = await readModelRoot(root);
  const bytes = await readModelRootBytes(root);
  const { report } = buildFmCheckReport({
    model: document,
    sourceIssues: issues.map((issue) => `${issue.path}: ${issue.message}`),
    modelDigest: modelDigestOf(
      bytes.map((file) => ({ path: file.path, content: file.bytes })),
    ),
    scopeRefs: ['context.product-procurement'],
  });

  return report;
};

describe('digestBytes', () => {
  it('hashes the bytes without a prefix, unlike the model digest', () => {
    expect(digestBytes('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('checkReportProblem', () => {
  const ready = {
    checkVersion: 6,
    consistent: true,
    complete: true,
    valid: true,
    inputChanged: false,
    modelValidated: true,
    errors: [],
    modelDigest: 'sha256:abc',
  };

  it('accepts a report that proves a delivered scope', () => {
    expect(checkReportProblem(ready)).toBeNull();
  });

  it('refuses consistency without completeness or a digest', () => {
    expect(checkReportProblem(undefined)).toBeNull();
    expect(checkReportProblem(null)).toBeNull();
    for (const broken of [
      { ...ready, checkVersion: 4 },
      { ...ready, consistent: false },
      { ...ready, complete: false },
      { ...ready, inputChanged: true },
      { ...ready, modelValidated: false },
      { ...ready, errors: ['boom'] },
      { ...ready, modelDigest: undefined },
      {},
    ]) {
      expect(checkReportProblem(broken)).not.toBeNull();
    }
  });
});

describe('loadModel', () => {
  it('indexes the checked model and its inline examples', async () => {
    const check = await checkReportOf(modelDirectory);
    const { index, diagnostics } = await loadModel(modelDirectory, check);

    expect(diagnostics).toEqual([]);
    expect(index?.compiled.entities.length).toBeGreaterThan(0);
    expect([...(index?.entities.keys() ?? [])][0]).toBe(
      [...(index?.entities.keys() ?? [])].sort()[0],
    );
    expect(
      Object.keys(index?.files ?? {}).some((file) =>
        file.startsWith('validation/'),
      ),
    ).toBe(false);
  });

  it('keeps the current model when its saved report is stale', async () => {
    const check = await checkReportOf(modelDirectory);
    const { index, diagnostics } = await loadModel(modelDirectory, {
      ...check,
      modelDigest: 'sha256:0000',
    });

    expect(index).not.toBeNull();
    expect(diagnostics).toEqual([
      expect.objectContaining({ code: 'FM_CHECK_STALE', severity: 'gap' }),
    ]);
  });

  it('refuses a directory that is not a model', async () => {
    const { index, diagnostics } = await loadModel(
      fileURLToPath(new URL('./fixtures-not-a-model', import.meta.url)),
      {},
    );

    expect(index).toBeNull();
    expect(diagnostics[0]?.code).toBe('FM_INVALID');
  });

  it('keeps an invalid report visible without treating it as a passing check', async () => {
    const { index, diagnostics } = await loadModel(modelDirectory, {
      checkVersion: 5,
    });
    expect(index?.check).toEqual({ checkVersion: 5 });

    expect(diagnostics).toEqual([
      expect.objectContaining({ code: 'FM_CHECK_INVALID', severity: 'gap' }),
    ]);
  });
});

describe('loadModelFromDocument', () => {
  it('indexes an in-memory document and its inline examples without a fake check', async () => {
    const { document } = await readModelRoot(modelDirectory);
    const original = JSON.stringify(document);
    const { index, diagnostics } = loadModelFromDocument(document);
    expect(diagnostics).toEqual([]);
    expect(index?.check).toBeNull();
    expect(index?.entities.size).toBe(document.entities.length);
    expect(index?.modelDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(loadModelFromDocument(document).index?.modelDigest).toBe(
      index?.modelDigest,
    );
    expect(JSON.stringify(document)).toBe(original);
    const edited = {
      ...document,
      manifest: { ...document.manifest, name: 'Edited' },
    };
    expect(loadModelFromDocument(edited).index?.modelDigest).not.toBe(
      index?.modelDigest,
    );
  });

  it('pins indexed inputs and fingerprints inline example edits', async () => {
    const { document } = await readModelRoot(modelDirectory);
    const loaded = loadModelFromDocument(document).index!;
    const originalName = loaded.document.manifest.name;
    document.manifest.name = 'Later edit';
    expect(loaded.document.manifest.name).toBe(originalName);
    const next = structuredClone(document);
    next.entities[0]!.examples = [{ label: 'Updated example', value: {} }];
    expect(loadModelFromDocument(next).index?.modelDigest).not.toBe(
      loadModelFromDocument(document).index?.modelDigest,
    );
  });

  it('reads directories without a check report and refuses a file source', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'api-input-'));
    try {
      const file = path.join(directory, 'model.evidence.json');
      writeFileSync(file, '{}');
      const tree = await loadModel(modelDirectory);
      expect(tree.diagnostics).toEqual([]);
      expect(tree.index?.check).toBeNull();
      expect((await loadModel(file)).index).toBeNull();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('still refuses a source that changes during a read', async () => {
    const original = modelIo.readModelRootBytes;
    const spy = vi.spyOn(modelIo, 'readModelRootBytes');
    spy
      .mockImplementationOnce(original)
      .mockImplementationOnce(async (root) => [
        ...(await original(root)),
        { path: 'changed.txt', bytes: Buffer.from('changed') },
      ]);
    try {
      const result = await loadModel(modelDirectory);
      expect(result.index).toBeNull();
      expect(result.diagnostics[0]?.code).toBe('SOURCE_CHANGED');
    } finally {
      spy.mockRestore();
    }
  });
});

describe('partyRolesPlayedByParticipants', () => {
  it('counts only Party Roles an actual Participant Party plays', async () => {
    const { index } = await loadModel(
      modelDirectory,
      await checkReportOf(modelDirectory),
    );
    const played = partyRolesPlayedByParticipants(
      index as NonNullable<typeof index>,
    );

    expect([...played].sort()).toEqual(['role.buyer', 'role.seller']);
  });
});

describe('inspectSummary', () => {
  it('reports the inventory inspect prints, with nulls kept visible', async () => {
    const { index } = await loadModel(
      modelDirectory,
      await checkReportOf(modelDirectory),
    );
    const summary = inspectSummary(index as NonNullable<typeof index>);

    expect(summary.schemaVersion).toBe('6.0');
    expect(summary.contexts).toEqual([
      'context.product-catalog',
      'context.product-procurement',
      'context.product-sourcing',
      'context.wechat-payment',
    ]);
    expect(summary.roles).toHaveLength(5);
    expect(summary.resourceClues).toHaveLength(19);
    expect(summary.playedPartyRoles).toEqual(['role.buyer', 'role.seller']);
    expect(summary.unplayedPartyRoles).toEqual([
      'role.wechat-provider',
      'role.wechat-user',
    ]);
    // A Participant Party sits outside every Context, and the report says so.
    expect(
      summary.resourceClues.find((entry) => entry.id === 'party.buyer-agent'),
    ).toEqual({
      id: 'party.buyer-agent',
      label: '甲方采购员',
      kind: 'party',
      category: 'participant',
      contextRef: null,
    });
    // Roles print without a category: the list is already only roles.
    expect(summary.roles[0]).not.toHaveProperty('category');
    expect(summary.testExamples).toEqual([]);
  });
});
