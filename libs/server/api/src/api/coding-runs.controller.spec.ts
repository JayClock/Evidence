import { describe, expect, it, vi } from 'vitest';
import { CodingRun, Ref, type Workspace } from '@evidence/server-domain';
import {
  CodingRunsController,
  StoryCodingRunsController,
} from './coding-runs.controller';
import { codingRunModel } from './model';
import type { ResourceResolver } from './resource-resolver.service';

const timestamp = '2026-07-24T00:00:00.000Z';
const baseCommitSha = 'a'.repeat(40);
const diffSha256 = `sha256:${'b'.repeat(64)}`;

function run(
  status: 'running' | 'review_required' | 'accepted' = 'running',
  version = 1,
): CodingRun {
  return new CodingRun('run-1', {
    workspace: new Ref('workspace-1'),
    story: new Ref('story-1'),
    storyRevision: new Ref('revision-2'),
    requestedBy: new Ref('user-1'),
    status,
    version,
    baseCommitSha,
    diffSha256: status === 'running' ? null : diffSha256,
    changedFileCount: status === 'running' ? null : 2,
    qualityChecks:
      status === 'running'
        ? []
        : [
            {
              name: 'pnpm test',
              status: 'passed',
              durationMs: 1200,
              summary: 'All tests passed.',
            },
          ],
    commitSha: status === 'accepted' ? 'c'.repeat(40) : null,
    failureCode: null,
    failureSummary: null,
    decisionReason: null,
    startedAt: timestamp,
    executionFinishedAt: status === 'running' ? null : timestamp,
    decidedBy: status === 'accepted' ? new Ref('user-1') : null,
    decidedAt: status === 'accepted' ? timestamp : null,
  });
}

function fixture() {
  const running = run();
  const review = run('review_required', 2);
  const workspace = {
    listCodingRuns: vi.fn(async () => [[running], 1]),
    startCodingRun: vi.fn(async () => running),
    submitCodingRunForReview: vi.fn(async () => review),
    failCodingRun: vi.fn(async () => run('running', 2)),
    cancelCodingRun: vi.fn(async () => run('running', 2)),
    acceptCodingRun: vi.fn(async () => run('accepted', 3)),
    rejectCodingRun: vi.fn(async () => run('accepted', 3)),
  } as unknown as Workspace;
  const resolver = {
    currentUserId: vi.fn(() => 'user-1'),
    requireWorkspaceStory: vi.fn(async () => [workspace, {}]),
    requireWorkspaceCodingRun: vi.fn(async () => [workspace, running]),
  } as unknown as ResourceResolver;
  return { resolver, running, review, workspace };
}

describe('Coding Run API', () => {
  it('starts a run locked to the supplied Story Revision and base commit', async () => {
    const { resolver, workspace } = fixture();
    const controller = new StoryCodingRunsController(resolver);
    const setHeader = vi.fn();

    const model = await controller.start(
      'workspace-1',
      'story-1',
      { storyRevisionId: 'revision-2', baseCommitSha },
      { setHeader },
    );

    expect(workspace.startCodingRun).toHaveBeenCalledWith(
      'story-1',
      { storyRevisionId: 'revision-2', baseCommitSha },
      'user-1',
    );
    expect(setHeader).toHaveBeenCalledWith(
      'Location',
      '/api/workspaces/workspace-1/coding-runs/run-1',
    );
    expect(model).toMatchObject({ status: 'running', version: 1 });
  });

  it('lists only the selected Story runs with HAL pagination', async () => {
    const { resolver, workspace } = fixture();
    const controller = new StoryCodingRunsController(resolver);

    const collection = await controller.list(
      'workspace-1',
      'story-1',
      '1',
      '20',
      'running',
    );

    expect(workspace.listCodingRuns).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
      storyId: 'story-1',
      status: 'running',
    });
    expect(collection._embedded.codingRuns).toHaveLength(1);
    expect(collection._links.story?.href).toBe(
      '/api/workspaces/workspace-1/stories/story-1',
    );
  });

  it('submits bounded controller facts for human review', async () => {
    const { resolver, workspace } = fixture();
    const controller = new CodingRunsController(resolver);

    const model = await controller.review('workspace-1', 'run-1', {
      expectedVersion: 1,
      diffSha256,
      changedFileCount: 2,
      qualityChecks: [
        {
          name: 'pnpm test',
          status: 'passed',
          durationMs: 1200,
          summary: 'All tests passed.',
        },
      ],
    });

    expect(workspace.submitCodingRunForReview).toHaveBeenCalledWith(
      'run-1',
      1,
      expect.objectContaining({ diffSha256, changedFileCount: 2 }),
    );
    expect(model._links.accept?.href).toBe(
      '/api/workspaces/workspace-1/coding-runs/run-1/accept',
    );
    expect(model._links.review).toBeUndefined();
  });

  it('publishes only legal transition links', () => {
    expect(codingRunModel(run())._links).toMatchObject({
      review: expect.any(Object),
      fail: expect.any(Object),
      cancel: expect.any(Object),
    });
    expect(codingRunModel(run('review_required', 2))._links).toMatchObject({
      accept: expect.any(Object),
      reject: expect.any(Object),
    });
    expect(codingRunModel(run('accepted', 3))._links.accept).toBeUndefined();
  });
});
