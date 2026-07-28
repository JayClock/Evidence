import { describe, expect, it, vi } from 'vitest';
import type { ShowcaseResourceData } from '@evidence/api-client';
import type { IterationWorktreeSnapshot } from './iteration-worktree';
import { ShowcaseController } from './showcase-controller';
import type { RemoteShowcase } from './showcase-api-client';

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
      },
      commands,
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
