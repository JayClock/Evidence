import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runModelCommand } from './commands.js';

const FIXTURE = fileURLToPath(
  new URL(
    '../../evidence-model-core/tests/fixtures/models/valid-traceable-subscription',
    import.meta.url,
  ),
);

describe('derived document commands', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'evidence-derived-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const read = async (name: string): Promise<Record<string, unknown>> =>
    JSON.parse(await readFile(path.join(root, name), 'utf8')) as Record<
      string,
      unknown
    >;

  const derive = (
    command: 'compile' | 'lineage',
    target: string,
    out: string,
    errors: string[] = [],
  ) =>
    runModelCommand(
      command,
      { target, out, compact: false, sortKeys: false, json: false },
      {
        cwd: root,
        stdout: () => undefined,
        stderr: (text) => errors.push(text),
      },
    );

  it('compiles a checked model into one sorted document', async () => {
    expect(await derive('compile', FIXTURE, 'model.json')).toBe(0);

    const compiled = await read('model.json');
    const ids = (compiled['entities'] as { id: string }[]).map(
      (item) => item.id,
    );

    expect(ids).toEqual([...ids].sort());
    expect(compiled['schemaVersion']).toBe('6.0');
  });

  it('writes attribute lineage', async () => {
    expect(await derive('lineage', FIXTURE, 'traceability.json')).toBe(0);
    expect((await read('traceability.json'))['edges']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleRef: 'rule.payment-request-amount' }),
      ]),
    );
  });

  it('stops a derived command when the model does not pass its check', async () => {
    const errors: string[] = [];
    const broken = path.join(root, 'broken');
    const { mkdir, cp } = await import('node:fs/promises');

    await mkdir(broken, { recursive: true });
    await cp(FIXTURE, broken, { recursive: true });
    await writeFile(path.join(broken, 'model.json'), '{}\n', 'utf8');

    expect(await derive('compile', broken, 'model.json', errors)).toBe(1);
    expect(errors.join('\n')).toContain('已中止');
  });
});
