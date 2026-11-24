import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
  symlinkSync,
  statSync,
  mkdirSync,
  cpSync,
  realpathSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, expect, it } from 'vitest';
import {
  initializeWorkspace,
  readModelBundle,
  workspacePaths,
  writeModelDirectory,
} from '@evidence-poc/evidence-model-io';
import { dispatch } from '../router.js';

const source = fileURLToPath(
  new URL(
    '../../../../libs/evidence-model-core/tests/fixtures/acceptance/procurement.evidence.json',
    import.meta.url,
  ),
);
let root: string;
let paths: ReturnType<typeof workspacePaths>;
beforeEach(async () => {
  root = realpathSync(mkdtempSync(path.join(tmpdir(), 'evidence-export-')));
  paths = await initializeWorkspace(
    root,
    (await readModelBundle(source)).document,
  );
});
afterEach(() => rmSync(root, { recursive: true, force: true }));
const context = () => ({
  cwd: root,
  stdout: () => undefined,
  stderr: () => undefined,
  color: false,
});

it('exports validated contracts and native acceptance together, deterministically', async () => {
  const args = ['export'];
  expect(await dispatch(args, context())).toBe(0);
  const out = paths.acceptance;
  expect(readdirSync(out).sort()).toEqual([
    'bruno.json',
    'collection.bru',
    'environments',
    'evidence-acceptance.json',
    'flows',
  ]);
  const before = readFileSync(path.join(paths.release, 'openapi.json'), 'utf8');
  expect(JSON.parse(before).openapi).toBe('3.1.0');
  expect(await dispatch(args, context())).toBe(0);
  expect(readFileSync(path.join(paths.release, 'openapi.json'), 'utf8')).toBe(
    before,
  );
});
it('selects individual artifacts without stale mixed generations or a format switch', async () => {
  expect(await dispatch(['export', '--openapi'], context())).toBe(0);
  expect(readdirSync(paths.release)).toEqual(['openapi.json']);
  expect(
    await dispatch(['export', '--tests', '--format', 'bruno'], context()),
  ).toBe(1);
  expect(await dispatch(['export', '--tests'], context())).toBe(0);
  expect(readdirSync(paths.acceptance).sort()).toEqual([
    'bruno.json',
    'collection.bru',
    'environments',
    'evidence-acceptance.json',
    'flows',
  ]);
});
it('leaves previous output intact if acceptance compilation fails', async () => {
  expect(await dispatch(['export'], context())).toBe(0);
  const suite = path.join(paths.acceptance, 'evidence-acceptance.json');
  const before = readFileSync(suite, 'utf8');
  const broken = (await readModelBundle(source)).document;
  for (const entity of broken.entities) delete entity.examples;
  await writeModelDirectory(paths.model, broken);
  expect(await dispatch(['export'], context())).toBe(1);
  expect(readFileSync(suite, 'utf8')).toBe(before);
});

it('verifies exact artifacts without writes and diagnoses missing, changed and orphan files', async () => {
  const args = ['export'];
  const errors: string[] = [];
  const ctx = { ...context(), stderr: (text: string) => errors.push(text) };
  expect(await dispatch([...args, '--verify'], ctx)).toBe(1);
  expect(errors.pop()).toContain(
    'MISSING: .evidence/delivery/release/openapi.json',
  );
  expect(readdirSync(root)).toEqual(['.evidence']);
  expect(await dispatch(args, ctx)).toBe(0);
  const out = paths.acceptance;
  const file = path.join(paths.release, 'openapi.json');
  const modified = statSync(file).mtimeMs;
  expect(await dispatch([...args, '--verify'], ctx)).toBe(0);
  expect(statSync(file).mtimeMs).toBe(modified);
  writeFileSync(file, readFileSync(file, 'utf8').replace(/\n/g, '\r\n'));
  const missing = 'flows/flow-001/folder.bru';
  rmSync(path.join(out, missing));
  mkdirSync(path.join(out, 'old'));
  writeFileSync(path.join(out, 'old', 'orphan.hurl'), 'orphan');
  expect(await dispatch([...args, '--verify'], ctx)).toBe(1);
  expect(errors.pop()).toMatch(
    /MODIFIED: .*openapi.json[\s\S]*MISSING: .*folder.bru[\s\S]*EXTRA: .*orphan.hurl/,
  );
  expect(await dispatch(args, ctx)).toBe(0);
  expect(await dispatch([...args, '--verify'], ctx)).toBe(0);
  rmSync(file);
  symlinkSync(path.join(root, 'missing'), file);
  expect(await dispatch([...args, '--verify'], ctx)).toBe(1);
});

it('syncs and verifies context API drafts without replacing the directory as a tree', async () => {
  const fm = paths.model;
  rmSync(fm, { recursive: true });
  cpSync(
    fileURLToPath(
      new URL(
        '../../../../libs/evidence-api/tests/fixtures/full-lifecycle/fm',
        import.meta.url,
      ),
    ),
    fm,
    { recursive: true },
  );
  const args = ['export', '--only-unblocked'];
  const verify = [...args, '--verify'];
  expect(await dispatch(verify, context())).toBe(1);
  expect(await dispatch(args, context())).toBe(0);
  const out = paths.delivery;
  expect(
    JSON.parse(readFileSync(path.join(out, 'delivery-status.json'), 'utf8')),
  ).toMatchObject({
    releaseAuthorized: false,
    contexts: expect.arrayContaining([
      expect.objectContaining({ status: 'synced' }),
    ]),
  });
  expect(await dispatch(verify, context())).toBe(0);
  const artifact = path.join(
    out,
    'services/context.product-procurement/openapi.json',
  );
  expect(readFileSync(artifact, 'utf8')).toContain('/product-procurements');
  const rulesDir = path.join(fm, 'rules');
  const rulePath = readdirSync(rulesDir)
    .map((file) => path.join(rulesDir, file))
    .find(
      (file) =>
        JSON.parse(readFileSync(file, 'utf8')).contextRef ===
        'context.product-procurement',
    )!;
  const rule = JSON.parse(readFileSync(rulePath, 'utf8'));
  writeFileSync(rulePath, JSON.stringify({ ...rule, expression: '(' }));
  const before = readFileSync(artifact);
  expect(await dispatch(args, context())).toBe(0);
  expect(readFileSync(artifact)).toEqual(before);
  expect(
    JSON.parse(readFileSync(path.join(out, 'openapi.json'), 'utf8')),
  ).toMatchObject({ 'x-evidence-delivery-state': 'partial' });
  expect(
    await dispatch(['export', '--out', 'delivery', '--openapi'], context()),
  ).toBe(1);
  expect(await dispatch([...args, '--tests'], context())).toBe(1);
  expect(await dispatch([...verify, '--watch'], context())).toBe(1);
});

it('refuses arbitrary outputs and symlinked destinations', async () => {
  expect(await dispatch(['export', '--out', 'src'], context())).toBe(1);
  const code = path.join(root, 'src');
  mkdirSync(code);
  writeFileSync(path.join(code, 'keep'), 'code');
  symlinkSync(code, paths.delivery, 'junction');
  expect(await dispatch(['export'], context())).toBe(1);
  expect(await dispatch(['export', '--only-unblocked'], context())).toBe(1);
  expect(readdirSync(code)).toEqual(['keep']);
});
