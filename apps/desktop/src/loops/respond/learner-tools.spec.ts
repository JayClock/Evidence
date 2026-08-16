import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createRespondLearnerTools,
  type RespondLearnerToolState,
} from './learner-tools';

const temporaryPaths: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryPaths
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe('Respond Learner tools', () => {
  it('exposes only read/search/list and one-shot proposal capabilities', async () => {
    const tools = await createRespondLearnerTools(await worktreeFixture(), {
      response: null,
    });

    expect(tools.map(({ name }) => name)).toEqual([
      'read',
      'search',
      'list_files',
      'evidence_submit_respond_candidate',
    ]);
    expect(tools.map(({ name }) => name)).not.toContain('write');
    expect(tools.map(({ name }) => name)).not.toContain('edit');
    expect(tools.map(({ name }) => name)).not.toContain('bash');
    expect(tools.map(({ name }) => name)).not.toContain('approve');
  });

  it('returns one Candidate while leaving approval to a human', async () => {
    const state: RespondLearnerToolState = { response: null };
    const tools = await createRespondLearnerTools(
      await worktreeFixture(),
      state,
    );
    const submit = requiredTool(tools, 'evidence_submit_respond_candidate');
    const candidate = {
      promotions: [],
      noPromotionReason: 'No reusable knowledge was validated.',
      observedOutcomes: ['The accepted Story value was observed.'],
      residualRisks: [],
      nextProbe: {
        question: 'Which risk should be learned next?',
        whyNow: 'One bounded risk remains.',
        evidenceRefs: ['showcase:risk-Q4'],
        firstAction: 'A human decides whether to capture it.',
      },
    };

    await execute(submit, candidate);

    expect(state.response).toEqual(candidate);
    await expect(execute(submit, candidate)).rejects.toThrow('one-shot');
  });

  it('does not let empty promotions omit their reason', async () => {
    const tools = await createRespondLearnerTools(await worktreeFixture(), {
      response: null,
    });
    const submit = requiredTool(tools, 'evidence_submit_respond_candidate');

    await expect(
      execute(submit, {
        promotions: [],
        noPromotionReason: null,
        observedOutcomes: ['The accepted Story value was observed.'],
        residualRisks: [],
        nextProbe: {
          question: 'Which risk should be learned next?',
          whyNow: 'One bounded risk remains.',
          evidenceRefs: ['showcase:risk-Q4'],
          firstAction: 'A human decides whether to capture it.',
        },
      }),
    ).rejects.toThrow('Exactly one');
  });
});

async function worktreeFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'evidence-respond-learner-'));
  temporaryPaths.push(root);
  const worktree = join(root, 'worktree');
  await mkdir(join(worktree, 'libs/server-java/domain/src/main/java'), {
    recursive: true,
  });
  await writeFile(
    join(worktree, 'libs/server-java/domain/src/main/java/Respond.java'),
    'final class Respond {}\n',
  );
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
