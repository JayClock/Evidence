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
import { CodingRunStore } from './coding-run-store';
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
      new CodingRunStore(join(root, 'coding-runs.json')),
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
    const review = await controller.getReview('run-1');
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
    expect(await controller.getReview('run-1')).toBeNull();
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
      new CodingRunStore(join(root, 'coding-runs.json')),
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
    expect(await controller.getReview('run-1')).toBeNull();
  });

  it('fails an orphaned running Run after Desktop restarts', async () => {
    const root = await temporaryDirectory();
    const remote = remoteFixture();
    const store = new CodingRunStore(join(root, 'coding-runs.json'));
    await store.save({
      apiBaseUrl: 'https://api.example.test/api',
      workspaceId: 'workspace-1',
      runId: 'run-1',
      worktree: null,
      diffSha256: null,
      changedFileCount: null,
      commitSha: null,
    });
    const controller = new CodingController(
      'https://api.example.test/api',
      { find: vi.fn(async () => null) },
      new CodingWorktreeManager(join(root, 'worktrees')),
      remote.client,
      store,
      agentFixture(async () => undefined),
      qualityFixture('passed'),
    );

    await controller.recover();

    expect(remote.fail).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'running' }),
      'desktop-restarted',
      'Local Desktop execution ended before review.',
    );
    await expect(
      store.find('https://api.example.test/api', 'run-1'),
    ).resolves.toBeNull();
  });

  it('recovers when Desktop stops between commit and manifest update', async () => {
    const root = await temporaryDirectory();
    const repository = await createRepository(root);
    const remote = remoteFixture();
    const storePath = join(root, 'coding-runs.json');
    const worktreeRoot = join(root, 'worktrees');
    const store = new CodingRunStore(storePath);
    const first = new CodingController(
      'https://api.example.test/api',
      { find: vi.fn(async () => binding(repository)) },
      new CodingWorktreeManager(worktreeRoot),
      remote.client,
      store,
      agentFixture(async (agentRequest) => {
        await writeFile(
          join(agentRequest.worktreeRoot, 'tracked.txt'),
          'committed before crash\n',
        );
      }),
      qualityFixture('passed'),
    );
    await first.run(request(), () => undefined);
    const review = await first.getReview('run-1');
    vi.spyOn(store, 'save').mockRejectedValueOnce(
      new Error('manifest update interrupted'),
    );

    await expect(
      first.accept({
        workspaceId: 'workspace-1',
        runId: 'run-1',
        diffSha256: review?.diffSha256 ?? '',
      }),
    ).rejects.toThrow('manifest update interrupted');

    const restarted = new CodingController(
      'https://api.example.test/api',
      { find: vi.fn(async () => binding(repository)) },
      new CodingWorktreeManager(worktreeRoot),
      remote.client,
      new CodingRunStore(storePath),
      agentFixture(async () => undefined),
      qualityFixture('passed'),
    );
    await restarted.recover();
    const recovered = await restarted.getReview('run-1');

    expect(recovered?.diffSha256).toBe(review?.diffSha256);
    await expect(
      restarted.accept({
        workspaceId: 'workspace-1',
        runId: 'run-1',
        diffSha256: recovered?.diffSha256 ?? '',
      }),
    ).resolves.toMatchObject({ status: 'accepted' });
  });

  it('recovers a committed review when Server acceptance is interrupted', async () => {
    const root = await temporaryDirectory();
    const repository = await createRepository(root);
    const remote = remoteFixture();
    const storePath = join(root, 'coding-runs.json');
    const worktreeRoot = join(root, 'worktrees');
    const first = new CodingController(
      'https://api.example.test/api',
      { find: vi.fn(async () => binding(repository)) },
      new CodingWorktreeManager(worktreeRoot),
      remote.client,
      new CodingRunStore(storePath),
      agentFixture(async (agentRequest) => {
        await writeFile(
          join(agentRequest.worktreeRoot, 'tracked.txt'),
          'committed implementation\n',
        );
      }),
      qualityFixture('passed'),
    );
    await first.run(request(), () => undefined);
    const review = await first.getReview('run-1');
    remote.accept.mockRejectedValueOnce(new Error('connection interrupted'));

    await expect(
      first.accept({
        workspaceId: 'workspace-1',
        runId: 'run-1',
        diffSha256: review?.diffSha256 ?? '',
      }),
    ).rejects.toThrow('connection interrupted');

    const restarted = new CodingController(
      'https://api.example.test/api',
      { find: vi.fn(async () => binding(repository)) },
      new CodingWorktreeManager(worktreeRoot),
      remote.client,
      new CodingRunStore(storePath),
      agentFixture(async () => undefined),
      qualityFixture('passed'),
    );
    await restarted.recover();
    const recovered = await restarted.getReview('run-1');

    expect(recovered?.diffSha256).toBe(review?.diffSha256);
    await expect(
      restarted.accept({
        workspaceId: 'workspace-1',
        runId: 'run-1',
        diffSha256: recovered?.diffSha256 ?? '',
      }),
    ).resolves.toMatchObject({ status: 'accepted' });
  });

  it('recovers a reviewable diff after Desktop restarts', async () => {
    const root = await temporaryDirectory();
    const repository = await createRepository(root);
    const remote = remoteFixture();
    const storePath = join(root, 'coding-runs.json');
    const worktreeRoot = join(root, 'worktrees');
    const first = new CodingController(
      'https://api.example.test/api',
      { find: vi.fn(async () => binding(repository)) },
      new CodingWorktreeManager(worktreeRoot),
      remote.client,
      new CodingRunStore(storePath),
      agentFixture(async (agentRequest) => {
        await writeFile(
          join(agentRequest.worktreeRoot, 'tracked.txt'),
          'recoverable implementation\n',
        );
      }),
      qualityFixture('passed'),
    );
    await first.run(request(), () => undefined);

    const restarted = new CodingController(
      'https://api.example.test/api',
      { find: vi.fn(async () => binding(repository)) },
      new CodingWorktreeManager(worktreeRoot),
      remote.client,
      new CodingRunStore(storePath),
      agentFixture(async () => undefined),
      qualityFixture('passed'),
    );

    await restarted.recover();

    const review = await restarted.getReview('run-1');
    expect(review).toMatchObject({
      diffSha256: expect.stringMatching(diffPattern),
      changedFileCount: 1,
    });
    expect(review?.diff).toContain('recoverable implementation');
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
  let current = runResource('running', 1);
  const start = vi.fn(
    async (
      _story: unknown,
      input: { storyRevisionId: string; baseCommitSha: string },
    ) => {
      current = runResource(
        'running',
        1,
        null,
        null,
        null,
        input.baseCommitSha,
      );
      return current;
    },
  );
  const submitForReview = vi.fn(
    async (
      _run: RemoteCodingRunResource,
      input: { diffSha256: string; changedFileCount: number },
    ) => {
      current = runResource(
        'review_required',
        2,
        null,
        input.diffSha256,
        input.changedFileCount,
        current.baseCommitSha,
      );
      return current;
    },
  );
  const fail = vi.fn(async () => {
    current = runResource('failed', 2);
    return current;
  });
  const accept = vi.fn(async () => {
    current = runResource(
      'accepted',
      3,
      'c'.repeat(40),
      current.diffSha256,
      current.changedFileCount,
      current.baseCommitSha,
    );
    return current;
  });
  const client = {
    getStory: vi.fn(async () => ({
      id: 'story-1',
      latestRevisionId: 'revision-2',
      latestScenarioCount: 1,
      links: { 'start-coding-run': '/api/start' },
    })),
    getRun: vi.fn(async () => current),
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
    cancel: vi.fn(async () => {
      current = runResource('cancelled', 2);
      return current;
    }),
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
  diffSha256: string | null = status === 'running'
    ? null
    : `sha256:${'b'.repeat(64)}`,
  changedFileCount: number | null = status === 'running' ? null : 1,
  baseCommitSha = 'a'.repeat(40),
): RemoteCodingRunResource {
  const raw = {
    id: 'run-1',
    storyId: 'story-1',
    storyRevisionId: 'revision-2',
    status,
    version,
    baseCommitSha,
    diffSha256,
    changedFileCount,
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
