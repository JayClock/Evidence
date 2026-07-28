import { createHash } from 'node:crypto';
import type {
  DecidePairInput,
  PairResourceData,
  RecordPairCommandObservationInput,
  RecordPairDriverAttemptInput,
  RecordPairExceptionInput,
  RecordPairRedReviewInput,
} from '@evidence/api-client';
import {
  changedPathsBetween,
  type IterationWorktree,
  type IterationWorktreeManager,
  type IterationWorktreeSnapshot,
} from './capabilities/work-item-worktree/manager';
import type { WorkspaceBindingStore } from './capabilities/workspace-binding/store';
import type {
  PairDriverEvent,
  PairDriverRuntimeRequest,
} from './pair-agent-protocol';
import {
  assertPairDriverChangedPaths,
  pairDriverWritePolicy,
} from './pair-driver-policy';
import type {
  PairRedReviewerEvent,
  PairRedReviewerRuntimeRequest,
} from './pair-red-reviewer-protocol';
import type {
  PairApiClient,
  RemotePair,
  RemotePairTaskingEntry,
} from './pair-api-client';
import type {
  PairCheckpointIdentity,
  PairCheckpointStore,
  PairLocalCheckpoint,
  PairLocalDiagnostic,
  PairPendingEvidence,
} from './pair-checkpoint-store';
import type {
  PairCommandResult,
  PairCommandRunner,
} from './capabilities/command-execution/runner';

const MAX_CONTROLLER_ACTIONS = 512;
const DEFAULT_HEARTBEAT_MS = 8_000;
const MAX_LEASE_WAIT_MS = 35_000;
const DIAGNOSTIC_BYTES = 50 * 1024;

type PairNextAction = NonNullable<PairResourceData['nextAction']>;
type PairRunDriverAction = Extract<PairNextAction, { kind: 'run_driver' }>;
type PairExecuteCommandAction = Extract<
  PairNextAction,
  { kind: 'execute_command' }
>;
type PairReviewRedAction = Extract<PairNextAction, { kind: 'review_red' }>;

export interface RunPairRequest {
  id: string;
  workspaceId: string;
  iterationId: string;
}

export interface ReviewPairRequest extends RunPairRequest {
  expectedManifestSha256: string;
}

export interface PairLocalReview {
  manifestSha256: string;
  diffSha256: string;
  changedFileCount: number;
  changedPaths: string[];
  diff: string;
}

export interface ApprovePairRequest extends RunPairRequest {
  expectedManifestSha256: string;
  expectedDiffSha256: string;
  commitMessage: string;
  reason: string;
}

export interface DecidePairRequest extends RunPairRequest {
  action: Exclude<DecidePairInput['action'], 'approve'>;
  reason: string;
  resume: boolean;
}

export interface PairControllerSummary {
  iterationId: string;
  pairRunId: string;
  status: PairResourceData['run']['status'];
  checkpoint: PairResourceData['run']['checkpoint'];
  version: number;
  nextAction: PairNextAction['kind'] | null;
  manifestSha256: string | null;
  diffSha256: string | null;
  commitSha: string | null;
  exception: {
    kind: PairResourceData['currentException'] extends infer T
      ? T extends { kind: infer K }
        ? K
        : never
      : never;
    summary: string;
    allowedRoutes: PairResourceData['currentException'] extends infer T
      ? T extends { allowedRoutes: infer R }
        ? R
        : never
      : never;
  } | null;
}

export interface PairControllerEvent {
  requestId: string;
  event: 'progress' | 'checkpoint' | 'human-required';
  message: string;
  checkpoint: PairResourceData['run']['checkpoint'] | null;
}

interface BindingReader {
  find(
    apiBaseUrl: string,
    workspaceId: string,
  ): ReturnType<WorkspaceBindingStore['find']>;
}

interface PairWorktrees {
  locate: IterationWorktreeManager['locate'];
  recover: IterationWorktreeManager['recover'];
  snapshot: IterationWorktreeManager['snapshot'];
  restoreCheckpoint: IterationWorktreeManager['restoreCheckpoint'];
  inspectForReview: IterationWorktreeManager['inspectForReview'];
  commit: IterationWorktreeManager['commit'];
}

interface PairClient {
  getTaskingEntry: PairApiClient['getTaskingEntry'];
  startPair: PairApiClient['startPair'];
  getPair: PairApiClient['getPair'];
  claimLease: PairApiClient['claimLease'];
  heartbeatLease: PairApiClient['heartbeatLease'];
  recordDriverAttempt: PairApiClient['recordDriverAttempt'];
  recordCommandObservation: PairApiClient['recordCommandObservation'];
  recordRedReview: PairApiClient['recordRedReview'];
  recordException: PairApiClient['recordException'];
  decide: PairApiClient['decide'];
}

interface PairCheckpoints {
  save: PairCheckpointStore['save'];
  load: PairCheckpointStore['load'];
  clear: PairCheckpointStore['clear'];
}

interface PairRuntimeAgent<TRequest, TEvent> {
  run(request: TRequest, onEvent: (event: TEvent) => void): Promise<void>;
  cancel(id: string): Promise<void>;
  stop(): Promise<void>;
}

interface PairCommands {
  run: PairCommandRunner['run'];
}

export interface PairControllerOptions {
  apiBaseUrl: string;
  executorId: string;
  bindings: BindingReader;
  worktrees: PairWorktrees;
  checkpoints: PairCheckpoints;
  client: PairClient;
  driver: PairRuntimeAgent<PairDriverRuntimeRequest, PairDriverEvent>;
  redReviewer: PairRuntimeAgent<
    PairRedReviewerRuntimeRequest,
    PairRedReviewerEvent
  >;
  commands: PairCommands;
  heartbeatIntervalMs?: number;
}

interface ActivePair {
  workspaceId: string;
  abort: AbortController;
}

interface PairExecutionContext {
  request: RunPairRequest;
  identity: PairCheckpointIdentity;
  worktree: IterationWorktree;
  snapshot: IterationWorktreeSnapshot;
  checkpoint: PairLocalCheckpoint | null;
  pair: RemotePair;
  leaseToken: string;
  emit: (event: PairControllerEvent) => void;
  abort: AbortController;
}

export class PairController {
  private readonly active = new Map<string, ActivePair>();
  private readonly activeWorkspaces = new Set<string>();
  private readonly heartbeatIntervalMs: number;

  constructor(private readonly options: PairControllerOptions) {
    this.heartbeatIntervalMs =
      options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_MS;
  }

  start(
    request: RunPairRequest,
    emit: (event: PairControllerEvent) => void = () => undefined,
  ): Promise<PairControllerSummary> {
    return this.exclusive(request, async (abort) => {
      const { binding, tasking, worktree, snapshot, identity } =
        await this.prepareStart(request, abort.signal);
      if (snapshot.changedFileCount !== 0) {
        throw new Error(
          'Iteration worktree must be clean before the Approved Plan starts Pair.',
        );
      }
      emitEvent(
        emit,
        request.id,
        'progress',
        'Starting approved Pair Plan',
        null,
      );
      const started = await this.options.client.startPair(
        tasking,
        this.options.executorId,
        abort.signal,
      );
      assertPairWorktreeAuthority(
        started.pair,
        worktree,
        binding.repositoryRoot,
      );
      const checkpoint = await this.saveCheckpoint(
        identity,
        started.pair,
        worktree,
        snapshot,
        null,
        null,
      );
      return this.runLoop({
        request,
        identity,
        worktree,
        snapshot,
        checkpoint,
        pair: started.pair,
        leaseToken: started.leaseToken,
        emit,
        abort,
      });
    });
  }

  resume(
    request: RunPairRequest,
    emit: (event: PairControllerEvent) => void = () => undefined,
  ): Promise<PairControllerSummary> {
    return this.exclusive(request, async (abort) => {
      let pair = await this.options.client.getPair(
        request.workspaceId,
        request.iterationId,
        abort.signal,
      );
      if (
        pair.data.run.status === 'approved' ||
        pair.data.run.status === 'cancelled'
      ) {
        return summary(pair);
      }
      const { identity, worktree, snapshot, checkpoint } =
        await this.prepareExisting(request, pair);
      if (pair.data.run.status !== 'running') {
        emitEvent(
          emit,
          request.id,
          'human-required',
          humanMessage(pair),
          pair.data.run.checkpoint,
        );
        return summary(pair);
      }
      const leaseToken = await this.claimLease(pair, abort);
      pair = await this.replayPending(
        pair,
        leaseToken,
        checkpoint,
        identity,
        worktree,
        snapshot,
        abort.signal,
      );
      const refreshed = await this.options.client.getPair(
        request.workspaceId,
        request.iterationId,
        abort.signal,
      );
      return this.runLoop({
        request,
        identity,
        worktree,
        snapshot,
        checkpoint: await this.options.checkpoints.load(identity),
        pair:
          refreshed.data.run.version >= pair.data.run.version
            ? refreshed
            : pair,
        leaseToken,
        emit,
        abort,
      });
    });
  }

  decide(
    request: DecidePairRequest,
    emit: (event: PairControllerEvent) => void = () => undefined,
  ): Promise<PairControllerSummary> {
    return this.exclusive(request, async (abort) => {
      const pair = await this.options.client.getPair(
        request.workspaceId,
        request.iterationId,
        abort.signal,
      );
      const decided = await this.options.client.decide(
        pair,
        {
          expectedPairVersion: pair.data.run.version,
          action: request.action,
          reason: request.reason,
          manifestSha256: null,
          diffSha256: null,
          commitSha: null,
        },
        abort.signal,
      );
      if (!request.resume || decided.data.run.status !== 'running') {
        return summary(decided);
      }
      const { identity, worktree, snapshot, checkpoint } =
        await this.prepareExisting(request, decided);
      const leaseToken = await this.claimLease(decided, abort);
      return this.runLoop({
        request,
        identity,
        worktree,
        snapshot,
        checkpoint,
        pair: decided,
        leaseToken,
        emit,
        abort,
      });
    });
  }

  review(request: ReviewPairRequest): Promise<PairLocalReview> {
    return this.exclusive(request, async (abort) => {
      const pair = await this.options.client.getPair(
        request.workspaceId,
        request.iterationId,
        abort.signal,
      );
      if (
        pair.data.run.status !== 'approval_required' ||
        pair.data.nextAction?.kind !== 'await_human' ||
        !pair.data.manifest ||
        pair.data.manifest.contentSha256 !== request.expectedManifestSha256
      ) {
        throw new Error(
          'Pair approval evidence changed; reload before review.',
        );
      }
      const binding = await this.requireBinding(request.workspaceId);
      const worktree = this.locateWorktree(pair, binding.repositoryRoot);
      await this.options.worktrees.recover(worktree);
      const diff = await this.options.worktrees.inspectForReview(
        worktree,
        null,
      );
      if (diff.sha256 !== pair.data.manifest.finalDiffSha256) {
        throw new Error('Local Pair diff does not match the Server Manifest.');
      }
      return {
        manifestSha256: pair.data.manifest.contentSha256,
        diffSha256: diff.sha256,
        changedFileCount: diff.changedFileCount,
        changedPaths: pair.data.manifest.changedPaths,
        diff: diff.content,
      };
    });
  }

  approve(request: ApprovePairRequest): Promise<PairControllerSummary> {
    return this.exclusive(request, async (abort) => {
      const pair = await this.options.client.getPair(
        request.workspaceId,
        request.iterationId,
        abort.signal,
      );
      if (
        pair.data.run.status !== 'approval_required' ||
        pair.data.nextAction?.kind !== 'await_human' ||
        !pair.data.manifest
      ) {
        throw new Error('Pair is not waiting for Story-level coding approval.');
      }
      if (
        request.expectedManifestSha256 !== pair.data.manifest.contentSha256 ||
        request.expectedDiffSha256 !== pair.data.manifest.finalDiffSha256 ||
        pair.data.run.finalManifestSha256 !== pair.data.manifest.contentSha256
      ) {
        throw new Error('Pair approval evidence changed; review it again.');
      }
      const binding = await this.requireBinding(request.workspaceId);
      const worktree = this.locateWorktree(pair, binding.repositoryRoot);
      await this.options.worktrees.recover(worktree);
      const reviewed = await this.options.worktrees.inspectForReview(
        worktree,
        null,
      );
      if (reviewed.sha256 !== request.expectedDiffSha256) {
        throw new Error('Pair diff changed after human review.');
      }
      const commitSha = await this.options.worktrees.commit(
        worktree,
        request.expectedDiffSha256,
        request.commitMessage,
      );
      const decided = await this.options.client.decide(
        pair,
        {
          expectedPairVersion: pair.data.run.version,
          action: 'approve',
          reason: request.reason,
          manifestSha256: request.expectedManifestSha256,
          diffSha256: request.expectedDiffSha256,
          commitSha,
        },
        abort.signal,
      );
      await this.options.checkpoints.clear(this.identity(request));
      return summary(decided);
    });
  }

  cancel(id: string): void {
    const active = this.active.get(id);
    if (!active) return;
    active.abort.abort();
    void Promise.all([
      this.options.driver.stop(),
      this.options.redReviewer.stop(),
    ]).catch(() => undefined);
  }

  async stop(): Promise<void> {
    for (const active of this.active.values()) active.abort.abort();
    await Promise.all([
      this.options.driver.stop(),
      this.options.redReviewer.stop(),
    ]);
  }

  private async runLoop(
    context: PairExecutionContext,
  ): Promise<PairControllerSummary> {
    for (let count = 0; count < MAX_CONTROLLER_ACTIONS; count += 1) {
      if (context.abort.signal.aborted) throw abortError();
      const action = context.pair.data.nextAction;
      if (!action) return summary(context.pair);
      if (
        action.kind === 'await_human' ||
        action.kind === 'resolve_exception'
      ) {
        emitEvent(
          context.emit,
          context.request.id,
          'human-required',
          humanMessage(context.pair),
          context.pair.data.run.checkpoint,
        );
        return summary(context.pair);
      }
      const usage = context.pair.data.run.budgetUsage;
      const budget = context.pair.data.run.executionBudget;
      const requiresAgent =
        action.kind === 'run_driver' || action.kind === 'review_red';
      if (
        usage.checkpoints >= budget.maxCheckpoints ||
        (requiresAgent && usage.agentCalls >= budget.maxAgentCalls)
      ) {
        await this.raiseException(
          context,
          action,
          'budget_exhausted',
          'Approved Pair execution budget is exhausted.',
          context.snapshot,
        );
        continue;
      }
      emitEvent(
        context.emit,
        context.request.id,
        'progress',
        actionMessage(action),
        context.pair.data.run.checkpoint,
      );
      if (action.kind === 'run_driver') {
        await this.runDriver(context, action);
      } else if (action.kind === 'execute_command') {
        await this.executeCommand(context, action);
      } else {
        await this.reviewRed(context, action);
      }
      emitEvent(
        context.emit,
        context.request.id,
        'checkpoint',
        `Pair reached ${context.pair.data.run.checkpoint}.`,
        context.pair.data.run.checkpoint,
      );
    }
    await this.raiseException(
      context,
      context.pair.data.nextAction,
      'budget_exhausted',
      'Local Pair Controller exhausted its bounded action loop.',
      context.snapshot,
    );
    return summary(context.pair);
  }

  private async runDriver(
    context: PairExecutionContext,
    action: PairRunDriverAction,
  ): Promise<void> {
    if (!action.workUnit) {
      await this.raiseException(
        context,
        action,
        'runtime_failure',
        'Pair Driver action did not contain one work unit.',
        context.snapshot,
      );
      return;
    }
    const before = context.snapshot;
    const state: {
      completion: Extract<PairDriverEvent, { event: 'complete' }> | null;
    } = { completion: null };
    let request: PairDriverRuntimeRequest;
    try {
      request = this.driverRequest(context, action);
    } catch {
      await this.raiseException(
        context,
        action,
        'evidence_mismatch',
        'Pair Driver lost its exact local diagnostic authority.',
        before,
      );
      return;
    }
    try {
      await this.withHeartbeat(
        context,
        () =>
          this.options.driver.run(request, (event) => {
            if (event.event === 'complete') state.completion = event;
            if (event.event === 'progress') {
              emitEvent(
                context.emit,
                context.request.id,
                'progress',
                event.data,
                context.pair.data.run.checkpoint,
              );
            }
          }),
        () => this.options.driver.cancel(request.id),
      );
    } catch (error) {
      context.snapshot = await this.restoreBefore(context, before);
      if (context.abort.signal.aborted) throw abortError();
      await this.raiseException(
        context,
        action,
        'runtime_failure',
        boundedSummary('Pair Driver failed', error),
        context.snapshot,
      );
      return;
    }
    let after: IterationWorktreeSnapshot;
    try {
      after = await this.options.worktrees.snapshot(context.worktree);
    } catch (error) {
      context.snapshot = await this.restoreBefore(context, before);
      await this.raiseException(
        context,
        action,
        'git_head_changed',
        boundedSummary('Pair Driver changed locked Git authority', error),
        context.snapshot,
      );
      return;
    }
    const changedPaths = changedPathsBetween(before, after);
    try {
      assertPairDriverChangedPaths(
        pairDriverWritePolicy(request),
        changedPaths,
      );
      if (
        action.role !== 'refactor' &&
        (changedPaths.length === 0 ||
          before.worktreeSha256 === after.worktreeSha256)
      ) {
        throw new Error('Pair Driver made no observable progress.');
      }
      if (!state.completion) {
        throw new Error('Pair Driver did not return a completion record.');
      }
    } catch (error) {
      context.snapshot = await this.restoreBefore(context, before);
      await this.raiseException(
        context,
        action,
        error instanceof Error && error.message.includes('no observable')
          ? 'no_progress'
          : 'path_violation',
        boundedSummary('Pair Driver output was rejected', error),
        context.snapshot,
      );
      return;
    }
    const input: RecordPairDriverAttemptInput = {
      pairRunId: context.pair.data.run.id,
      actionId: action.actionId,
      expectedPairVersion: action.expectedPairVersion,
      role: action.role,
      mode: action.mode,
      summary: state.completion.details.summary,
      changedPaths,
      beforeWorktreeSha256: before.worktreeSha256,
      afterWorktreeSha256: after.worktreeSha256,
      diffSha256: after.sha256,
      agentCallCount: state.completion.details.agentCallCount,
      inputTokens: null,
      outputTokens: null,
    };
    context.snapshot = after;
    await this.persistPending(context, { kind: 'driver', input }, null);
    context.pair = await this.options.client.recordDriverAttempt(
      context.pair,
      context.leaseToken,
      input,
      context.abort.signal,
    );
    context.checkpoint = await this.saveCheckpoint(
      context.identity,
      context.pair,
      context.worktree,
      after,
      null,
      null,
    );
  }

  private async executeCommand(
    context: PairExecutionContext,
    action: PairExecuteCommandAction,
  ): Promise<void> {
    const before = context.snapshot;
    let result: PairCommandResult;
    try {
      result = await this.withHeartbeat(
        context,
        () =>
          this.options.commands.run(action.command, {
            cwd: context.worktree.worktreeRoot,
            timeoutMs: action.timeoutMs,
            signal: context.abort.signal,
          }),
        async () => undefined,
      );
    } catch (error) {
      if (context.abort.signal.aborted) throw abortError();
      await this.raiseException(
        context,
        action,
        'runtime_failure',
        boundedSummary('Pair command runner failed', error),
        before,
      );
      return;
    }
    let after: IterationWorktreeSnapshot;
    try {
      after = await this.options.worktrees.snapshot(context.worktree);
    } catch (error) {
      context.snapshot = await this.restoreBefore(context, before);
      await this.raiseException(
        context,
        action,
        'git_head_changed',
        boundedSummary('Pair command changed locked Git authority', error),
        context.snapshot,
      );
      return;
    }
    if (after.worktreeSha256 !== before.worktreeSha256) {
      context.snapshot = await this.restoreBefore(context, before);
      await this.raiseException(
        context,
        action,
        'path_violation',
        'A locked Pair command changed repository files.',
        context.snapshot,
      );
      return;
    }
    const input: RecordPairCommandObservationInput = {
      pairRunId: context.pair.data.run.id,
      actionId: action.actionId,
      expectedPairVersion: action.expectedPairVersion,
      stage: action.stage,
      command: action.command,
      termination: result.termination,
      exitCode: result.exitCode,
      signal: result.signal,
      durationMs: result.durationMs,
      stdoutSha256: result.stdoutSha256,
      stdoutBytes: result.stdoutBytes,
      stdoutLines: result.stdoutLines,
      stderrSha256: result.stderrSha256,
      stderrBytes: result.stderrBytes,
      stderrLines: result.stderrLines,
      worktreeSha256: after.worktreeSha256,
      diffSha256: after.sha256,
    };
    const diagnostic = localDiagnostic(action.actionId, null, result);
    await this.persistPending(context, { kind: 'command', input }, diagnostic);
    context.pair = await this.options.client.recordCommandObservation(
      context.pair,
      context.leaseToken,
      input,
      context.abort.signal,
    );
    const observation = context.pair.data.commandObservations.find(
      (candidate) => candidate.actionId === action.actionId,
    );
    context.checkpoint = await this.saveCheckpoint(
      context.identity,
      context.pair,
      context.worktree,
      after,
      null,
      observation
        ? { ...diagnostic, observationId: observation.id }
        : diagnostic,
    );
  }

  private async reviewRed(
    context: PairExecutionContext,
    action: PairReviewRedAction,
  ): Promise<void> {
    let diagnostic: PairLocalDiagnostic;
    try {
      diagnostic = this.requireDiagnostic(context, action.observationId);
    } catch {
      await this.raiseException(
        context,
        action,
        'evidence_mismatch',
        'Independent Red Review lost its exact local failing observation.',
        context.snapshot,
      );
      return;
    }
    if (
      diagnostic.termination !== 'exited' ||
      diagnostic.exitCode === null ||
      diagnostic.exitCode === 0
    ) {
      await this.raiseException(
        context,
        action,
        'evidence_mismatch',
        'Independent Red Review lost its exact local failing observation.',
        context.snapshot,
      );
      return;
    }
    const request: PairRedReviewerRuntimeRequest = {
      id: action.actionId,
      timeoutMs: Math.min(
        context.pair.data.run.executionBudget.activityTimeoutMs,
        300_000,
      ),
      test: {
        id: action.workUnit.test.id,
        intent: action.workUnit.test.intent,
        scenarioOutcome: action.workUnit.test.scenarioOutcome,
      },
      expectedRed: {
        kind: action.expectedFailureKind,
        failure: action.expectedFailure,
      },
      observation: {
        termination: 'exited',
        exitCode: diagnostic.exitCode,
        stdout: diagnostic.stdout,
        stderr: diagnostic.stderr,
        stdoutSha256: diagnostic.stdoutSha256,
        stderrSha256: diagnostic.stderrSha256,
      },
    };
    const state: {
      completion: Extract<PairRedReviewerEvent, { event: 'complete' }> | null;
    } = { completion: null };
    try {
      await this.withHeartbeat(
        context,
        () =>
          this.options.redReviewer.run(request, (event) => {
            if (event.event === 'complete') state.completion = event;
          }),
        () => this.options.redReviewer.cancel(request.id),
      );
    } catch (error) {
      if (context.abort.signal.aborted) throw abortError();
      await this.raiseException(
        context,
        action,
        'runtime_failure',
        boundedSummary('Independent Red Reviewer failed', error),
        context.snapshot,
      );
      return;
    }
    if (!state.completion) {
      await this.raiseException(
        context,
        action,
        'runtime_failure',
        'Independent Red Reviewer did not return one classification.',
        context.snapshot,
      );
      return;
    }
    const input: RecordPairRedReviewInput = {
      pairRunId: context.pair.data.run.id,
      actionId: action.actionId,
      expectedPairVersion: action.expectedPairVersion,
      observationId: action.observationId,
      classification: state.completion.details.classification,
      reason: state.completion.details.reason,
    };
    await this.persistPending(
      context,
      { kind: 'red_review', input },
      diagnostic,
    );
    context.pair = await this.options.client.recordRedReview(
      context.pair,
      context.leaseToken,
      input,
      context.abort.signal,
    );
    context.checkpoint = await this.saveCheckpoint(
      context.identity,
      context.pair,
      context.worktree,
      context.snapshot,
      null,
      context.pair.data.run.status === 'exception' ? diagnostic : null,
    );
  }

  private async raiseException(
    context: PairExecutionContext,
    action: PairNextAction | null,
    kind: RecordPairExceptionInput['kind'],
    summary: string,
    snapshot: IterationWorktreeSnapshot,
  ): Promise<void> {
    if (
      !action ||
      action.kind === 'await_human' ||
      action.kind === 'resolve_exception'
    ) {
      throw new Error(summary);
    }
    const reviewedObservation =
      action.kind === 'review_red'
        ? context.pair.data.commandObservations.find(
            ({ id }) => id === action.observationId,
          )
        : null;
    const input: RecordPairExceptionInput = {
      pairRunId: context.pair.data.run.id,
      actionId: action.actionId,
      expectedPairVersion: action.expectedPairVersion,
      kind,
      summary: summary.slice(0, 2_000),
      failureFingerprint: reviewedObservation?.failureFingerprint ?? null,
    };
    const diagnostic = context.checkpoint?.diagnostic ?? null;
    context.snapshot = snapshot;
    await this.persistPending(
      context,
      { kind: 'exception', input },
      diagnostic,
    );
    context.pair = await this.options.client.recordException(
      context.pair,
      context.leaseToken,
      input,
      context.abort.signal,
    );
    context.checkpoint = await this.saveCheckpoint(
      context.identity,
      context.pair,
      context.worktree,
      snapshot,
      null,
      diagnostic,
    );
  }

  private driverRequest(
    context: PairExecutionContext,
    action: PairRunDriverAction,
  ): PairDriverRuntimeRequest {
    if (!action.workUnit) throw new Error('Pair Driver work unit is required.');
    const hasDiagnostic = Boolean(action.diagnosticObservationId);
    const hasDecision = Boolean(action.repairDecisionId);
    const hasInstruction = Boolean(action.repairInstruction);
    const repairEvidenceCount = Number(hasDiagnostic) + Number(hasDecision);
    if (
      hasDecision !== hasInstruction ||
      (action.mode.startsWith('repair_')
        ? repairEvidenceCount !== 1
        : repairEvidenceCount !== 0)
    ) {
      throw new Error('Pair repair evidence is internally inconsistent.');
    }
    const diagnostic = action.diagnosticObservationId
      ? this.requireDiagnostic(context, action.diagnosticObservationId)
      : null;
    const observation = action.diagnosticObservationId
      ? context.pair.data.commandObservations.find(
          ({ id }) => id === action.diagnosticObservationId,
        )
      : null;
    const repairInstruction =
      action.repairDecisionId && action.repairInstruction
        ? {
            stage: 'human_review' as const,
            summary: `Human coding decision ${action.repairDecisionId}: ${action.repairInstruction}`,
            stdout: '',
            stderr: '',
          }
        : null;
    return {
      id: action.actionId,
      role: action.role,
      mode: action.mode,
      worktreeRoot: context.worktree.worktreeRoot,
      timeoutMs: context.pair.data.run.executionBudget.activityTimeoutMs,
      authority: {
        pairRunId: context.pair.data.run.id,
        approvedTaskingPlanSha256:
          context.pair.data.run.approvedTaskingPlanSha256,
        storyRevisionSha256: context.pair.data.run.storyRevisionSha256,
        baseCommitSha: context.pair.data.run.baseCommitSha,
      },
      story: {
        reference: context.pair.data.story.reference,
        title: context.pair.data.storyRevision.title,
        problem: context.pair.data.storyRevision.problem,
        role: context.pair.data.storyRevision.role,
        goal: context.pair.data.storyRevision.goal,
        value: context.pair.data.storyRevision.value,
      },
      workUnit: action.workUnit,
      allowedTestRoots: action.allowedTestRoots,
      allowedProductionRoots: action.allowedProductionRoots,
      frozenTestPaths: action.frozenTestPaths,
      diagnostic:
        diagnostic && observation
          ? {
              stage: observation.stage,
              summary: `The locked ${observation.stage} command did not satisfy its approved condition.`,
              stdout: diagnostic.stdout,
              stderr: diagnostic.stderr,
            }
          : repairInstruction,
    };
  }

  private requireDiagnostic(
    context: PairExecutionContext,
    observationId: string,
  ): PairLocalDiagnostic {
    const diagnostic = context.checkpoint?.diagnostic;
    const observation = context.pair.data.commandObservations.find(
      ({ id }) => id === observationId,
    );
    if (
      !diagnostic ||
      !observation ||
      (diagnostic.observationId !== observationId &&
        diagnostic.actionId !== observation.actionId)
    ) {
      throw new Error(
        'Pair local diagnostic does not match the Server observation.',
      );
    }
    return diagnostic;
  }

  private async replayPending(
    pair: RemotePair,
    leaseToken: string,
    checkpoint: PairLocalCheckpoint | null,
    identity: PairCheckpointIdentity,
    worktree: IterationWorktree,
    snapshot: IterationWorktreeSnapshot,
    signal: AbortSignal,
  ): Promise<RemotePair> {
    const pending = checkpoint?.pendingEvidence;
    if (!pending) return pair;
    const actionId = pending.input.actionId;
    if (pair.data.nextAction?.actionId === actionId) {
      pair = await this.submitPending(pair, leaseToken, pending, signal);
    } else if (!hasAcceptedAction(pair, actionId)) {
      throw new Error(
        'Local pending Pair evidence does not match Server authority.',
      );
    }
    const observation = pair.data.commandObservations.find(
      (candidate) => candidate.actionId === actionId,
    );
    await this.saveCheckpoint(
      identity,
      pair,
      worktree,
      snapshot,
      null,
      checkpoint?.diagnostic
        ? {
            ...checkpoint.diagnostic,
            observationId:
              observation?.id ?? checkpoint.diagnostic.observationId,
          }
        : null,
    );
    return pair;
  }

  private submitPending(
    pair: RemotePair,
    leaseToken: string,
    pending: PairPendingEvidence,
    signal: AbortSignal,
  ): Promise<RemotePair> {
    switch (pending.kind) {
      case 'driver':
        return this.options.client.recordDriverAttempt(
          pair,
          leaseToken,
          pending.input,
          signal,
        );
      case 'command':
        return this.options.client.recordCommandObservation(
          pair,
          leaseToken,
          pending.input,
          signal,
        );
      case 'red_review':
        return this.options.client.recordRedReview(
          pair,
          leaseToken,
          pending.input,
          signal,
        );
      case 'exception':
        return this.options.client.recordException(
          pair,
          leaseToken,
          pending.input,
          signal,
        );
    }
  }

  private async persistPending(
    context: PairExecutionContext,
    pendingEvidence: PairPendingEvidence,
    diagnostic: PairLocalDiagnostic | null,
  ): Promise<void> {
    context.checkpoint = await this.saveCheckpoint(
      context.identity,
      context.pair,
      context.worktree,
      context.snapshot,
      pendingEvidence,
      diagnostic,
    );
  }

  private async prepareStart(
    request: RunPairRequest,
    signal: AbortSignal,
  ): Promise<{
    binding: { repositoryRoot: string };
    tasking: RemotePairTaskingEntry;
    worktree: IterationWorktree;
    snapshot: IterationWorktreeSnapshot;
    identity: PairCheckpointIdentity;
  }> {
    const [binding, tasking] = await Promise.all([
      this.requireBinding(request.workspaceId),
      this.options.client.getTaskingEntry(
        request.workspaceId,
        request.iterationId,
        signal,
      ),
    ]);
    const worktree = this.options.worktrees.locate({
      iterationId: request.iterationId,
      repositoryRoot: binding.repositoryRoot,
      baseCommitSha: tasking.iteration.baseCommitSha,
      branchName: requiredBranch(tasking.iteration.branchName),
    });
    await this.options.worktrees.recover(worktree);
    return {
      binding,
      tasking,
      worktree,
      snapshot: await this.options.worktrees.snapshot(worktree),
      identity: this.identity(request),
    };
  }

  private async prepareExisting(
    request: RunPairRequest,
    pair: RemotePair,
  ): Promise<{
    identity: PairCheckpointIdentity;
    worktree: IterationWorktree;
    snapshot: IterationWorktreeSnapshot;
    checkpoint: PairLocalCheckpoint | null;
  }> {
    const binding = await this.requireBinding(request.workspaceId);
    const worktree = this.locateWorktree(pair, binding.repositoryRoot);
    assertPairWorktreeAuthority(pair, worktree, binding.repositoryRoot);
    await this.options.worktrees.recover(worktree);
    const identity = this.identity(request);
    const checkpoint = await this.options.checkpoints.load(identity);
    let snapshot = await this.options.worktrees.snapshot(worktree);
    const expectedDiffSha256 = pair.data.run.currentDiffSha256 ?? digest('');
    const validCheckpoint =
      checkpoint?.pairRunId === pair.data.run.id &&
      checkpoint.baseCommitSha === worktree.baseCommitSha &&
      checkpoint.branchName === worktree.branchName
        ? checkpoint
        : null;
    const pendingMatchesAuthority = Boolean(
      validCheckpoint?.pendingEvidence &&
        validCheckpoint.pendingEvidence.input.actionId ===
          pair.data.nextAction?.actionId,
    );
    const targetDiffSha256 =
      pendingMatchesAuthority && validCheckpoint
        ? validCheckpoint.diffSha256
        : expectedDiffSha256;
    if (snapshot.sha256 !== targetDiffSha256) {
      if (!validCheckpoint || validCheckpoint.diffSha256 !== targetDiffSha256) {
        throw new Error(
          'Iteration worktree does not match the last Server-confirmed Pair checkpoint.',
        );
      }
      snapshot = await this.options.worktrees.restoreCheckpoint(
        worktree,
        validCheckpoint.patch,
        validCheckpoint.diffSha256,
      );
    }
    return { identity, worktree, snapshot, checkpoint };
  }

  private locateWorktree(
    pair: RemotePair,
    repositoryRoot: string,
  ): IterationWorktree {
    return this.options.worktrees.locate({
      iterationId: pair.data.run.iterationId,
      repositoryRoot,
      baseCommitSha: pair.data.run.baseCommitSha,
      branchName: pair.data.run.branchName,
    });
  }

  private async claimLease(
    initial: RemotePair,
    abort: AbortController,
  ): Promise<string> {
    let pair = initial;
    const startedAt = Date.now();
    while (true) {
      if (abort.signal.aborted) throw abortError();
      const expiresAt = pair.data.run.leaseExpiresAt
        ? Date.parse(pair.data.run.leaseExpiresAt)
        : 0;
      const delay = Math.max(expiresAt - Date.now() + 100, 0);
      if (delay > 0) {
        if (Date.now() - startedAt + delay > MAX_LEASE_WAIT_MS) {
          throw new Error(
            'Another Desktop Pair Controller still owns the Workspace lease.',
          );
        }
        await sleep(delay, abort.signal);
        pair = await this.options.client.getPair(
          pair.data.run.workspaceId,
          pair.data.run.iterationId,
          abort.signal,
        );
        continue;
      }
      try {
        const claimed = await this.options.client.claimLease(
          pair,
          this.options.executorId,
          abort.signal,
        );
        return claimed.leaseToken;
      } catch (error) {
        if (Date.now() - startedAt >= MAX_LEASE_WAIT_MS) throw error;
        await sleep(250, abort.signal);
        pair = await this.options.client.getPair(
          pair.data.run.workspaceId,
          pair.data.run.iterationId,
          abort.signal,
        );
      }
    }
  }

  private async withHeartbeat<T>(
    context: PairExecutionContext,
    operation: () => Promise<T>,
    cancel: () => Promise<void>,
  ): Promise<T> {
    let stopped = false;
    let heartbeatFailure: Error | null = null;
    let rejectHeartbeat: (error: Error) => void = () => undefined;
    const failed = new Promise<never>((_resolve, reject) => {
      rejectHeartbeat = reject;
    });
    const heartbeat = async () => {
      if (stopped) return;
      try {
        await this.options.client.heartbeatLease(
          context.pair,
          context.leaseToken,
          context.abort.signal,
        );
      } catch (error) {
        heartbeatFailure =
          error instanceof Error ? error : new Error(String(error));
        rejectHeartbeat(heartbeatFailure);
        await cancel().catch(() => undefined);
        return;
      }
      if (!stopped) timer = setTimeout(heartbeat, this.heartbeatIntervalMs);
    };
    let timer = setTimeout(heartbeat, this.heartbeatIntervalMs);
    let removeAbortListener: () => void = () => undefined;
    const aborted = new Promise<never>((_resolve, reject) => {
      const onAbort = () => {
        void cancel().catch(() => undefined);
        reject(abortError());
      };
      if (context.abort.signal.aborted) {
        onAbort();
        return;
      }
      context.abort.signal.addEventListener('abort', onAbort, { once: true });
      removeAbortListener = () =>
        context.abort.signal.removeEventListener('abort', onAbort);
    });
    const running = operation();
    try {
      return await Promise.race([running, failed, aborted]);
    } finally {
      stopped = true;
      clearTimeout(timer);
      removeAbortListener();
      if (heartbeatFailure || context.abort.signal.aborted) {
        await running.catch(() => undefined);
      }
    }
  }

  private saveCheckpoint(
    identity: PairCheckpointIdentity,
    pair: RemotePair,
    worktree: IterationWorktree,
    snapshot: IterationWorktreeSnapshot,
    pendingEvidence: PairPendingEvidence | null,
    diagnostic: PairLocalDiagnostic | null,
  ): Promise<PairLocalCheckpoint> {
    return this.options.checkpoints.save(identity, {
      pairRunId: pair.data.run.id,
      pairVersion: pair.data.run.version,
      checkpoint: pair.data.run.checkpoint,
      worktree,
      snapshot,
      pendingEvidence,
      diagnostic,
    });
  }

  private restoreBefore(
    context: PairExecutionContext,
    before: IterationWorktreeSnapshot,
  ): Promise<IterationWorktreeSnapshot> {
    return this.options.worktrees.restoreCheckpoint(
      context.worktree,
      before.content,
      before.sha256,
    );
  }

  private identity(request: RunPairRequest): PairCheckpointIdentity {
    return {
      apiBaseUrl: this.options.apiBaseUrl,
      workspaceId: request.workspaceId,
      iterationId: request.iterationId,
    };
  }

  private async requireBinding(
    workspaceId: string,
  ): Promise<{ repositoryRoot: string }> {
    const binding = await this.options.bindings.find(
      this.options.apiBaseUrl,
      workspaceId,
    );
    if (!binding) {
      throw new Error(
        'The Workspace must be bound to its local Git repository before Pair.',
      );
    }
    return binding;
  }

  private async exclusive<T>(
    request: RunPairRequest,
    operation: (abort: AbortController) => Promise<T>,
  ): Promise<T> {
    if (this.active.has(request.id)) {
      throw new Error(`Pair request ${request.id} is already running.`);
    }
    if (this.activeWorkspaces.has(request.workspaceId)) {
      throw new Error('This Workspace already has a local Pair Controller.');
    }
    const abort = new AbortController();
    this.active.set(request.id, { workspaceId: request.workspaceId, abort });
    this.activeWorkspaces.add(request.workspaceId);
    try {
      return await operation(abort);
    } finally {
      const active = this.active.get(request.id);
      if (active?.abort === abort) {
        this.active.delete(request.id);
        this.activeWorkspaces.delete(active.workspaceId);
      }
    }
  }
}

function assertPairWorktreeAuthority(
  pair: RemotePair,
  worktree: IterationWorktree,
  repositoryRoot: string,
): void {
  if (
    pair.data.run.baseCommitSha !== worktree.baseCommitSha ||
    pair.data.run.branchName !== worktree.branchName ||
    pair.data.run.iterationId !== worktree.iterationId ||
    worktree.repositoryRoot !== repositoryRoot
  ) {
    throw new Error('Pair authority does not match the Iteration worktree.');
  }
}

function hasAcceptedAction(pair: RemotePair, actionId: string): boolean {
  return (
    pair.data.driverAttempts.some((entry) => entry.actionId === actionId) ||
    pair.data.commandObservations.some(
      (entry) => entry.actionId === actionId,
    ) ||
    pair.data.redReviews.some((entry) => entry.actionId === actionId) ||
    pair.data.currentException?.actionId === actionId
  );
}

function localDiagnostic(
  actionId: string,
  observationId: string | null,
  result: PairCommandResult,
): PairLocalDiagnostic {
  return {
    actionId,
    observationId,
    termination: result.termination,
    exitCode: result.exitCode,
    signal: result.signal,
    stdout: boundedOutput(result.stdout),
    stderr: boundedOutput(result.stderr),
    stdoutSha256: result.stdoutSha256,
    stderrSha256: result.stderrSha256,
  };
}

function boundedOutput(value: string): string {
  const bytes = Buffer.from(value);
  return bytes.byteLength <= DIAGNOSTIC_BYTES
    ? value
    : bytes.subarray(bytes.byteLength - DIAGNOSTIC_BYTES).toString('utf8');
}

function actionMessage(action: PairNextAction): string {
  switch (action.kind) {
    case 'run_driver':
      return `Running bounded ${action.role} Driver.`;
    case 'execute_command':
      return `Executing locked ${action.stage} command.`;
    case 'review_red':
      return 'Running independent Red Reviewer.';
    case 'await_human':
      return 'Pair evidence is ready for human review.';
    case 'resolve_exception':
      return 'Pair exception requires a human route.';
  }
}

function humanMessage(pair: RemotePair): string {
  return pair.data.run.status === 'approval_required'
    ? 'Quality gates passed; review the complete Story diff before local commit.'
    : 'Pair stopped at an exception and requires an explicit human route.';
}

function summary(pair: RemotePair): PairControllerSummary {
  return {
    iterationId: pair.data.run.iterationId,
    pairRunId: pair.data.run.id,
    status: pair.data.run.status,
    checkpoint: pair.data.run.checkpoint,
    version: pair.data.run.version,
    nextAction: pair.data.nextAction?.kind ?? null,
    manifestSha256: pair.data.manifest?.contentSha256 ?? null,
    diffSha256:
      pair.data.manifest?.finalDiffSha256 ?? pair.data.run.currentDiffSha256,
    commitSha: pair.data.run.approvedCommitSha,
    exception: pair.data.currentException
      ? {
          kind: pair.data.currentException.kind,
          summary: pair.data.currentException.summary,
          allowedRoutes: pair.data.currentException.allowedRoutes,
        }
      : null,
  };
}

function emitEvent(
  emit: (event: PairControllerEvent) => void,
  requestId: string,
  event: PairControllerEvent['event'],
  message: string,
  checkpoint: PairControllerEvent['checkpoint'],
): void {
  emit({ requestId, event, message: message.slice(0, 2_000), checkpoint });
}

function requiredBranch(value: string | null | undefined): string {
  if (!value) throw new Error('Iteration has no provisioned worktree branch.');
  return value;
}

function boundedSummary(prefix: string, error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  return `${prefix}: ${detail}`.slice(0, 2_000);
}

function digest(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function abortError(): Error {
  const error = new Error('Pair Controller was cancelled.');
  error.name = 'AbortError';
  return error;
}

function sleep(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }
    const timer = setTimeout(resolve, milliseconds);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(abortError());
      },
      { once: true },
    );
  });
}
