import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type {
  PairResourceData,
  RecordPairDriverAttemptInput,
} from '@evidence/api-client';
import type {
  IterationWorktree,
  IterationWorktreeSnapshot,
} from './iteration-worktree';
import type { PairDriverRuntimeRequest } from './pair-agent-protocol';
import type { PairRedReviewerRuntimeRequest } from './pair-red-reviewer-protocol';
import type { RemotePair } from './pair-api-client';
import type {
  PairCheckpointInput,
  PairLocalCheckpoint,
} from './pair-checkpoint-store';
import type { PairCommandResult } from './pair-command-runner';
import { PairController, type PairControllerOptions } from './pair-controller';

const baseCommitSha = 'b'.repeat(40);
const approvedSha = digest('approved-plan');
const storySha = digest('story-revision');
const repositoryRoot = '/repository';
const worktree: IterationWorktree = {
  iterationId: 'iteration-1',
  repositoryRoot,
  worktreeRoot: '/managed/iteration-1',
  branchName: 'evidence/iter-iteration-1',
  baseCommitSha,
};

describe('PairController', () => {
  it('drives each TEST through Red, independent review, Green, Refactor, and gates', async () => {
    const harness = createHarness();
    const events: string[] = [];

    const result = await harness.controller.start(request(), (event) =>
      events.push(event.message),
    );

    expect(result).toMatchObject({
      status: 'approval_required',
      checkpoint: 'quality_gates_passed',
      nextAction: 'await_human',
      manifestSha256: digest('manifest'),
    });
    expect(harness.driverRequests.map(({ role }) => role)).toEqual([
      'test',
      'production',
      'refactor',
    ]);
    expect(harness.reviewerRequests).toHaveLength(1);
    expect(harness.reviewerRequests[0]?.observation).toMatchObject({
      exitCode: 1,
      stdout: 'observable assertion failed',
    });
    expect(harness.commandInputs.map(({ stage }) => stage)).toEqual([
      'red',
      'green',
      'refactor',
      'quality_gate',
    ]);
    expect(harness.commandInputs[0]).not.toHaveProperty('stdout');
    expect(
      harness.driverInputs.map(({ changedPaths }) => changedPaths),
    ).toEqual([
      ['libs/feature/pair.spec.ts'],
      ['libs/feature/pair.ts'],
      ['libs/feature/pair.ts'],
    ]);
    expect(events.at(-1)).toContain('review the complete Story diff');
    expect(harness.checkpoint.pendingEvidence).toBeNull();
  });

  it('restores the confirmed checkpoint and records a path violation', async () => {
    const harness = createHarness({ invalidTestPath: true });

    const result = await harness.controller.start(request());

    expect(result).toMatchObject({
      status: 'exception',
      checkpoint: 'exception',
      nextAction: 'resolve_exception',
      exception: { kind: 'path_violation' },
    });
    expect(harness.driverInputs).toHaveLength(0);
    expect(harness.exceptionInputs).toEqual([
      expect.objectContaining({ kind: 'path_violation' }),
    ]);
    expect(harness.worktreeState.snapshot().changedPaths).toEqual([]);
  });

  it('replays locally durable evidence instead of rerunning a Driver', async () => {
    const harness = createHarness({ pendingDriver: true });

    const result = await harness.controller.resume(request());

    expect(result.status).toBe('exception');
    expect(harness.driverRequests).toHaveLength(0);
    expect(harness.driverInputs).toEqual([
      expect.objectContaining({ actionId: 'ACT-test-driver' }),
    ]);
    expect(harness.checkpoint.pendingEvidence).toBeNull();
  });

  it('commits only the reviewed Manifest diff before recording approval', async () => {
    const harness = createHarness({ approvalRequired: true });
    const finalDiff = harness.worktreeState.snapshot().sha256;
    await expect(
      harness.controller.review({
        ...request(),
        expectedManifestSha256: digest('manifest'),
      }),
    ).resolves.toMatchObject({
      manifestSha256: digest('manifest'),
      diffSha256: finalDiff,
      diff: harness.worktreeState.snapshot().content,
    });

    const result = await harness.controller.approve({
      ...request(),
      expectedManifestSha256: digest('manifest'),
      expectedDiffSha256: finalDiff,
      commitMessage: 'feat(desktop): implement approved story',
      reason: 'Reviewed the complete Story diff.',
    });

    expect(harness.commit).toHaveBeenCalledWith(
      worktree,
      finalDiff,
      'feat(desktop): implement approved story',
    );
    expect(harness.decisions).toEqual([
      expect.objectContaining({
        action: 'approve',
        manifestSha256: digest('manifest'),
        diffSha256: finalDiff,
        commitSha: 'c'.repeat(40),
      }),
    ]);
    expect(harness.clearCheckpoint).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      status: 'approved',
      checkpoint: 'approved',
      commitSha: 'c'.repeat(40),
    });
  });
});

function createHarness(
  options: {
    invalidTestPath?: boolean;
    pendingDriver?: boolean;
    approvalRequired?: boolean;
  } = {},
) {
  const worktreeState = new WorktreeState();
  if (options.pendingDriver || options.approvalRequired) {
    worktreeState.testChange();
  }
  const driverRequests: PairDriverRuntimeRequest[] = [];
  const reviewerRequests: PairRedReviewerRuntimeRequest[] = [];
  const driverInputs: RecordPairDriverAttemptInput[] = [];
  const commandInputs: Array<{ stage: string }> = [];
  const exceptionInputs: Array<{ kind: string }> = [];
  const decisions: Array<Record<string, unknown>> = [];
  let checkpoint: PairLocalCheckpoint | null = null;
  const initialAction = driverAction(1, 'test', 'write_test');
  let pair = options.approvalRequired
    ? approvalPair(worktreeState.snapshot().sha256)
    : runningPair(initialAction, 1, 'plan_confirmed');
  if (options.pendingDriver) {
    const pendingInput: RecordPairDriverAttemptInput = {
      pairRunId: 'pair-1',
      actionId: initialAction.actionId,
      expectedPairVersion: 1,
      role: 'test',
      mode: 'write_test',
      summary: 'Wrote the focused test.',
      changedPaths: ['libs/feature/pair.spec.ts'],
      beforeWorktreeSha256: digest('clean-worktree'),
      afterWorktreeSha256: worktreeState.snapshot().worktreeSha256,
      diffSha256: worktreeState.snapshot().sha256,
      agentCallCount: 1,
      inputTokens: null,
      outputTokens: null,
    };
    checkpoint = localCheckpoint(pair, worktreeState.snapshot(), {
      kind: 'driver',
      input: pendingInput,
    });
  }

  const next = (
    action: PairResourceData['nextAction'],
    version: number,
    checkpointName: PairResourceData['run']['checkpoint'],
  ) => {
    pair = runningPair(action, version, checkpointName, pair.data);
    return pair;
  };
  const recordDriverAttempt = vi.fn(
    async (
      _pair: RemotePair,
      _leaseToken: string,
      input: RecordPairDriverAttemptInput,
    ) => {
      driverInputs.push(input);
      if (options.pendingDriver) {
        pair = exceptionPair(pair.data, 2, 'runtime_failure');
        return pair;
      }
      if (input.role === 'test') {
        return next(commandAction(2, 'red'), 2, 'test_written');
      }
      if (input.role === 'production') {
        return next(commandAction(5, 'green'), 5, 'implementation_written');
      }
      return next(commandAction(7, 'refactor'), 7, 'refactored');
    },
  );
  const recordCommandObservation = vi.fn(
    async (
      _pair: RemotePair,
      _leaseToken: string,
      input: { actionId: string; stage: string },
    ) => {
      commandInputs.push(input);
      if (input.stage === 'red') {
        const observation = {
          id: 'observation-red',
          actionId: input.actionId,
          stage: 'red',
        };
        pair = next(reviewAction(3), 3, 'test_written');
        pair.data.commandObservations.push(observation as never);
        return pair;
      }
      if (input.stage === 'green') {
        return next(
          driverAction(6, 'refactor', 'refactor'),
          6,
          'green_observed',
        );
      }
      if (input.stage === 'refactor') {
        return next(commandAction(8, 'quality_gate'), 8, 'refactored');
      }
      pair = approvalPair(worktreeState.snapshot().sha256, pair.data, 9);
      return pair;
    },
  );
  const recordRedReview = vi.fn(async () =>
    next(driverAction(4, 'production', 'implement'), 4, 'red_observed'),
  );
  const recordException = vi.fn(
    async (_pair: RemotePair, _leaseToken: string, input: { kind: string }) => {
      exceptionInputs.push(input);
      pair = exceptionPair(pair.data, pair.data.run.version + 1, input.kind);
      return pair;
    },
  );
  const decide = vi.fn(
    async (_pair: RemotePair, input: Record<string, unknown>) => {
      decisions.push(input);
      pair = remotePair({
        ...pair.data,
        run: {
          ...pair.data.run,
          version: pair.data.run.version + 1,
          status: input.action === 'approve' ? 'approved' : 'running',
          checkpoint:
            input.action === 'approve' ? 'approved' : 'plan_confirmed',
          approvedCommitSha:
            input.action === 'approve' ? String(input.commitSha) : null,
        },
        nextAction: null,
      });
      return pair;
    },
  );

  const saveCheckpoint = vi.fn(
    async (_identity: unknown, input: PairCheckpointInput) => {
      checkpoint = localCheckpoint(
        pair,
        input.snapshot,
        input.pendingEvidence,
        input.diagnostic,
      );
      return checkpoint;
    },
  );
  const clearCheckpoint = vi.fn(async () => {
    checkpoint = null;
  });
  const commit = vi.fn(async () => 'c'.repeat(40));

  const controllerOptions: PairControllerOptions = {
    apiBaseUrl: 'https://evidence.example/api',
    executorId: 'desktop-1',
    bindings: {
      find: vi.fn(async () => ({ repositoryRoot }) as never),
    },
    worktrees: {
      locate: vi.fn(() => worktree),
      recover: vi.fn(async () => worktree),
      snapshot: vi.fn(async () => worktreeState.snapshot()),
      restoreCheckpoint: vi.fn(async (_worktree, patch, expected) =>
        worktreeState.restore(patch, expected),
      ),
      inspectForReview: vi.fn(async () => worktreeState.snapshot()),
      commit,
    },
    checkpoints: {
      save: saveCheckpoint,
      load: vi.fn(async () => checkpoint),
      clear: clearCheckpoint,
    },
    client: {
      getTaskingEntry: vi.fn(async () => taskingEntry()),
      startPair: vi.fn(async () => ({ pair, leaseToken: 'lease-1' })),
      getPair: vi.fn(async () => pair),
      claimLease: vi.fn(async () => ({ leaseToken: 'lease-2' }) as never),
      heartbeatLease: vi.fn(async () => undefined),
      recordDriverAttempt,
      recordCommandObservation: recordCommandObservation as never,
      recordRedReview,
      recordException: recordException as never,
      decide: decide as never,
    },
    driver: {
      run: vi.fn(async (request, emit) => {
        driverRequests.push(request);
        if (request.role === 'test') {
          if (options.invalidTestPath) {
            worktreeState.invalidTestChange();
          } else {
            worktreeState.testChange();
          }
        } else if (request.role === 'production') {
          worktreeState.productionChange();
        } else {
          worktreeState.refactorChange();
        }
        emit({
          id: request.id,
          event: 'complete',
          data: '',
          details: { summary: `Completed ${request.role}.`, agentCallCount: 1 },
        });
      }),
      cancel: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
    },
    redReviewer: {
      run: vi.fn(async (request, emit) => {
        reviewerRequests.push(request);
        emit({
          id: request.id,
          event: 'complete',
          data: '',
          details: {
            classification: 'behavior',
            reason: 'The intended assertion reached the absent behavior.',
            agentCallCount: 1,
          },
        });
      }),
      cancel: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
    },
    commands: {
      run: vi.fn(async () => {
        const stage =
          pair.data.nextAction?.kind === 'execute_command'
            ? pair.data.nextAction.stage
            : 'quality_gate';
        return commandResult(stage === 'red' ? 1 : 0);
      }),
    },
    heartbeatIntervalMs: 60_000,
  };

  return {
    controller: new PairController(controllerOptions),
    worktreeState,
    driverRequests,
    reviewerRequests,
    driverInputs,
    commandInputs,
    exceptionInputs,
    decisions,
    commit,
    clearCheckpoint,
    get checkpoint() {
      if (!checkpoint) throw new Error('Expected local checkpoint.');
      return checkpoint;
    },
  };
}

class WorktreeState {
  private index = 0;
  private readonly states = new Map<string, IterationWorktreeSnapshot>();

  constructor() {
    this.remember(this.create('', {}));
  }

  testChange(): void {
    this.index += 1;
    this.remember(
      this.create(`patch-${String(this.index)}`, {
        'libs/feature/pair.spec.ts': 'blob:test-1',
      }),
    );
  }

  invalidTestChange(): void {
    this.index += 1;
    this.remember(
      this.create(`patch-${String(this.index)}`, {
        'libs/feature/pair.ts': 'blob:invalid-test-write',
      }),
    );
  }

  productionChange(): void {
    this.index += 1;
    this.remember(
      this.create(`patch-${String(this.index)}`, {
        'libs/feature/pair.spec.ts': 'blob:test-1',
        'libs/feature/pair.ts': 'blob:production-1',
      }),
    );
  }

  refactorChange(): void {
    this.index += 1;
    this.remember(
      this.create(`patch-${String(this.index)}`, {
        'libs/feature/pair.spec.ts': 'blob:test-1',
        'libs/feature/pair.ts': 'blob:production-refactored',
      }),
    );
  }

  snapshot(): IterationWorktreeSnapshot {
    return [...this.states.values()].at(-1) as IterationWorktreeSnapshot;
  }

  restore(patch: string, expected: string): IterationWorktreeSnapshot {
    const state = this.states.get(patch);
    if (!state || state.sha256 !== expected) throw new Error('Unknown patch.');
    for (const [key] of [...this.states]) {
      if (key !== patch) this.states.delete(key);
    }
    this.states.set(patch, state);
    return state;
  }

  private create(
    content: string,
    pathFingerprints: Record<string, string>,
  ): IterationWorktreeSnapshot {
    const changedPaths = Object.keys(pathFingerprints).sort();
    return {
      content,
      sha256: digest(content),
      changedFileCount: changedPaths.length,
      headSha: baseCommitSha,
      changedPaths,
      pathFingerprints,
      worktreeSha256: digest(JSON.stringify(pathFingerprints)),
    };
  }

  private remember(snapshot: IterationWorktreeSnapshot): void {
    this.states.set(snapshot.content, snapshot);
  }
}

function runningPair(
  nextAction: PairResourceData['nextAction'],
  version: number,
  checkpoint: PairResourceData['run']['checkpoint'],
  previous?: PairResourceData,
): RemotePair {
  return remotePair({
    ...(previous ?? pairAuthority()),
    run: {
      ...(previous?.run ?? pairAuthority().run),
      version,
      status: 'running',
      checkpoint,
      currentDiffSha256:
        checkpoint === 'plan_confirmed'
          ? null
          : (previous?.run.currentDiffSha256 ?? digest(`server-${checkpoint}`)),
      leaseExpiresAt: null,
    },
    nextAction,
  });
}

function approvalPair(
  finalDiffSha256: string,
  previous?: PairResourceData,
  version = 9,
): RemotePair {
  const manifest = {
    id: 'manifest-1',
    contentSha256: digest('manifest'),
    finalDiffSha256,
    changedPaths: ['libs/feature/pair.spec.ts', 'libs/feature/pair.ts'],
  };
  return remotePair({
    ...(previous ?? pairAuthority()),
    run: {
      ...(previous?.run ?? pairAuthority().run),
      version,
      status: 'approval_required',
      checkpoint: 'quality_gates_passed',
      currentDiffSha256: finalDiffSha256,
      finalManifestSha256: manifest.contentSha256,
      leaseExpiresAt: null,
    },
    manifest: manifest as never,
    nextAction: {
      kind: 'await_human',
      actionId: 'ACT-await-human',
      expectedPairVersion: version,
      manifestSha256: manifest.contentSha256,
    },
  });
}

function exceptionPair(
  previous: PairResourceData,
  version: number,
  kind: string,
): RemotePair {
  return remotePair({
    ...previous,
    run: {
      ...previous.run,
      version,
      status: 'exception',
      checkpoint: 'exception',
      leaseExpiresAt: null,
    },
    currentException: {
      id: 'exception-1',
      actionId: previous.nextAction?.actionId ?? null,
      kind,
      summary: 'Pair stopped.',
      allowedRoutes: ['back_test', 'cancel'],
    } as never,
    nextAction: {
      kind: 'resolve_exception',
      actionId: `ACT-exception-${String(version)}`,
      expectedPairVersion: version,
      exceptionId: 'exception-1',
      allowedRoutes: ['back_test', 'cancel'],
    },
  });
}

function pairAuthority(): PairResourceData {
  return {
    iteration: {
      id: 'iteration-1',
      baseCommitSha,
      branchName: worktree.branchName,
    },
    story: { reference: 'US-001' },
    storyRevision: {
      title: 'Pair Story',
      problem: 'Changes are not bounded.',
      role: 'developer',
      goal: 'execute an approved plan',
      value: 'review trustworthy evidence',
      contentSha256: storySha,
    },
    approvedPlan: { id: 'plan-1', contentSha256: approvedSha },
    run: {
      id: 'pair-1',
      workspaceId: 'workspace-1',
      iterationId: 'iteration-1',
      approvedTaskingPlanSha256: approvedSha,
      storyRevisionSha256: storySha,
      baseCommitSha,
      branchName: worktree.branchName,
      status: 'running',
      checkpoint: 'plan_confirmed',
      version: 1,
      executionBudget: {
        activityTimeoutMs: 30_000,
        commandTimeoutMs: 30_000,
      },
      currentDiffSha256: null,
      finalManifestSha256: null,
      approvedCommitSha: null,
      leaseExpiresAt: null,
    },
    driverAttempts: [],
    commandObservations: [],
    redReviews: [],
    currentException: null,
    manifest: null,
    decisions: [],
    nextAction: null,
  } as unknown as PairResourceData;
}

function driverAction(
  version: number,
  role: 'test' | 'production' | 'refactor',
  mode: 'write_test' | 'implement' | 'refactor',
): NonNullable<PairResourceData['nextAction']> {
  return {
    kind: 'run_driver',
    actionId: `ACT-${role}-driver`,
    expectedPairVersion: version,
    role,
    mode,
    workUnit: workUnit(),
    stepKey: 'process:step',
    allowedTestRoots: role === 'test' ? ['libs/feature'] : [],
    allowedProductionRoots: role === 'test' ? [] : ['libs/feature'],
    frozenTestPaths: role === 'test' ? [] : ['libs/feature/pair.spec.ts'],
    diagnosticObservationId: null,
  };
}

function commandAction(
  version: number,
  stage: 'red' | 'green' | 'refactor' | 'quality_gate',
): NonNullable<PairResourceData['nextAction']> {
  return {
    kind: 'execute_command',
    actionId: `ACT-${stage}-command`,
    expectedPairVersion: version,
    stage,
    workUnit: stage === 'quality_gate' ? null : workUnit(),
    gate:
      stage === 'quality_gate'
        ? {
            index: 0,
            processId: 'typescript-electron',
            projectId: '@evidence/desktop',
            target: 'typecheck',
            command: 'pnpm nx typecheck @evidence/desktop',
          }
        : null,
    command:
      stage === 'quality_gate'
        ? 'pnpm nx typecheck @evidence/desktop'
        : 'pnpm nx test @evidence/desktop --run --testNamePattern=pair',
    timeoutMs: 30_000,
  };
}

function reviewAction(
  version: number,
): NonNullable<PairResourceData['nextAction']> {
  return {
    kind: 'review_red',
    actionId: 'ACT-review-red',
    expectedPairVersion: version,
    workUnit: workUnit(),
    observationId: 'observation-red',
    expectedFailureKind: 'behavior',
    expectedFailure: 'The approved behavior assertion fails.',
  };
}

function workUnit() {
  return {
    index: 0,
    stepKey: 'process:step',
    task: {
      id: 'TASK-001',
      description: 'Implement Pair',
      testIds: [],
      dependsOn: [],
      modelRefs: { entities: [], associations: [] },
    },
    test: {
      id: 'TEST-001',
      quadrant: 'Q1',
      intent: 'Observe the approved behavior.',
      runtimePlanId: 'runtime-1',
      stepId: 'step-1',
      projectId: '@evidence/desktop',
      testFilter: 'pair',
      supportedBy: ['SC-001'],
      scenarioIds: ['SC-001'],
      scenarioOutcome: 'The behavior is available.',
      businessData: ['approved plan'],
      modelRefs: { entities: [], associations: [] },
      processId: 'typescript-electron',
    },
    process: {
      runtimePlanId: 'runtime-1',
      processId: 'typescript-electron',
    },
    step: {
      id: 'step-1',
      purpose: 'Exercise behavior.',
      red: {
        expectedFailureKind: 'behavior',
        expectedFailure: 'The behavior is absent.',
      },
      greenDoneWhen: 'The focused test passes.',
      refactorDoneWhen: 'The focused test remains Green.',
    },
    focusedCommand: {
      command: 'pnpm nx test @evidence/desktop --run --testNamePattern=pair',
      projectId: '@evidence/desktop',
    },
    testRoots: ['libs/feature'],
    productionRoots: ['libs/feature'],
  } as never;
}

function taskingEntry() {
  return {
    iteration: {
      id: 'iteration-1',
      version: 8,
      baseCommitSha,
      branchName: worktree.branchName,
    },
    story: { id: 'story-1' },
    storyRevision: { id: 'revision-1' },
    approvedPlan: { id: 'plan-1', contentSha256: approvedSha },
    links: { 'start-pair': '/api/pair' },
  } as never;
}

function localCheckpoint(
  pair: RemotePair,
  snapshot: IterationWorktreeSnapshot,
  pendingEvidence: PairCheckpointInput['pendingEvidence'],
  diagnostic: PairCheckpointInput['diagnostic'] = null,
): PairLocalCheckpoint {
  return {
    schemaVersion: 1,
    pairRunId: pair.data.run.id,
    pairVersion: pair.data.run.version,
    checkpoint: pair.data.run.checkpoint,
    baseCommitSha,
    branchName: worktree.branchName,
    diffSha256: snapshot.sha256,
    worktreeSha256: snapshot.worktreeSha256,
    patch: snapshot.content,
    pendingEvidence,
    diagnostic,
    savedAt: '2026-08-03T10:00:00.000Z',
  };
}

function commandResult(exitCode: number): PairCommandResult {
  const stdout =
    exitCode === 0 ? 'focused command passed' : 'observable assertion failed';
  return {
    command: 'pnpm nx test @evidence/desktop --run --testNamePattern=pair',
    executable: 'pnpm',
    args: [],
    termination: 'exited',
    exitCode,
    signal: null,
    durationMs: 20,
    stdout,
    stderr: '',
    stdoutSha256: digest(stdout),
    stdoutBytes: Buffer.byteLength(stdout),
    stdoutLines: 1,
    stderrSha256: digest(''),
    stderrBytes: 0,
    stderrLines: 0,
  };
}

function remotePair(data: PairResourceData): RemotePair {
  return { data, links: {}, raw: data as unknown as Record<string, unknown> };
}

function request() {
  return {
    id: 'pair-request-1',
    workspaceId: 'workspace-1',
    iterationId: 'iteration-1',
  };
}

function digest(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}
