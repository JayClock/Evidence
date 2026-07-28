import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createShowcaseReviewerTools,
  type ShowcaseReviewerToolState,
} from './reviewer-tools';

const temporaryPaths: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryPaths
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe('Showcase Reviewer tools', () => {
  it('exposes only read/search/report capabilities', async () => {
    const worktree = await worktreeFixture();
    const tools = await createShowcaseReviewerTools(worktree, { review: null });

    expect(tools.map(({ name }) => name)).toEqual([
      'read',
      'search',
      'list_files',
      'evidence_submit_showcase_review',
    ]);
    expect(tools.map(({ name }) => name)).not.toContain('write');
    expect(tools.map(({ name }) => name)).not.toContain('edit');
    expect(tools.map(({ name }) => name)).not.toContain('bash');
  });

  it('does not read protected roots or escaping symlinks', async () => {
    const worktree = await worktreeFixture();
    const outside = join(await temporaryDirectory(), 'outside.txt');
    await writeFile(outside, 'secret\n');
    await symlink(outside, join(worktree, 'outside-link'));
    const tools = await createShowcaseReviewerTools(worktree, { review: null });
    const read = requiredTool(tools, 'read');

    await expect(execute(read, { path: '.pi/secret.txt' })).rejects.toThrow(
      'protected path',
    );
    await expect(execute(read, { path: 'outside-link' })).rejects.toThrow(
      'outside the worktree',
    );
  });

  it('returns one advisory report without granting a decision', async () => {
    const state: ShowcaseReviewerToolState = { review: null };
    const tools = await createShowcaseReviewerTools(
      await worktreeFixture(),
      state,
    );
    const submit = requiredTool(tools, 'evidence_submit_showcase_review');
    const report = {
      observedFacts: ['Q2 and product observations agree.'],
      productDomainFeedback: ['The intended value is observable.'],
      technicalQualityFeedback: [],
      unresolvedAssumptions: [],
      recommendation: 'accept',
    };

    await execute(submit, report);
    expect(state.review).toEqual(report);
    await expect(execute(submit, report)).rejects.toThrow('one-shot');
  });
});

async function worktreeFixture(): Promise<string> {
  const root = await temporaryDirectory();
  const worktree = join(root, 'worktree');
  await mkdir(join(worktree, 'apps/desktop/src'), { recursive: true });
  await mkdir(join(worktree, '.pi'), { recursive: true });
  await writeFile(
    join(worktree, 'apps/desktop/src/showcase.ts'),
    'export const showcase = true;\n',
  );
  await writeFile(join(worktree, '.pi/secret.txt'), 'internal\n');
  return worktree;
}

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
  const path = await mkdtemp(join(tmpdir(), 'evidence-showcase-reviewer-'));
  temporaryPaths.push(path);
  return path;
}
