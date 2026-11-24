import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  readModelDirectory,
  writeModelDirectory,
} from '@evidence-poc/evidence-model-io';
import { API_FIXTURES } from '@evidence-poc/evidence-api/testing';
import { buildDelivery, renderOutputs } from '@evidence-poc/evidence-api';
import { runDiff } from '../commands.js';

it('compares model directories as JSON or Markdown without touching inputs', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'api-diff-'));
  try {
    const root = `${API_FIXTURES}full-lifecycle/fm`;
    const { document } = await readModelDirectory(root);
    const target = path.join(directory, 'current');
    await writeModelDirectory(target, document);
    const manifest = path.join(target, 'model.json');
    const original = readFileSync(manifest, 'utf8');
    const options = {
      base: root,
      target,
      format: 'json',
    } as const;
    const same = await runDiff(options);
    expect(same.exitCode).toBe(0);
    expect(same.output).toMatchObject({
      hasBreakingChanges: false,
      changes: [],
      details: {},
    });
    const summary = await runDiff({ ...options, format: 'markdown' });
    expect(typeof summary.output).toBe('string');
    expect(readFileSync(manifest, 'utf8')).toBe(original);
    document.manifest.id = 'other';
    await writeModelDirectory(target, document);
    expect((await runDiff(options)).exitCode).toBe(2);
    writeFileSync(manifest, 'not json');
    expect((await runDiff(options)).exitCode).toBe(2);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it('returns a tool failure distinct from a breaking change', async () => {
  vi.stubEnv('EVIDENCE_OASDIFF_BIN', '/missing/oasdiff');
  try {
    const root = `${API_FIXTURES}full-lifecycle/fm`;
    const result = await runDiff({
      base: root,
      target: root,
      format: 'json',
    });
    expect(result.exitCode).toBe(2);
    expect(result.error).toContain('oasdiff failed');
    expect(result.output).toBeNull();
  } finally {
    vi.unstubAllEnvs();
  }
});

it.each([
  ['', 'API_DIFF_INPUT_REQUIRED: base'],
  ['relative', 'PATH_NOT_ABSOLUTE: base must be an absolute path'],
])('refuses an invalid diff base %j', async (base, error) => {
  expect(
    await runDiff({ base, target: path.resolve('target'), format: 'json' }),
  ).toEqual({ exitCode: 2, error, output: null });
});

it('compares exported service contracts without re-projecting them', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'api-service-diff-'));
  try {
    const { document } = await readModelDirectory(
      `${API_FIXTURES}full-lifecycle/fm`,
    );
    const outputs = renderOutputs(buildDelivery(document));
    const base = path.join(directory, 'baseline.json');
    const target = path.join(directory, 'candidate.json');
    writeFileSync(
      base,
      outputs['services/service.product-procurement/openapi.json']!,
    );
    const options = { base, target, format: 'json' } as const;
    expect(
      await runDiff({ ...options, target: `${API_FIXTURES}full-lifecycle/fm` }),
    ).toMatchObject({
      exitCode: 2,
      error: expect.stringContaining('API_DIFF_INPUT_MISMATCH'),
    });
    expect(await runDiff({ ...options, target: base })).toMatchObject({
      exitCode: 0,
      output: { hasBreakingChanges: false },
    });
    const candidate = JSON.parse(readFileSync(base, 'utf8'));
    delete candidate.paths['/product-procurements'].post;
    writeFileSync(target, JSON.stringify(candidate));
    expect(await runDiff({ ...options, format: 'markdown' })).toMatchObject({
      exitCode: 1,
      output: expect.stringContaining('/product-procurements'),
    });
    writeFileSync(target, outputs['openapi.json']!);
    expect(await runDiff(options)).toMatchObject({
      exitCode: 2,
      error: expect.stringContaining('API_SERVICE_MISMATCH'),
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
