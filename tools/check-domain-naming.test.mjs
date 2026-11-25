import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'domain-naming-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'tools'));
  const check = join(root, 'tools/check-domain-naming.mjs');
  copyFileSync(new URL('./check-domain-naming.mjs', import.meta.url), check);

  const entity = (name, index) =>
    join(root, 'examples', name, '.evidence/model/entities', `${index}.json`);
  const write = (name, index, label) => {
    writeFileSync(
      entity(name, index),
      JSON.stringify({ label, attributes: [{ label: '业务上下文' }] }),
    );
  };
  for (const [name, count] of [
    ['agile-sprint', 11],
    ['b2b-escrow', 45],
    ['digital-advertising', 17],
    ['full-spectrum-procurement', 36],
    ['shared-settlement', 10],
    ['b2b-escrow/baseline-v1', 1],
  ]) {
    mkdirSync(join(entity(name, 0), '..'), { recursive: true });
    for (let i = 1; i <= count; i++) write(name, i, '买方（Buyer）');
  }
  write('b2b-escrow/baseline-v1', 1, 'buyer');
  const run = (...args) =>
    spawnSync(process.execPath, [check, ...args], {
      cwd: root,
      encoding: 'utf8',
    });
  return { entity, write, run };
}

test('checks all active labels and not the frozen baseline or attributes', (t) => {
  const { run } = fixture(t);
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'PASS: 119 entities verified\n');
  assert.equal(result.stderr, '');
  const scoped = run('--workspace', 'examples/agile-sprint');
  assert.equal(scoped.status, 0, scoped.stderr);
  assert.equal(scoped.stdout, 'PASS: 11 entities verified\n');
  assert.equal(run('--workspace', 'examples/b2b-escrow/baseline-v1').status, 1);
});

test('fails on format, forbidden terms, invalid JSON and missing entity files', (t) => {
  const { entity, write, run } = fixture(t);
  const name = 'b2b-escrow';
  write(name, 1, 'buyer');
  write(name, 2, '买方角色（Buyer）');
  write(name, 3, '合同（Contract cOnTeXt）');
  write(name, 4, 'Buyer（Buyer）');
  writeFileSync(entity(name, 5), '{');
  rmSync(entity(name, 6));
  const { status, stdout, stderr } = run('--workspace', `examples/${name}`);
  assert.equal(status, 1);
  assert.equal(stdout, '');
  assert.match(stderr, /expected 45 entity files, found 44/);
  assert.match(stderr, /1\.json#label: expected .* "buyer"/);
  assert.match(stderr, /2\.json#label: forbidden metamodel term "角色"/);
  assert.match(stderr, /3\.json#label: forbidden metamodel term "cOnTeXt"/);
  assert.match(stderr, /4\.json#label: expected /);
  assert.match(stderr, /5\.json: could not read entity JSON/);
});

test('warns on non-standard acronym casing without blocking a valid label', (t) => {
  const { write, run } = fixture(t);
  write('digital-advertising', 1, '招标意向书（Promotion rfp）');
  const { status, stdout, stderr } = run(
    '--workspace',
    'examples/digital-advertising',
  );
  assert.equal(status, 0);
  assert.equal(stdout, 'PASS: 17 entities verified\n');
  assert.match(stderr, /WARNING: non-standard acronym casing/);
  assert.match(stderr, /1\.json#label.*rfp → RFP/);
});
