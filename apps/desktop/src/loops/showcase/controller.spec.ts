import { describe, expect, it, vi } from 'vitest';
import type { ShowcaseResourceData } from '@evidence/api-client';
import type { IterationWorktreeSnapshot } from '../../capabilities/work-item-worktree/manager';
import { ShowcaseController } from './controller';
import type { RemoteShowcase } from './api-client';
import type {
  ShowcaseReviewerEvent,
  ShowcaseReviewerRuntimeRequest,
} from './reviewer-protocol';

const sha256 = `sha256:${'a'.repeat(64)}`;
const commit = 'c'.repeat(40);

function remote(
  nextAction: ShowcaseResourceData['nextAction'],
): RemoteShowcase {
  return {
    data: {
      iteration: {
        id: 'iteration-1',
      },
      approvedPlan: {
        plan: {
          tests: [{ id: 'TEST-002', quadrant: 'Q2' }],
        },
      },
      pairRun: {
        baseCommitSha: 'b'.repeat(40),
        branchName: 'evidence/iter-iteration-1',
      },
      run: {
        id: 'showcase-1',
        stage: 'setup',
        version: 1,
        evidenceBundleSha256: null,
      },
      q2Observations: [],
      productObservations: [],
      riskDecisions: [],
      evaluations: [],
      nextAction,
    } as unknown as ShowcaseResourceData,
    links: {},
    raw: {},
  };
}

function reviewReadyRemote(): RemoteShowcase {
  return {
    data: {
      iteration: { id: 'iteration-1' },
      story: { reference: 'US-001' },
      storyRevision: {
        title: 'Observe delivered value',
        problem: 'Passing code alone does not prove product value.',
        role: 'Delivery lead',
        goal: 'Observe the approved increment.',
        value: 'Keep value acceptance human-owned.',
        scenarios: [
          {
            reference: 'SC-001',
            title: 'Observe value',
            given: ['an approved increment'],
            when: 'the product is opened',
            then: ['the behavior is visible'],
            businessData: ['workspace-1'],
          },
        ],
      },
      approvedPlan: { plan: { tests: [{ id: 'TEST-002', quadrant: 'Q2' }] } },
      pairRun: {
        baseCommitSha: 'b'.repeat(40),
        branchName: 'evidence/iter-iteration-1',
      },
      pairManifest: {
        contentSha256: sha256,
        finalDiffSha256: sha256,
        changedPaths: ['apps/desktop/src/showcase.ts'],
      },
      run: {
        id: 'showcase-1',
        stage: 'reviewing',
        version: 6,
        evidenceBundleSha256: sha256,
        approvedCommitSha: commit,
      },
      q2Observations: [
        {
          testId: 'TEST-002',
          scenarioIds: ['scenario-1'],
          command: 'pnpm nx run @evidence/desktop:package-smoke',
          termination: 'exited',
          exitCode: 0,
          recordSha256: sha256,
        },
      ],
      productObservations: [
        {
          scenarioReference: 'SC-001',
          observedOutcomes: ['The behavior was visible.'],
          observation: 'Observed in the product surface.',
          valueFeedback: 'The intended value is present.',
          evidenceRefs: ['evidence:observation-1'],
        },
      ],
      riskDecisions: [
        {
          quadrant: 'Q3',
          disposition: 'not_required',
          activities: [],
          reason: 'No additional risk.',
        },
        {
          quadrant: 'Q4',
          disposition: 'not_required',
          activities: [],
          reason: 'No additional risk.',
        },
      ],
      evaluations: [],
      nextAction: {
        actionId: 'ACT-REVIEW',
        expectedShowcaseVersion: 6,
        kind: 'run_reviewer',
        evidenceBundleSha256: sha256,
      },
    } as unknown as ShowcaseResourceData,
    links: {},
    raw: {},
  };
}

function q2Action(): ShowcaseResourceData['nextAction'] {
  return {
    actionId: 'ACT-001',
    expectedShowcaseVersion: 1,
    kind: 'execute_q2',
    testId: 'TEST-002',
    scenarioIds: ['scenario-1'],
    processId: 'typescript-electron-shell',
    stepId: 'electron-package-q2',
    projectId: null,
    command: 'pnpm nx run @evidence/desktop:package-smoke',
    timeoutMs: 10_000,
    approvedCommitSha: commit,
  };
}

function reviewer() {
  return {
    run: vi.fn(async () => undefined),
    cancel: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined),
  };
}

function snapshot(): IterationWorktreeSnapshot {
  return {
    content: '',
    sha256,
    changedFileCount: 0,
    headSha: commit,
    changedPaths: [],
    pathFingerprints: {},
    worktreeSha256: sha256,
  };
}

describe('ShowcaseController', () => {
  it('runs only the Server-authorized Q2 command at the approved commit', async () => {
    const initial = remote(q2Action());
    const completed = remote({
      actionId: 'ACT-002',
      expectedShowcaseVersion: 2,
      kind: 'observe_scenario',
      scenarioId: 'scenario-1',
      scenarioReference: 'SC-001',
    });
    completed.data.run.version = 2;
    completed.data.q2Observations = [
      {
        termination: 'exited',
        exitCode: 0,
      } as ShowcaseResourceData['q2Observations'][number],
    ];
    const client = {
      getShowcase: vi.fn(async () => initial),
      recordQ2Observation: vi.fn(async () => completed),
      recordReview: vi.fn(),
    };
    const worktrees = {
      locate: vi.fn(() => ({
        iterationId: 'iteration-1',
        repositoryRoot: '/repo',
        worktreeRoot: '/managed/iteration-1',
        branchName: 'evidence/iter-iteration-1',
        baseCommitSha: 'b'.repeat(40),
      })),
      recover: vi.fn(async (worktree) => worktree),
      snapshotApproved: vi.fn(async () => snapshot()),
    };
    const commands = {
      run: vi.fn(async () => ({
        command: 'pnpm nx run @evidence/desktop:package-smoke',
        executable: 'pnpm',
        args: ['nx', 'run', '@evidence/desktop:package-smoke'],
        termination: 'exited' as const,
        exitCode: 0,
        signal: null,
        durationMs: 100,
        stdout: 'ok',
        stderr: '',
        stdoutSha256: sha256,
        stdoutBytes: 2,
        stdoutLines: 1,
        stderrSha256: sha256,
        stderrBytes: 0,
        stderrLines: 0,
      })),
    };
    const controller = new ShowcaseController({
      apiBaseUrl: 'https://evidence.example/api',
      bindings: {
        find: vi.fn(async () => ({
          apiBaseUrl: 'https://evidence.example/api',
          workspaceId: 'workspace-1',
          repositoryRoot: '/repo',
          boundAt: '2026-08-03T00:00:00.000Z',
        })),
      },
      worktrees,
      client,
      commands,
      reviewer: reviewer(),
    });

    const result = await controller.runChecks({
      id: 'request-1',
      workspaceId: 'workspace-1',
      iterationId: 'iteration-1',
    });

    expect(commands.run).toHaveBeenCalledWith(
      'pnpm nx run @evidence/desktop:package-smoke',
      expect.objectContaining({
        cwd: '/managed/iteration-1',
        timeoutMs: 10_000,
      }),
    );
    expect(worktrees.snapshotApproved).toHaveBeenCalledTimes(2);
    expect(worktrees.snapshotApproved).toHaveBeenCalledWith(
      expect.anything(),
      commit,
    );
    expect(client.recordQ2Observation).toHaveBeenCalledWith(
      initial,
      expect.objectContaining({
        showcaseRunId: 'showcase-1',
        actionId: 'ACT-001',
        approvedCommitSha: commit,
        stdoutSha256: sha256,
        stdoutBytes: 2,
      }),
      expect.any(AbortSignal),
    );
    expect(result).toMatchObject({
      nextAction: 'observe_scenario',
      q2Passed: 1,
      q2Total: 1,
    });
  });

  it('runs an independent read-only Reviewer before human value authority', async () => {
    const ready = reviewReadyRemote();
    const reviewed = reviewReadyRemote();
    reviewed.data.run.stage = 'decision';
    reviewed.data.run.version = 7;
    reviewed.data.nextAction = {
      actionId: 'ACT-DECIDE',
      expectedShowcaseVersion: 7,
      kind: 'await_human',
      reviewId: 'review-1',
      reviewSha256: sha256,
    };
    const reviewerAgent = {
      run: vi.fn(
        async (
          _request: ShowcaseReviewerRuntimeRequest,
          emit: (event: ShowcaseReviewerEvent) => void,
        ) => {
          emit({
            id: 'ACT-REVIEW',
            event: 'complete',
            data: '',
            details: {
              observedFacts: ['Q2 and product observations agree.'],
              productDomainFeedback: ['The intended value is observable.'],
              technicalQualityFeedback: ['The trust boundary remains intact.'],
              unresolvedAssumptions: [],
              recommendation: 'accept',
              agentCallCount: 1,
            },
          });
        },
      ),
      cancel: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
    };
    const client = {
      getShowcase: vi.fn(async () => ready),
      recordQ2Observation: vi.fn(),
      recordReview: vi.fn(async () => reviewed),
    };
    const controller = new ShowcaseController({
      apiBaseUrl: 'https://evidence.example/api',
      bindings: {
        find: vi.fn(async () => ({
          apiBaseUrl: 'https://evidence.example/api',
          workspaceId: 'workspace-1',
          repositoryRoot: '/repo',
          boundAt: '2026-08-03T00:00:00.000Z',
        })),
      },
      worktrees: {
        locate: vi.fn(() => ({
          iterationId: 'iteration-1',
          repositoryRoot: '/repo',
          worktreeRoot: '/managed/iteration-1',
          branchName: 'evidence/iter-iteration-1',
          baseCommitSha: 'b'.repeat(40),
        })),
        recover: vi.fn(async (worktree) => worktree),
        snapshotApproved: vi.fn(async () => snapshot()),
      },
      client,
      commands: { run: vi.fn() },
      reviewer: reviewerAgent,
    });

    const result = await controller.runReviewer({
      id: 'request-review',
      workspaceId: 'workspace-1',
      iterationId: 'iteration-1',
    });

    expect(reviewerAgent.run).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'ACT-REVIEW',
        worktreeRoot: '/managed/iteration-1',
        evidenceBundleSha256: sha256,
        pair: expect.objectContaining({
          changedPaths: ['apps/desktop/src/showcase.ts'],
        }),
      }),
      expect.any(Function),
    );
    expect(client.recordReview).toHaveBeenCalledWith(
      ready,
      expect.objectContaining({
        expectedShowcaseVersion: 6,
        evidenceBundleSha256: sha256,
        recommendation: 'accept',
      }),
      expect.any(AbortSignal),
    );
    expect(result).toMatchObject({
      stage: 'decision',
      nextAction: 'await_human',
    });
  });

  it('never executes commands when Showcase is waiting for a human', async () => {
    const showcase = remote({
      actionId: 'ACT-002',
      expectedShowcaseVersion: 2,
      kind: 'observe_scenario',
      scenarioId: 'scenario-1',
      scenarioReference: 'SC-001',
    });
    const commands = { run: vi.fn() };
    const controller = new ShowcaseController({
      apiBaseUrl: 'https://evidence.example/api',
      bindings: {
        find: vi.fn(async () => ({
          apiBaseUrl: 'https://evidence.example/api',
          workspaceId: 'workspace-1',
          repositoryRoot: '/repo',
          boundAt: '2026-08-03T00:00:00.000Z',
        })),
      },
      worktrees: {
        locate: vi.fn(() => ({
          iterationId: 'iteration-1',
          repositoryRoot: '/repo',
          worktreeRoot: '/managed/iteration-1',
          branchName: 'evidence/iter-iteration-1',
          baseCommitSha: 'b'.repeat(40),
        })),
        recover: vi.fn(async (worktree) => worktree),
        snapshotApproved: vi.fn(),
      },
      client: {
        getShowcase: vi.fn(async () => showcase),
        recordQ2Observation: vi.fn(),
        recordReview: vi.fn(),
      },
      commands,
      reviewer: reviewer(),
    });

    const result = await controller.runChecks({
      id: 'request-2',
      workspaceId: 'workspace-1',
      iterationId: 'iteration-1',
    });

    expect(commands.run).not.toHaveBeenCalled();
    expect(result.nextAction).toBe('observe_scenario');
  });
});
