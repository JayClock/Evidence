import { spawn, execFile } from 'node:child_process';
import { once } from 'node:events';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  initializeWorkspace,
  readModelDirectory,
} from '@evidence-poc/evidence-model-io';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const cli = path.join(repo, 'apps/cli/dist/cli.js');
const backend = path.join(
  repo,
  'examples/b2b-escrow/implementations/ts-fastify/dist/server.js',
);
let root: string;
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'evidence-cli-e2e-'));
  cpSync(
    path.join(repo, 'examples/b2b-escrow/.evidence'),
    path.join(root, '.evidence'),
    { recursive: true },
  );
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function invoke(args: string[]) {
  return new Promise<{ code: number; stdout: string; stderr: string }>(
    (resolve) => {
      const env: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: '1' };
      delete env.FORCE_COLOR;
      execFile(
        process.execPath,
        [cli, ...args],
        { cwd: root, env, timeout: 15000 },
        (error, stdout, stderr) => {
          resolve({
            code: error ? (typeof error.code === 'number' ? error.code : 1) : 0,
            stdout,
            stderr,
          });
        },
      );
    },
  );
}

async function withBackend(
  fault: string,
  action: (target: string) => Promise<void>,
) {
  const child = spawn(
    process.execPath,
    [backend, '--test-mode', '--port', '0', '--fault', fault],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let stdout = '',
    stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += String(chunk);
  });
  try {
    const target = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(
        () =>
          reject(new Error(`Backend startup timeout: ${stdout}\n${stderr}`)),
        5000,
      );
      child.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`Backend exited ${code}: ${stderr}`));
      });
      child.stdout.on('data', (chunk) => {
        stdout += String(chunk);
        if (!stdout.includes('\n')) return;
        clearTimeout(timer);
        try {
          resolve(
            (JSON.parse(stdout.split('\n')[0]!) as { host: string }).host,
          );
        } catch (error) {
          reject(error);
        }
      });
    });
    await action(target);
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
  }
}

it('watches a saved model and repairs a partial gateway without touching blocked artifacts', async () => {
  const source = path.join(root, '.evidence/model');
  rmSync(source, { recursive: true });
  cpSync(
    path.join(repo, 'libs/evidence-api/tests/fixtures/full-lifecycle/fm'),
    source,
    { recursive: true },
  );
  const rulesDir = path.join(source, 'rules');
  const rulePath = readdirSync(rulesDir)
    .map((file) => path.join(rulesDir, file))
    .find(
      (file) =>
        JSON.parse(readFileSync(file, 'utf8')).contextRef ===
        'context.product-procurement',
    );
  if (!rulePath) throw new Error('Missing procurement rule in the fixture');
  const original = readFileSync(rulePath, 'utf8');
  const writeRule = (content: string) => {
    const staging = `${rulePath}.tmp`;
    writeFileSync(staging, content);
    renameSync(staging, rulePath);
  };
  const gateway = path.join(root, '.evidence/delivery/openapi.json');
  const local = path.join(
    root,
    '.evidence/delivery/services/context.product-procurement/openapi.json',
  );
  const child = spawn(process.execPath, [cli, 'export', '--watch'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => {
    output += String(chunk);
  });
  child.stderr.on('data', (chunk) => {
    output += String(chunk);
  });
  const expectGateway = (state: string) =>
    expect
      .poll(
        () => {
          try {
            return JSON.parse(readFileSync(gateway, 'utf8'))[
              'x-evidence-delivery-state'
            ];
          } catch {
            return undefined;
          }
        },
        { timeout: 2500, message: `Waiting for ${state} gateway` },
      )
      .toBe(state);
  try {
    await expectGateway('complete');
    const previous = readFileSync(local);
    writeRule(JSON.stringify({ ...JSON.parse(original), expression: '(' }));
    await expectGateway('partial');
    expect(readFileSync(local)).toEqual(previous);
    writeRule(original);
    await expectGateway('complete');
  } catch (error) {
    throw new Error(`Context watcher failed: ${output}`, { cause: error });
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const exit = once(child, 'exit');
      child.kill('SIGTERM');
      await exit;
    }
  }
}, 10_000);

describe('built evidence binary full lifecycle', () => {
  it('checks a source tree, exports both deliverables and passes real HTTP acceptance as JSON', async () => {
    const check = await invoke(['check', '--json']);
    expect(check.code, check.stderr).toBe(0);
    expect(JSON.parse(check.stdout).valid).toBe(true);
    const exported = await invoke(['export']);
    expect(exported.code, exported.stderr).toBe(0);
    expect(exported.stdout).toContain('121 steps');
    await withBackend('none', async (target) => {
      const run = await invoke(['test', '--target', target, '--json']);
      expect(run.code, `${run.stdout}\n${run.stderr}`).toBe(0);
      expect(run.stderr).toBe('');
      const report = JSON.parse(run.stdout);
      expect(report.passed).toBe(true);
      expect(report.suites[0].steps).toHaveLength(121);
      expect(
        report.suites[0].steps.every(
          (step: { passed: boolean }) => step.passed,
        ),
      ).toBe(true);
    });
  }, 20000);

  it.each(['amount', 'clock', 'extra-field'])(
    'exits red for the independent %s fault',
    async (fault) => {
      const exported = await invoke(['export']);
      expect(exported.code, exported.stderr).toBe(0);
      await withBackend(fault, async (target) => {
        const run = await invoke(['test', '--target', target, '--verbose']);
        expect(run.code).toBe(1);
        expect(run.stdout).toContain('FAILED (Red)');
        expect(run.stdout).not.toContain('\u001b');
        if (fault === 'amount') {
          expect(run.stdout).toContain('Expected: 1356225');
          expect(run.stdout).toContain('Received: 1356226');
        } else if (fault === 'clock') expect(run.stdout).toContain('signed_at');
        else expect(run.stdout).toContain('schema');
      });
    },
    20000,
  );

  it('compares compatible and breaking model evolution through oasdiff', async () => {
    const same = await invoke(['diff', root, root, '--format', 'json']);
    expect(same.code, same.stderr).toBe(0);
    expect(JSON.parse(same.stdout).hasBreakingChanges).toBe(false);
    const { document: current } = await readModelDirectory(
      path.join(root, '.evidence/model'),
    );
    const confirmation = current.entities.find(
      (entity: { id: string }) => entity.id === 'confirmation.order',
    );
    if (!confirmation?.attributes) throw new Error('missing attributes');
    confirmation.attributes.push({
      name: 'note',
      label: 'Note',
      meaning: 'Required caller note',
      valueType: 'string',
      required: true,
    });
    for (const example of confirmation.examples ?? [])
      example.value.note = 'required now';
    const target = path.join(root, 'next');
    mkdirSync(target);
    await initializeWorkspace(target, current);
    const broken = await invoke(['diff', root, target, '--format', 'json']);
    expect(broken.code, `${broken.stdout}\n${broken.stderr}`).toBe(1);
    expect(JSON.parse(broken.stdout).hasBreakingChanges).toBe(true);
    const markdown = await invoke(['diff', root, target]);
    expect(markdown.code).toBe(1);
    expect(markdown.stdout).toContain('note');
  }, 20000);

  it('reports invalid paths and parameters without false greens or broken JSON', async () => {
    for (const args of [
      ['check', 'missing.evidence.json', '--json'],
      ['test', '--json'],
      [
        'test',
        '--target',
        'http://localhost:8080',
        '--scenarios',
        'missing',
        '--json',
      ],
      ['export', '--out', 'bad', '--json'],
    ]) {
      const result = await invoke(args);
      expect(result.code).toBe(1);
      expect(JSON.parse(result.stdout)).toMatchObject({ passed: false });
      expect(result.stderr).toBe('');
    }
  });

  it('executes the standalone Fastify tests without another language runtime', async () => {
    await new Promise<void>((resolve, reject) =>
      execFile(
        process.execPath,
        ['--test', 'test/app.test.mjs'],
        {
          cwd: path.join(
            repo,
            'examples/b2b-escrow/implementations/ts-fastify',
          ),
        },
        (error, stdout, stderr) =>
          error ? reject(new Error(`${stdout}\n${stderr}`)) : resolve(),
      ),
    );
  });
});

it('migrates a legacy overlay through the executable CLI and protects existing output', async () => {
  const dir = path.join(root, '.evidence/overlays');
  mkdirSync(dir);
  const input = path.join(dir, 'legacy.json');
  const output = path.join(dir, 'api-v6.json');
  writeFileSync(
    input,
    JSON.stringify({
      schemaVersion: '6.0',
      routes: [
        { id: 'route.sign.contract.agreement', path: '/procurement/agreement' },
        {
          id: 'route.request.request.order',
          path: '/procurement/agreement/{contractId}/order/request',
        },
      ],
    }),
  );
  const args = ['migrate-overlay'];
  const migrated = await invoke(args);
  expect(migrated.code, migrated.stderr).toBe(0);
  expect(JSON.parse(readFileSync(output, 'utf8'))).toMatchObject({
    schemaVersion: '6.0',
    routes: [
      { path: '/agreements' },
      { path: '/agreements/{contractId}/orders' },
    ],
  });
  const before = readFileSync(output, 'utf8');
  expect((await invoke(args)).code).toBe(1);
  expect(readFileSync(output, 'utf8')).toBe(before);
});
