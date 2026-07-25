import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  CodingAgentEvent,
  CodingAgentRuntimeRequest,
} from './coding-agent-protocol';
import { CodingController } from './coding-controller';
import type { CodingQualityGateRunner } from './coding-quality-gates';
import type {
  CodingRunClient,
  RemoteCodingRunResource,
} from './coding-run-client';
import { CodingWorktreeManager } from './coding-worktree';
import { gitHead, runGit } from './git-repository';
import type { LocalAgent } from './local-agent';

const temporaryPaths: string[] = [];
const diffPattern = /^sha256:[a-f0-9]{64}$/;

afterEach(async () => {
  await Promise.all(
    temporaryPaths
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe('CodingController', () => {
  it('runs locally, records only bounded facts, and commits after acceptance', async () => {
    const root = await temporaryDirectory();
    const repository = await createRepository(root);
    const remote = remoteFixture();
    const agent = agentFixture(async (request) => {
      await writeFile(
        join(request.worktreeRoot, 'tracked.txt'),
        'implemented\n',
      );
    });
    const gates = qualityFixture('passed');
    const controller = new CodingController(
      'https://api.example.test/api',
      { find: vi.fn(async () => binding(repository)) },
      new CodingWorktreeManager(join(root, 'worktrees')),
      remote.client,
      agent,
      gates,
    );
    const events: Array<{ event: string; data: string }> = [];

    await controller.run(request(), (event) => events.push(event));

    expect(remote.submitForReview).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'run-1', version: 1 }),
      expect.objectContaining({
        diffSha256: expect.stringMatching(diffPattern),
        changedFileCount: 1,
        qualityChecks: [
          expect.objectContaining({
            name: 'pnpm test',
            status: 'passed',
            summary: 'Gate passed.',
          }),
        ],
      }),
      expect.any(AbortSignal),
    );
    const review = controller.getReview('run-1');
    expect(review).toMatchObject({
      diffSha256: expect.stringMatching(diffPattern),
      changedFileCount: 1,
    });
    expect(review?.diff).toContain('implemented');
    expect(events.map((event) => event.event)).toContain('review-ready');
    expect(await gitHead(repository)).toBe(await initialCommit(repository));

    const accepted = await controller.accept({
      workspaceId: 'workspace-1',
      runId: 'run-1',
      diffSha256: review?.diffSha256 ?? '',
    });

    expect(accepted.status).toBe('accepted');
    expect(remote.accept).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'review_required' }),
      review?.diffSha256,
      expect.stringMatching(/^[a-f0-9]{40}$/),
    );
    expect(controller.getReview('run-1')).toBeNull();
    expect(await gitHead(repository)).toBe(await initialCommit(repository));
    expect(
      await runGit(repository, [
        'show-ref',
        '--verify',
        'refs/heads/evidence/run-run-1',
      ]),
    ).toBeTruthy();
  });

  it('marks a failed gate without sending local output or retaining work', async () => {
    const root = await temporaryDirectory();
    const repository = await createRepository(root);
    const remote = remoteFixture();
    const controller = new CodingController(
      'https://api.example.test/api',
      { find: vi.fn(async () => binding(repository)) },
      new CodingWorktreeManager(join(root, 'worktrees')),
      remote.client,
      agentFixture(async (agentRequest) => {
        await writeFile(
          join(agentRequest.worktreeRoot, 'tracked.txt'),
          'broken implementation\n',
        );
      }),
      qualityFixture('failed'),
    );

    await expect(controller.run(request(), () => undefined)).rejects.toThrow(
      'quality gates failed',
    );

    expect(remote.fail).toHaveBeenCalledWith(
      expect.any(Object),
      'quality-gate',
      'One or more local quality gates failed.',
    );
    expect(JSON.stringify(remote.fail.mock.calls)).not.toContain(
      'broken implementation',
    );
    expect(controller.getReview('run-1')).toBeNull();
  });
});

function request() {
  return {
    id: 'request-1',
    workspaceId: 'workspace-1',
    storyId: 'story-1',
    storyRevisionId: 'revision-2',
  };
}

function binding(repositoryRoot: string) {
  return {
    apiBaseUrl: 'https://api.example.test/api',
    workspaceId: 'workspace-1',
    repositoryRoot,
    boundAt: '2026-07-24T00:00:00.000Z',
  };
}

function remoteFixture() {
  const running = runResource('running', 1);
  const review = runResource('review_required', 2);
  const accepted = runResource('accepted', 3, 'c'.repeat(40));
  const start = vi.fn(async () => running);
  const submitForReview = vi.fn(async () => review);
  const fail = vi.fn(async () => runResource('failed', 2));
  const accept = vi.fn(async () => accepted);
  const client = {
    getStory: vi.fn(async () => ({
      id: 'story-1',
      latestRevisionId: 'revision-2',
      latestScenarioCount: 1,
      links: { 'start-coding-run': '/api/start' },
    })),
    getStoryRevision: vi.fn(async () => ({
      id: 'revision-2',
      revisionNumber: 2,
      title: 'Local coding agent',
      problem: 'Code must stay local.',
      role: 'Maintainer',
      goal: 'Implement the Story.',
      value: 'Keep source private.',
      cognitiveMode: 'complicated',
      contentSha256: `sha256:${'d'.repeat(64)}`,
      scenarios: [
        {
          id: 'scenario-1',
          title: 'Implement locally',
          given: ['A bound repository.'],
          when: 'The user starts coding.',
          then: ['The change is isolated.'],
        },
      ],
    })),
    start,
    submitForReview,
    fail,
    cancel: vi.fn(async () => runResource('cancelled', 2)),
    accept,
    reject: vi.fn(async () => runResource('rejected', 3)),
  } as unknown as CodingRunClient;
  return { accept, client, fail, start, submitForReview };
}

function runResource(
  status:
    | 'running'
    | 'review_required'
    | 'failed'
    | 'cancelled'
    | 'accepted'
    | 'rejected',
  version: number,
  commitSha: string | null = null,
): RemoteCodingRunResource {
  const raw = {
    id: 'run-1',
    storyId: 'story-1',
    storyRevisionId: 'revision-2',
    status,
    version,
    baseCommitSha: 'a'.repeat(40),
    diffSha256: status === 'running' ? null : `sha256:${'b'.repeat(64)}`,
    commitSha,
  };
  return {
    ...raw,
    links: {
      review: '/api/review',
      fail: '/api/fail',
      cancel: '/api/cancel',
      accept: '/api/accept',
      reject: '/api/reject',
    },
    raw,
  };
}

function agentFixture(
  implementation: (request: CodingAgentRuntimeRequest) => Promise<void>,
) {
  return {
    run: vi.fn(
      async (
        agentRequest: CodingAgentRuntimeRequest,
        emit: (event: { id: string; event: string; data: string }) => void,
      ) => {
        await implementation(agentRequest);
        emit({ id: agentRequest.id, event: 'complete', data: '' });
      },
    ),
    cancel: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined),
  } as unknown as Pick<
    LocalAgent<CodingAgentRuntimeRequest, CodingAgentEvent>,
    'run' | 'cancel' | 'stop'
  >;
}

function qualityFixture(status: 'passed' | 'failed') {
  return {
    lock: vi.fn(async () => ({ test: 'vitest run' })),
    run: vi.fn(
      async (
        _root: string,
        _lockedScripts: Record<string, string>,
        _signal: AbortSignal,
        onCheck: (check: {
          name: string;
          status: 'passed' | 'failed';
          durationMs: number;
          summary: string;
        }) => void,
      ) => {
        const check = {
          name: 'pnpm test',
          status,
          durationMs: 10,
          summary: status === 'passed' ? '55 tests passed.' : 'secret output',
        };
        onCheck(check);
        return [check];
      },
    ),
  } as unknown as CodingQualityGateRunner;
}

async function createRepository(root: string): Promise<string> {
  const repository = join(root, 'repository');
  await mkdir(repository);
  await runGit(repository, ['init', '--initial-branch=main']);
  await runGit(repository, ['config', 'user.name', 'Evidence Test']);
  await runGit(repository, ['config', 'user.email', 'test@evidence.local']);
  await writeFile(join(repository, 'tracked.txt'), 'original\n');
  await runGit(repository, ['add', 'tracked.txt']);
  await runGit(repository, ['commit', '-m', 'Initial commit']);
  return repository;
}

async function initialCommit(repository: string): Promise<string> {
  return (await runGit(repository, ['rev-parse', 'main'])).trim();
}

async function temporaryDirectory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'evidence-coding-controller-'));
  temporaryPaths.push(path);
  return path;
}
