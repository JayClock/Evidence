import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { runAcceptanceSuite } from './runner/acceptanceRunner.js';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  readModelDirectory,
  writeModelDirectory,
} from '@evidence-poc/evidence-model-io';
import { forkStory } from '@evidence-poc/evidence-model-core';
import { exportAcceptanceTests } from './exportTests.js';

const backend = fileURLToPath(
  new URL(
    '../../../examples/b2b-escrow/implementations/ts-fastify/dist/server.js',
    import.meta.url,
  ),
);
const model = fileURLToPath(
  new URL('../../../examples/b2b-escrow/.evidence/model', import.meta.url),
);
let root: string, suite: string;
beforeEach(async () => {
  root = mkdtempSync(path.join(os.tmpdir(), 'evidence-backend-e2e-'));
  const out = path.join(root, 'tests');
  await exportAcceptanceTests({ modelDirectory: model, out });
  suite = out;
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

async function withBackend<T>(
  fault: string,
  run: (host: string) => Promise<T>,
): Promise<T> {
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
    const host = await new Promise<string>((resolve, reject) => {
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
        reject(new Error(`Backend exited (${code}): ${stderr}`));
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
    return await run(host);
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
  }
}

function execute(fault = 'none') {
  return withBackend(fault, (host) =>
    runAcceptanceSuite({ suitePath: suite, targetUrl: host }),
  );
}

async function payoutOverrideSteps() {
  const { document } = await readModelDirectory(model);
  return new Set(
    document.stories.flatMap((story) =>
      story.steps
        .filter(
          (step) =>
            step.expectedStatus === 422 &&
            Object.hasOwn(step.inputs ?? {}, 'payout_minor'),
        )
        .map((step) => `${story.id}#${step.id}`),
    ),
  );
}

describe(
  'generated acceptance against an independent backend process',
  { timeout: 20_000 },
  () => {
    it('runs the checked-in Bruno collection directly without the Evidence adapter', async () => {
      const require = createRequire(import.meta.url);
      const bru = path.join(
        path.dirname(require.resolve('@usebruno/cli/package.json')),
        'bin',
        'bru.js',
      );
      const directory = fileURLToPath(
        new URL(
          '../../../examples/b2b-escrow/.evidence/acceptance',
          import.meta.url,
        ),
      );
      const report = path.join(root, 'bruno.json');
      await withBackend('none', (host) =>
        promisify(execFile)(
          process.execPath,
          [
            bru,
            'run',
            '-r',
            '--sandbox',
            'safe',
            '--bail',
            '--env',
            'test',
            '--env-var',
            `host=${host}`,
            '--reporter-json',
            report,
          ],
          { cwd: directory, timeout: 15_000 },
        ),
      );
      const [{ results }] = JSON.parse(readFileSync(report, 'utf8')) as [
        {
          results: {
            test: { filename: string };
            status: string;
            response: { status: number };
          }[];
        },
      ];
      expect(results).toHaveLength(121);
      expect(new Set(results.map(({ test }) => test.filename)).size).toBe(121);
      expect(
        results.every(
          ({ status, response }) =>
            status === 'pass' && Number.isInteger(response.status),
        ),
      ).toBe(true);
    });
    it('passes the complete positive and invalid-input flow via the official runner', async () => {
      const report = await execute();
      expect(
        report.passed,
        JSON.stringify(
          report.steps.filter((step) => !step.passed),
          null,
          2,
        ),
      ).toBe(true);
      const steps = report.steps;
      expect(report.selectedFlowCount).toBe(5);
      expect(steps).toHaveLength(121);
      expect(steps.every((step) => !step.errored && !step.skipped)).toBe(true);
      const rejected = await payoutOverrideSteps();
      const attempted = steps.filter((step) => rejected.has(step.name));
      expect(attempted).toHaveLength(5);
      expect(attempted.every((step) => step.status === 422)).toBe(true);
    });
    it('runs a selected fork on a fresh service using only its own prefix captures', async () => {
      const { document } = await readModelDirectory(model);
      const parent = document.stories.find(
        (story) => story.id === 'single-on-time',
      )!;
      const [agreement, order, confirmation] = parent.steps;
      forkStory(document, {
        id: 'order-review',
        title: '复核订单',
        forkedFrom: { storyId: parent.id, stepId: order!.id },
        steps: [
          {
            ...confirmation!,
            id: 'reviewed',
            sequence: 1,
            basedOn: [`${parent.id}#${order!.id}`],
          },
        ],
      });
      const modelDirectory = path.join(root, 'model');
      await writeModelDirectory(modelDirectory, document);
      await exportAcceptanceTests({ modelDirectory, out: suite });
      const report = await withBackend('none', (targetUrl) =>
        runAcceptanceSuite({
          suitePath: suite,
          targetUrl,
          filter: 'order-review',
        }),
      );
      expect(
        report.passed,
        JSON.stringify(report.steps.filter((step) => !step.passed)),
      ).toBe(true);
      expect(report.selectedFlowCount).toBe(1);
      expect(report.steps.map((step) => step.name)).toEqual([
        `${parent.id}#${agreement!.id}`,
        `${parent.id}#${order!.id}`,
        'order-review#reviewed',
      ]);
    });
    it('goes red for an incorrect derived amount, and green again after fixing it', async () => {
      const broken = await execute('amount');
      expect(broken.passed).toBe(false);
      const { document } = await readModelDirectory(model);
      const order = document.stories
        .find((story) => story.id === 'single-on-time')!
        .steps.find((step) => step.workObjectRef === 'confirmation.order')!;
      const step = broken.steps.find(
        (step) => step.name === `single-on-time#${order.id}`,
      )!;
      expect(step.assertions).toContainEqual({
        path: 'jsonpath.$["gross_amount_minor"]',
        actual: 1466403,
        expected: 1466402,
        passed: false,
      });
      expect((await execute()).passed).toBe(true);
    });
    it('goes red if a backend accepts caller-supplied derived fields', async () => {
      const broken = await execute('accept-derived');
      expect(broken.passed).toBe(false);
      const rejected = await payoutOverrideSteps();
      const step = broken.steps.find(
        (step) => rejected.has(step.name) && !step.passed,
      )!;
      expect(step.assertions).toContainEqual({
        path: 'res.status',
        actual: 201,
        expected: 422,
        passed: false,
      });
    });
    it('goes red if the backend ignores the explicit business clock', async () => {
      const broken = await execute('clock');
      expect(broken.passed).toBe(false);
      expect(broken.steps[0]?.assertions).toContainEqual(
        expect.objectContaining({
          path: 'jsonpath.$["signed_at"]',
          passed: false,
        }),
      );
    });
    it('goes red for a response that violates the projected JSON Schema', async () => {
      const broken = await execute('extra-field');
      expect(broken.passed).toBe(false);
      expect(broken.steps[0]?.assertions).toContainEqual(
        expect.objectContaining({ path: 'schema', passed: false }),
      );
    });
    it('keeps the distributed story JSON Schema aligned with authored steps', async () => {
      const schemaPath = new URL(
        '../../evidence-schema/schemas/story.schema.json',
        import.meta.url,
      );
      const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
      const validate = new Ajv2020({
        strict: false,
        validateFormats: false,
      }).compile(schema);
      const { document, issues } = await readModelDirectory(model);
      expect(issues).toEqual([]);
      for (const story of document.stories)
        expect(validate(story), JSON.stringify(validate.errors)).toBe(true);
      const story = document.stories[0]!;
      const invalid = { ...story, steps: [{ ...story.steps[0], inputs: {} }] };
      expect(validate(invalid)).toBe(false);
    });
  },
);
