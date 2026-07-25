import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { afterEach, describe, expect, it } from 'vitest';
import { createCodingAgentTools } from './coding-agent-tools';
import { runGit } from './git-repository';

const temporaryPaths: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryPaths
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe('coding agent tools', () => {
  it('limits file reads and writes to the isolated worktree', async () => {
    const root = await temporaryDirectory();
    const worktree = join(root, 'worktree');
    const outside = join(root, 'outside.txt');
    await mkdir(join(worktree, 'node_modules'), { recursive: true });
    await writeFile(join(worktree, 'inside.txt'), 'inside\n');
    await writeFile(
      join(worktree, 'node_modules', 'secret.txt'),
      'dependency\n',
    );
    await writeFile(outside, 'outside\n');
    await symlink(outside, join(worktree, 'outside-link'));
    const tools = await createCodingAgentTools(worktree, {});

    const read = requiredTool(tools, 'read');
    const write = requiredTool(tools, 'write');
    await expect(execute(read, { path: 'inside.txt' })).resolves.toBeDefined();
    await expect(execute(read, { path: '../outside.txt' })).rejects.toThrow(
      'outside the isolated worktree',
    );
    await expect(
      execute(write, { path: '../created.txt', content: 'forbidden' }),
    ).rejects.toThrow('outside the isolated worktree');
    await expect(
      execute(read, { path: 'node_modules/secret.txt' }),
    ).rejects.toThrow('cannot access prepared dependencies');
    await expect(
      execute(write, { path: 'outside-link', content: 'forbidden' }),
    ).rejects.toThrow();
    expect(await readFile(outside, 'utf8')).toBe('outside\n');
  });

  it('exposes bounded coding operations without an arbitrary shell', async () => {
    const root = await temporaryDirectory();
    const worktree = join(root, 'worktree');
    await mkdir(worktree);
    await runGit(worktree, ['init', '--initial-branch=main']);
    await runGit(worktree, ['config', 'user.name', 'Evidence Test']);
    await runGit(worktree, ['config', 'user.email', 'test@evidence.local']);
    await writeFile(join(worktree, 'tracked.txt'), 'original\n');
    await runGit(worktree, ['add', 'tracked.txt']);
    await runGit(worktree, ['commit', '-m', 'Initial commit']);
    await writeFile(join(worktree, 'new-file.ts'), 'export const value = 1;\n');

    const tools = await createCodingAgentTools(worktree, {});
    expect(tools.map((tool) => tool.name)).toEqual([
      'read',
      'edit',
      'write',
      'search',
      'list_files',
      'run_quality_gate',
      'inspect_diff',
    ]);
    expect(tools.map((tool) => tool.name)).not.toContain('bash');

    const result = await execute(requiredTool(tools, 'inspect_diff'), {});
    expect(JSON.stringify(result)).toContain('new-file.ts');
  });

  it('does not run a quality gate after its package script changes', async () => {
    const root = await temporaryDirectory();
    const worktree = join(root, 'worktree');
    await mkdir(worktree);
    await writeFile(
      join(worktree, 'package.json'),
      JSON.stringify({ scripts: { test: 'node safe-test.js' } }),
    );
    const tools = await createCodingAgentTools(worktree, {
      test: 'node safe-test.js',
    });
    await writeFile(
      join(worktree, 'package.json'),
      JSON.stringify({ scripts: { test: 'node changed-test.js' } }),
    );

    await expect(
      execute(requiredTool(tools, 'run_quality_gate'), { gate: 'test' }),
    ).rejects.toThrow('changed after Run start');
  });
});

function requiredTool(tools: ToolDefinition[], name: string): ToolDefinition {
  const tool = tools.find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`Missing ${name} tool`);
  return tool;
}

async function execute(
  tool: ToolDefinition,
  params: Record<string, unknown>,
): Promise<unknown> {
  return tool.execute(
    'tool-call-1',
    params,
    new AbortController().signal,
    undefined,
    undefined as never,
  );
}

async function temporaryDirectory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'evidence-coding-tools-'));
  temporaryPaths.push(path);
  return path;
}
