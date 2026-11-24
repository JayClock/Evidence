import { execFile } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BusinessStoryProjection } from '@evidence-poc/evidence-agent';
import {
  initializeWorkspace,
  readModelDirectory,
  writeModelDirectory,
} from '@evidence-poc/evidence-model-io';
import type { DomainModelDocument } from '@evidence-poc/evidence-schema';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const cli = path.join(repo, 'apps/cli/dist/cli.js');
const fixture = (name: string) =>
  path.join(
    repo,
    `libs/evidence-model-core/tests/fixtures/acceptance/${name}/.evidence/model`,
  );
let root: string;
const model = () => path.join(root, '.evidence/model');
beforeEach(async () => {
  root = realpathSync(mkdtempSync(path.join(tmpdir(), 'evidence-story-e2e-')));
  await initializeWorkspace(
    root,
    (await readModelDirectory(fixture('procurement'))).document,
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
        [cli, 'story', ...args],
        { cwd: root, env, timeout: 15000 },
        (error, stdout, stderr) =>
          resolve({
            code: error ? (typeof error.code === 'number' ? error.code : 1) : 0,
            stdout,
            stderr,
          }),
      );
    },
  );
}

async function editModel(change: (document: DomainModelDocument) => void) {
  const { document } = await readModelDirectory(model());
  change(document);
  await writeModelDirectory(model(), document);
}
const stories = (content: string): BusinessStoryProjection[] =>
  JSON.parse(content);

describe('built evidence story binary', () => {
  it('projects all declared steps, including the negative case, deterministically without AI or source writes', async () => {
    const args = ['--no-ai', '--format', 'json'];
    const result = await invoke(args);
    expect(result.code, result.stderr).toBe(0);
    expect(result.stderr).toBe('');
    const projections = stories(result.stdout);
    expect(projections).toHaveLength(1);
    const [payment] = projections;
    expect(payment?.flowId).toBe('payment');
    // The fixture declares three positive examples AND a bad-input example.
    expect(payment?.scenes).toHaveLength(4);
    expect(payment?.scenes.map((scene) => scene.stepIndex)).toEqual([
      1, 2, 3, 4,
    ]);
    expect(payment?.scenes.map((scene) => scene.targetEntityLabel)).toEqual([
      'Agreement',
      'payment request',
      'payment confirmation',
      'payment confirmation',
    ]);
    expect(payment?.scenes[2]?.documentCard.fields).toContainEqual({
      name: 'total_amount',
      label: 'total_amount',
      value: '500',
      keyData: false,
    });
    expect(
      payment?.scenes.every((scene) => scene.ruleEvaluations.length === 0),
    ).toBe(true);
    expect(payment?.scenes.some((scene) => scene.pendingSuspense)).toBe(true);
    expect((await invoke(args)).stdout).toBe(result.stdout);
    expect(readdirSync(root)).toEqual(['.evidence']);
    expect(result.stdout).not.toContain('\u001b');
  });

  it('defaults to Markdown', async () => {
    const fromTree = await invoke(['--no-ai']);
    expect(fromTree.code, fromTree.stderr).toBe(0);
    expect(fromTree.stdout).toMatch(/^# 业务故事\n/u);
    expect(fromTree.stdout).toContain('### 1.');
    expect(fromTree.stdout).toContain('| 字段 | 值 | 关键数据 | 来源 |');
    expect(fromTree.stdout).not.toContain('\u001b');
  });

  it('filters exact flow IDs without losing steps and rejects an absent flow', async () => {
    await writeModelDirectory(
      model(),
      (await readModelDirectory(fixture('procurement-deposit'))).document,
    );
    const all = await invoke(['--no-ai', '--format', 'json']);
    expect(all.code, all.stderr).toBe(0);
    expect(stories(all.stdout).map((story) => story.flowId)).toEqual([
      'deposit',
      'payment',
    ]);
    for (const flow of ['payment', 'deposit']) {
      const selected = await invoke([
        '--no-ai',
        '--format',
        'json',
        '--flow',
        flow,
      ]);
      expect(selected.code, selected.stderr).toBe(0);
      expect(stories(selected.stdout)).toEqual(
        stories(all.stdout).filter((story) => story.flowId === flow),
      );
    }
    const absent = await invoke(['--no-ai', '--flow', 'pay', '--export']);
    expect(absent.code).toBe(1);
    expect(absent.stdout).toBe('');
    expect(absent.stderr).toContain("未找到 ID 为 'pay' 的业务流");
    expect(readdirSync(root)).toEqual(['.evidence']);
  });

  it.each(['markdown', 'json', 'text'])(
    'exports %s into newly created parent directories',
    async (format) => {
      const out = `.evidence/stories/story.${format === 'markdown' ? 'md' : format === 'text' ? 'txt' : 'json'}`;
      const args = ['--no-ai', '--format', format];
      const direct = await invoke(args);
      const exported = await invoke([...args, '--export']);
      expect(direct.code, direct.stderr).toBe(0);
      expect(exported.code, exported.stderr).toBe(0);
      expect(exported.stdout.trim()).toBe(
        `业务故事已成功导出至: ${path.join(root, out)}`,
      );
      expect(exported.stderr).toBe('');
      const content = readFileSync(path.join(root, out), 'utf8');
      expect(content).toBe(direct.stdout);
      expect(content).not.toContain('\u001b');
      if (format === 'json')
        expect(stories(content)[0]?.flowId).toBe('payment');
      if (format === 'markdown')
        expect(content).toContain('#### payment request');
      if (format === 'text') expect(content).toContain('┌─ payment request');
    },
  );

  it('compacts JSON without losing projection data and compacts text without losing document fields', async () => {
    const args = ['--no-ai'];
    const pretty = await invoke([...args, '--format', 'json']);
    const compact = await invoke([...args, '--format', 'json', '--compact']);
    expect(compact.code, compact.stderr).toBe(0);
    expect(compact.stdout.trim().split('\n')).toHaveLength(1);
    expect(stories(compact.stdout)).toEqual(stories(pretty.stdout));
    const fullText = await invoke([...args, '--format', 'text']);
    const shortText = await invoke([...args, '--format', 'text', '--compact']);
    expect(fullText.code, fullText.stderr).toBe(0);
    expect(shortText.code, shortText.stderr).toBe(0);
    expect(shortText.stdout).toContain('total_amount: 500');
    expect(shortText.stdout).toContain('声明依据：request.payment#requested');
    expect(shortText.stdout).toContain('业务待决悬念');
    expect(shortText.stdout.length).toBeLessThan(fullText.stdout.length);
    expect(shortText.stdout).not.toContain('┌');
    expect(fullText.stdout).not.toContain('\u001b');
  });

  it('returns an empty JSON array or a human explanation for models without flow declarations', async () => {
    await editModel((bundle) => {
      for (const entity of bundle.entities)
        for (const example of entity.examples ?? []) delete example.test;
    });
    const json = await invoke(['--no-ai', '--format', 'json', '--export']);
    expect(json.code, json.stderr).toBe(0);
    expect(
      stories(
        readFileSync(path.join(root, '.evidence/stories/story.json'), 'utf8'),
      ),
    ).toEqual([]);
    const human = await invoke(['--no-ai']);
    expect(human.code, human.stderr).toBe(0);
    expect(human.stdout).toContain('未检测到');
    const stdoutJson = await invoke(['--no-ai', '--format', 'json']);
    expect(stdoutJson.code, stdoutJson.stderr).toBe(0);
    expect(stories(stdoutJson.stdout)).toEqual([]);
  });

  it('fails cleanly for invalid paths, formats, schema and syntax without creating exports', async () => {
    writeFileSync(path.join(root, 'invalid.evidence.json'), '{');
    writeFileSync(path.join(root, 'wrong.evidence.json'), '{}');
    for (const args of [
      ['missing.evidence.json', '--no-ai'],
      ['invalid.evidence.json', '--no-ai'],
      ['wrong.evidence.json', '--no-ai'],
      ['--no-ai', '--format', 'yaml'],
      ['--no-ai', '--flow'],
      ['--no-ai', '--format', 'json', '--format', 'text'],
    ]) {
      const result = await invoke([...args, '--export']);
      expect(result.code, args.join(' ')).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('Error:');
      expect(readdirSync(root)).not.toContain('never');
    }
  });

  it('refuses cyclic example dependencies rather than emitting a plausible story', async () => {
    await editModel((bundle) => {
      const example = bundle.entities.find(
        (entity) => entity.id === 'contract.agreement',
      )?.examples?.[0];
      if (!example?.test) throw new Error('Missing fixture example');
      example.test.basedOn = ['confirmation.payment#confirmed'];
    });
    const result = await invoke(['--no-ai', '--format', 'json', '--export']);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('CYCLIC_DEPENDENCY');
    expect(result.stdout).toBe('');
    expect(readdirSync(root)).toEqual(['.evidence']);
  });

  it('reports export write failures with exit 1 and no success message', async () => {
    mkdirSync(path.join(root, '.evidence/stories/story.md'), {
      recursive: true,
    });
    const result = await invoke(['--no-ai', '--export']);
    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Error:');
  });
});
