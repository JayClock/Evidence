import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  DomainError,
  PAIR_EXECUTION_POLICY,
  PairRun,
  TASKING_PROCESS_CATALOG,
  allowedPairExceptionRoutes,
  materializePairExecutionBudget,
  materializePairExecutionPlan,
  normalizeClaimPairLeaseInput,
  normalizeDecidePairInput,
  normalizePairCommandObservationInput,
  normalizePairDriverAttemptInput,
  normalizePairExceptionInput,
  normalizePairRedReviewInput,
  normalizeStartPairInput,
  pairCommandPassed,
  type ApprovedTaskingPlan,
  type ClaimPairLeaseInput,
  type ClaimPairLeaseResult,
  type DecidePairInput,
  type HeartbeatPairLeaseInput,
  type JsonValue,
  type PairActionResult,
  type PairBudgetUsage,
  type PairCursor,
  type PairExceptionKind,
  type PairExecutionBudget,
  type PairNextAction,
  type PairView,
  type RecordPairCommandObservationInput,
  type RecordPairDriverAttemptInput,
  type RecordPairExceptionInput,
  type RecordPairRedReviewInput,
  type StartPairInput,
  type StartPairResult,
  type WorkspacePair,
} from '@evidence/server-domain';
import { Prisma } from '@prisma/client';
import { hashCanonicalJson } from '../workflow-content';
import {
  assembleStory,
  assembleStoryRevision,
  STORY_INCLUDE,
  STORY_REVISION_INCLUDE,
} from './workspace-delivery';
import { assembleIteration, iterationInclude } from './workspace-iterations';
import {
  assemblePairDecision,
  assemblePairDriverAttempt,
  assemblePairException,
  assemblePairManifest,
  assemblePairCommandObservation,
  assemblePairRedReview,
  assemblePairRun,
  pairNextAction,
  type PairAutomationExceptionRow,
  type PairCommandObservationRow,
  type PairDriverAttemptRow,
  type PairEvidenceRows,
  type PairRunRow,
} from './pair-persistence';
import { assembleApprovedPlan } from './workspace-tasking';
import type { PrismaStore } from './types';
import { inputJson, now } from './utils';

const ITERATION_INCLUDE = iterationInclude();
const LEASE_MS = 30_000;
const OPEN_STATUSES = ['running', 'approval_required', 'exception'];
const PROTECTED_PATHS = [
  '.git',
  '.pi',
  '.evidence',
  'engineering/evidence-orchestrator',
  'artifacts/iterations',
];
const CONFIG_NAMES = new Set([
  'package.json',
  'pnpm-lock.yaml',
  'nx.json',
  'project.json',
  'tsconfig.json',
  'tsconfig.base.json',
]);

export class PrismaWorkspacePair implements WorkspacePair {
  constructor(
    private readonly store: PrismaStore,
    private readonly workspaceId: string,
  ) {}

  async findPair(iterationId: string): Promise<PairView | null> {
    const run = await this.store.pairRun.findFirst({
      where: { workspaceId: this.workspaceId, iterationId },
      orderBy: { startedAt: 'desc' },
    });
    return run
      ? loadPairView(this.store, this.workspaceId, run as PairRunRow)
      : null;
  }

  async startPair(
    iterationId: string,
    rawInput: StartPairInput,
  ): Promise<StartPairResult> {
    const input = normalizeStartPairInput(rawInput);
    return this.transaction(async (store) => {
      const iteration = await requireIteration(
        store,
        this.workspaceId,
        iterationId,
      );
      if (
        iteration.lifecycle !== 'active' ||
        iteration.loop !== 'tasking' ||
        iteration.stage !== 'approved' ||
        !iteration.branchName
      ) {
        throw DomainError.conflict(
          `Iteration ${iterationId} is not at the approved Pair entry`,
        );
      }
      const planRow = await store.approvedTaskingPlan.findFirst({
        where: {
          id: input.approvedTaskingPlanId,
          workspaceId: this.workspaceId,
          iterationId,
        },
      });
      if (!planRow) {
        throw DomainError.notFound(
          `Approved Tasking Plan ${input.approvedTaskingPlanId} not found`,
        );
      }
      if (planRow.contentSha256 !== input.approvedTaskingPlanSha256) {
        throw DomainError.conflict('Approved Tasking Plan content has changed');
      }
      const approvedPlan = assembleApprovedPlan(planRow);
      validateApprovedPlanForPair(approvedPlan);
      requirePlanAuthority(iteration, approvedPlan);
      const [story, revision] = await Promise.all([
        store.story.findFirst({
          where: { id: planRow.storyId, workspaceId: this.workspaceId },
          include: STORY_INCLUDE,
        }),
        store.storyRevision.findUnique({
          where: { id: planRow.storyRevisionId },
          include: STORY_REVISION_INCLUDE,
        }),
      ]);
      if (
        !story ||
        !revision ||
        story.latestRevisionId !== revision.id ||
        revision.contentSha256 !==
          approvedPlan.description().plan.storyRevisionSha256
      ) {
        throw DomainError.conflict(
          'Approved Tasking Plan Story Revision is no longer current',
        );
      }
      const open = await store.pairRun.findFirst({
        where: {
          workspaceId: this.workspaceId,
          status: { in: OPEN_STATUSES },
        },
      });
      if (open) {
        throw DomainError.conflict(
          `Workspace ${this.workspaceId} already has an open Pair Run`,
        );
      }
      const timestamp = now();
      await claimIteration(
        store,
        this.workspaceId,
        iterationId,
        input.expectedIterationVersion,
        'tasking',
        ['approved'],
        { loop: 'pair', stage: 'plan_confirmed' },
        timestamp,
      );
      const sequence =
        (await store.pairRun.count({
          where: { workspaceId: this.workspaceId },
        })) + 1;
      const leaseToken = randomBytes(32).toString('base64url');
      const leaseExpiresAt = new Date(timestamp.getTime() + LEASE_MS);
      const run = await store.pairRun.create({
        data: {
          id: randomUUID(),
          reference: `PAIR-${String(sequence).padStart(4, '0')}`,
          workspaceId: this.workspaceId,
          iterationId,
          storyId: planRow.storyId,
          storyRevisionId: planRow.storyRevisionId,
          storyRevisionSha256:
            approvedPlan.description().plan.storyRevisionSha256,
          approvedTaskingPlanId: planRow.id,
          approvedTaskingPlanSha256: planRow.contentSha256,
          baseCommitSha: iteration.baseCommitSha,
          branchName: iteration.branchName,
          status: 'running',
          checkpoint: 'plan_confirmed',
          version: 1,
          cursor: inputJson(initialCursor()),
          completedTestIds: inputJson([]),
          completedStepKeys: inputJson([]),
          executionBudget: inputJson(
            approvedPlan.description().plan
              .executionBudget as unknown as Prisma.InputJsonValue,
          ),
          budgetUsage: inputJson(initialUsage()),
          leaseOwnerId: input.executorId,
          leaseTokenSha256: sha256Text(leaseToken),
          leaseExpiresAt,
          currentDiffSha256: null,
          finalManifestSha256: null,
          approvedCommitSha: null,
          startedAt: timestamp,
          updatedAt: timestamp,
          completedAt: null,
        },
      });
      return {
        view: await loadPairView(store, this.workspaceId, run as PairRunRow),
        leaseToken,
      };
    });
  }

  async claimPairLease(
    iterationId: string,
    rawInput: ClaimPairLeaseInput,
  ): Promise<ClaimPairLeaseResult> {
    const input = normalizeClaimPairLeaseInput(rawInput);
    return this.transaction(async (store) => {
      const timestamp = now();
      const run = await requirePairRun(
        store,
        this.workspaceId,
        iterationId,
        input.pairRunId,
      );
      if (
        run.version !== input.expectedPairVersion ||
        run.status !== 'running' ||
        (run.leaseExpiresAt && run.leaseExpiresAt > timestamp)
      ) {
        throw DomainError.conflict('Pair Run cannot grant a new lease');
      }
      const leaseToken = randomBytes(32).toString('base64url');
      const leaseExpiresAt = new Date(timestamp.getTime() + LEASE_MS);
      const claimed = await store.pairRun.updateMany({
        where: {
          id: run.id,
          version: input.expectedPairVersion,
          status: 'running',
          OR: [
            { leaseExpiresAt: null },
            { leaseExpiresAt: { lte: timestamp } },
          ],
        },
        data: {
          leaseOwnerId: input.executorId,
          leaseTokenSha256: sha256Text(leaseToken),
          leaseExpiresAt,
          updatedAt: timestamp,
        },
      });
      if (claimed.count !== 1) {
        throw DomainError.conflict(
          'Pair lease changed; reload before claiming',
        );
      }
      return {
        run: assemblePairRun({
          ...run,
          leaseOwnerId: input.executorId,
          leaseTokenSha256: sha256Text(leaseToken),
          leaseExpiresAt,
          updatedAt: timestamp,
        }),
        leaseToken,
      };
    });
  }

  async heartbeatPairLease(
    iterationId: string,
    input: HeartbeatPairLeaseInput,
  ): Promise<PairRun> {
    return this.transaction(async (store) => {
      const timestamp = now();
      const run = await requirePairRun(
        store,
        this.workspaceId,
        iterationId,
        input.pairRunId,
      );
      requireLease(run, input.expectedPairVersion, input.leaseToken, timestamp);
      const updated = await store.pairRun.updateMany({
        where: {
          id: run.id,
          version: input.expectedPairVersion,
          leaseTokenSha256: sha256Text(input.leaseToken),
          leaseExpiresAt: { gt: timestamp },
        },
        data: {
          leaseExpiresAt: new Date(timestamp.getTime() + LEASE_MS),
          updatedAt: timestamp,
        },
      });
      if (updated.count !== 1) {
        throw DomainError.conflict('Pair lease changed; reload before running');
      }
      return assemblePairRun({
        ...run,
        leaseExpiresAt: new Date(timestamp.getTime() + LEASE_MS),
        updatedAt: timestamp,
      });
    });
  }

  async recordPairDriverAttempt(
    iterationId: string,
    rawInput: RecordPairDriverAttemptInput,
  ): Promise<PairActionResult> {
    const input = normalizePairDriverAttemptInput(rawInput);
    return this.transaction(async (store) => {
      const duplicate = await store.pairDriverAttempt.findFirst({
        where: { pairRunId: input.pairRunId, actionId: input.actionId },
      });
      if (duplicate) {
        return actionResult(store, this.workspaceId, iterationId, duplicate.id);
      }
      const context = await requireAction(
        store,
        this.workspaceId,
        iterationId,
        input,
      );
      const next = requireActionKind(context.view.nextAction, 'run_driver');
      if (next.role !== input.role || next.mode !== input.mode) {
        throw DomainError.conflict('Pair Driver role no longer matches');
      }
      validateDriverPaths(input, next);
      const runDescription = context.view.run.description();
      const usage = incrementUsage(
        runDescription.budgetUsage,
        input.agentCallCount,
      );
      requireBudget(runDescription.executionBudget, usage);
      const timestamp = now();
      const sequence =
        (await store.pairDriverAttempt.count({
          where: { pairRunId: input.pairRunId },
        })) + 1;
      const workUnit = next.workUnit;
      const recordContent = {
        pairRunId: input.pairRunId,
        actionId: input.actionId,
        sequence,
        role: input.role,
        mode: input.mode,
        taskId: workUnit?.task.id ?? null,
        testId: workUnit?.test.id ?? null,
        processId: workUnit?.process.processId ?? null,
        stepId: workUnit?.step.id ?? null,
        summary: input.summary,
        changedPaths: input.changedPaths,
        beforeWorktreeSha256: input.beforeWorktreeSha256,
        afterWorktreeSha256: input.afterWorktreeSha256,
        diffSha256: input.diffSha256,
        agentCallCount: input.agentCallCount,
        inputTokens: input.inputTokens ?? null,
        outputTokens: input.outputTokens ?? null,
        completedAt: timestamp.toISOString(),
      };
      const attempt = await store.pairDriverAttempt.create({
        data: {
          id: randomUUID(),
          ...recordContent,
          changedPaths: inputJson(input.changedPaths),
          completedAt: timestamp,
          recordSha256: hashCanonicalJson(
            recordContent as unknown as JsonValue,
          ),
        },
      });
      const checkpoint =
        input.role === 'test'
          ? 'test_written'
          : input.role === 'production'
            ? 'implementation_written'
            : 'refactored';
      await advancePair(
        store,
        context,
        {
          checkpoint,
          currentDiffSha256: input.diffSha256,
          budgetUsage: inputJson(usage),
        },
        timestamp,
      );
      return actionResult(store, this.workspaceId, iterationId, attempt.id);
    });
  }

  async recordPairCommandObservation(
    iterationId: string,
    rawInput: RecordPairCommandObservationInput,
  ): Promise<PairActionResult> {
    const input = normalizePairCommandObservationInput(rawInput);
    return this.transaction(async (store) => {
      const duplicate = await store.pairCommandObservation.findFirst({
        where: { pairRunId: input.pairRunId, actionId: input.actionId },
      });
      if (duplicate) {
        return actionResult(store, this.workspaceId, iterationId, duplicate.id);
      }
      const context = await requireAction(
        store,
        this.workspaceId,
        iterationId,
        input,
      );
      const next = requireActionKind(
        context.view.nextAction,
        'execute_command',
      );
      if (next.stage !== input.stage || next.command !== input.command) {
        throw DomainError.conflict('Pair command authority no longer matches');
      }
      const description = context.view.run.description();
      const usage = incrementUsage(description.budgetUsage, 0);
      requireBudget(description.executionBudget, usage);
      const timestamp = now();
      const previous = await store.pairCommandObservation.findFirst({
        where: { pairRunId: input.pairRunId },
        orderBy: { sequence: 'desc' },
      });
      const sequence = (previous?.sequence ?? 0) + 1;
      const passed = pairCommandPassed(input);
      const failureFingerprint = passed
        ? null
        : hashCanonicalJson({
            stage: input.stage,
            command: input.command,
            termination: input.termination,
            exitCode: input.exitCode,
            signal: input.signal ?? null,
            stdoutSha256: input.stdoutSha256,
            stderrSha256: input.stderrSha256,
            diffSha256: input.diffSha256,
          });
      const processId =
        next.workUnit?.process.processId ?? next.gate?.processId;
      if (!processId) {
        throw DomainError.internal('Pair command lost its process authority');
      }
      const recordContent = {
        pairRunId: input.pairRunId,
        actionId: input.actionId,
        sequence,
        stage: input.stage,
        taskId: next.workUnit?.task.id ?? null,
        testId: next.workUnit?.test.id ?? null,
        processId,
        stepId: next.workUnit?.step.id ?? null,
        command: input.command,
        termination: input.termination,
        exitCode: input.exitCode,
        signal: input.signal ?? null,
        durationMs: input.durationMs,
        stdoutSha256: input.stdoutSha256,
        stdoutBytes: input.stdoutBytes,
        stdoutLines: input.stdoutLines,
        stderrSha256: input.stderrSha256,
        stderrBytes: input.stderrBytes,
        stderrLines: input.stderrLines,
        worktreeSha256: input.worktreeSha256,
        diffSha256: input.diffSha256,
        failureFingerprint,
        observedAt: timestamp.toISOString(),
        previousRecordSha256: previous?.recordSha256 ?? null,
      };
      const observation = await store.pairCommandObservation.create({
        data: {
          id: randomUUID(),
          ...recordContent,
          observedAt: timestamp,
          recordSha256: hashCanonicalJson(
            recordContent as unknown as JsonValue,
          ),
        },
      });
      const transition = await commandTransition(
        store,
        context,
        next,
        input,
        observation as PairCommandObservationRow,
        passed,
        usage,
        timestamp,
      );
      await advancePair(store, context, transition, timestamp);
      return actionResult(store, this.workspaceId, iterationId, observation.id);
    });
  }

  async recordPairRedReview(
    iterationId: string,
    rawInput: RecordPairRedReviewInput,
  ): Promise<PairActionResult> {
    const input = normalizePairRedReviewInput(rawInput);
    return this.transaction(async (store) => {
      const duplicate = await store.pairRedReview.findFirst({
        where: { pairRunId: input.pairRunId, actionId: input.actionId },
      });
      if (duplicate) {
        return actionResult(store, this.workspaceId, iterationId, duplicate.id);
      }
      const context = await requireAction(
        store,
        this.workspaceId,
        iterationId,
        input,
      );
      const next = requireActionKind(context.view.nextAction, 'review_red');
      if (next.observationId !== input.observationId) {
        throw DomainError.conflict('Red observation authority has changed');
      }
      const observation = await store.pairCommandObservation.findFirst({
        where: {
          id: input.observationId,
          pairRunId: input.pairRunId,
          stage: 'red',
        },
      });
      if (
        !observation ||
        (observation.termination === 'exited' && observation.exitCode === 0)
      ) {
        throw DomainError.conflict(
          'Red Review requires one failing Red observation',
        );
      }
      const timestamp = now();
      const accepted = input.classification === 'behavior';
      const recordContent = {
        pairRunId: input.pairRunId,
        actionId: input.actionId,
        observationId: input.observationId,
        classification: input.classification,
        accepted,
        reason: input.reason,
        reviewedAt: timestamp.toISOString(),
      };
      const review = await store.pairRedReview.create({
        data: {
          id: randomUUID(),
          ...recordContent,
          reviewedAt: timestamp,
          recordSha256: hashCanonicalJson(
            recordContent as unknown as JsonValue,
          ),
        },
      });
      const usage = incrementUsage(
        context.view.run.description().budgetUsage,
        1,
      );
      requireBudget(context.view.run.description().executionBudget, usage);
      const transition: PairAdvance = accepted
        ? { checkpoint: 'red_observed', budgetUsage: inputJson(usage) }
        : await exceptionTransition(
            store,
            context.view.run.identity(),
            input.actionId,
            'pseudo_red',
            `Red Reviewer classified the failure as ${input.classification}.`,
            observation.failureFingerprint,
            usage,
            timestamp,
          );
      await advancePair(store, context, transition, timestamp);
      return actionResult(store, this.workspaceId, iterationId, review.id);
    });
  }

  async recordPairException(
    iterationId: string,
    rawInput: RecordPairExceptionInput,
  ): Promise<PairActionResult> {
    const input = normalizePairExceptionInput(rawInput);
    return this.transaction(async (store) => {
      const duplicate = await store.pairAutomationException.findFirst({
        where: {
          pairRunId: input.pairRunId,
          actionId: input.actionId,
          resolvedAt: null,
        },
      });
      if (duplicate) {
        return actionResult(store, this.workspaceId, iterationId, duplicate.id);
      }
      const context = await requireAction(
        store,
        this.workspaceId,
        iterationId,
        input,
      );
      const usage = incrementUsage(
        context.view.run.description().budgetUsage,
        0,
      );
      const timestamp = now();
      const transition = await exceptionTransition(
        store,
        input.pairRunId,
        input.actionId,
        input.kind,
        input.summary,
        input.failureFingerprint ?? null,
        usage,
        timestamp,
      );
      await advancePair(store, context, transition, timestamp);
      const exception = await store.pairAutomationException.findFirst({
        where: { pairRunId: input.pairRunId, actionId: input.actionId },
      });
      if (!exception) {
        throw DomainError.internal('Pair exception was not persisted');
      }
      return actionResult(store, this.workspaceId, iterationId, exception.id);
    });
  }

  async decidePair(
    iterationId: string,
    rawInput: DecidePairInput,
    decidedByUserId: string,
  ): Promise<PairActionResult> {
    const input = normalizeDecidePairInput(rawInput);
    return this.transaction(async (store) => {
      const run = await store.pairRun.findFirst({
        where: { workspaceId: this.workspaceId, iterationId },
        orderBy: { startedAt: 'desc' },
      });
      if (!run) throw DomainError.notFound(`Pair ${iterationId} not found`);
      const existing = await store.pairCodingDecision.findFirst({
        where: {
          pairRunId: run.id,
          action: input.action,
          manifestSha256: input.manifestSha256 ?? null,
          diffSha256: input.diffSha256 ?? null,
          commitSha: input.commitSha ?? null,
          decidedByUserId,
        },
        orderBy: { decidedAt: 'desc' },
      });
      if (existing) {
        return actionResult(store, this.workspaceId, iterationId, existing.id);
      }
      if (run.version !== input.expectedPairVersion) {
        throw DomainError.conflict('Pair changed; reload before deciding');
      }
      const view = await loadPairView(
        store,
        this.workspaceId,
        run as PairRunRow,
      );
      requireHumanAction(view, input.action);
      const manifest = view.manifest?.description() ?? null;
      if (
        input.action === 'approve' &&
        (!manifest ||
          input.manifestSha256 !== manifest.contentSha256 ||
          input.diffSha256 !== manifest.finalDiffSha256 ||
          run.finalManifestSha256 !== manifest.contentSha256)
      ) {
        throw DomainError.conflict(
          'Pair approval evidence no longer matches the Manifest',
        );
      }
      const timestamp = now();
      const sequence =
        (await store.pairCodingDecision.count({
          where: { pairRunId: run.id },
        })) + 1;
      const decisionContent = {
        pairRunId: run.id,
        sequence,
        action: input.action,
        reason: input.reason,
        manifestSha256: input.manifestSha256 ?? null,
        diffSha256: input.diffSha256 ?? null,
        commitSha: input.commitSha ?? null,
        decidedByUserId,
        decidedAt: timestamp.toISOString(),
      };
      const decision = await store.pairCodingDecision.create({
        data: {
          id: randomUUID(),
          ...decisionContent,
          decidedAt: timestamp,
          contentSha256: hashCanonicalJson(
            decisionContent as unknown as JsonValue,
          ),
        },
      });
      const context: ActionContext = {
        run: run as PairRunRow,
        view,
        iteration: view.iteration,
      };
      const transition = decisionTransition(view, input, timestamp);
      await advancePair(store, context, transition.pair, timestamp, {
        loop: transition.iterationLoop,
        stage: transition.iterationStage,
        lifecycle: transition.iterationLifecycle,
      });
      if (view.currentException) {
        await store.pairAutomationException.updateMany({
          where: {
            id: view.currentException.identity(),
            pairRunId: run.id,
            resolvedAt: null,
          },
          data: { resolvedAt: timestamp },
        });
      }
      return actionResult(store, this.workspaceId, iterationId, decision.id);
    });
  }

  private async transaction<T>(
    operation: (store: PrismaStore) => Promise<T>,
  ): Promise<T> {
    if ('$transaction' in this.store) {
      return this.store.$transaction((transaction) => operation(transaction));
    }
    return operation(this.store);
  }
}

interface ActionContext {
  run: PairRunRow;
  view: PairView;
  iteration: PairView['iteration'];
}

type PairAdvance = Prisma.PairRunUpdateManyMutationInput & {
  checkpoint: string;
};

async function requireAction(
  store: PrismaStore,
  workspaceId: string,
  iterationId: string,
  input: {
    pairRunId: string;
    actionId: string;
    expectedPairVersion: number;
    leaseToken: string;
  },
): Promise<ActionContext> {
  const timestamp = now();
  const run = await requirePairRun(
    store,
    workspaceId,
    iterationId,
    input.pairRunId,
  );
  requireLease(run, input.expectedPairVersion, input.leaseToken, timestamp);
  const view = await loadPairView(store, workspaceId, run);
  if (
    !view.nextAction ||
    view.nextAction.actionId !== input.actionId ||
    view.nextAction.expectedPairVersion !== input.expectedPairVersion
  ) {
    throw DomainError.conflict('Pair action changed; reload before executing');
  }
  return { run, view, iteration: view.iteration };
}

async function requirePairRun(
  store: PrismaStore,
  workspaceId: string,
  iterationId: string,
  pairRunId: string,
): Promise<PairRunRow> {
  const run = await store.pairRun.findFirst({
    where: { id: pairRunId, workspaceId, iterationId },
  });
  if (!run) throw DomainError.notFound(`Pair Run ${pairRunId} not found`);
  return run as PairRunRow;
}

function requireLease(
  run: PairRunRow,
  expectedVersion: number,
  leaseToken: string,
  timestamp: Date,
): void {
  if (
    run.version !== expectedVersion ||
    run.status !== 'running' ||
    !run.leaseTokenSha256 ||
    run.leaseTokenSha256 !== sha256Text(leaseToken) ||
    !run.leaseExpiresAt ||
    run.leaseExpiresAt <= timestamp
  ) {
    throw DomainError.conflict('Pair lease or version changed');
  }
}

async function loadPairView(
  store: PrismaStore,
  workspaceId: string,
  run: PairRunRow,
): Promise<PairView> {
  const [iterationRow, storyRow, revisionRow, planRow, rows] =
    await Promise.all([
      requireIteration(store, workspaceId, run.iterationId),
      store.story.findFirst({
        where: { id: run.storyId, workspaceId },
        include: STORY_INCLUDE,
      }),
      store.storyRevision.findUnique({
        where: { id: run.storyRevisionId },
        include: STORY_REVISION_INCLUDE,
      }),
      store.approvedTaskingPlan.findFirst({
        where: {
          id: run.approvedTaskingPlanId,
          workspaceId,
          iterationId: run.iterationId,
        },
      }),
      loadEvidenceRows(store, run.id),
    ]);
  if (!storyRow || !revisionRow || !planRow) {
    throw DomainError.internal(`Pair Run ${run.id} lost its authority`);
  }
  const pairRun = assemblePairRun(run);
  const approvedPlan = assembleApprovedPlan(planRow);
  return {
    iteration: assembleIteration(iterationRow),
    story: assembleStory(storyRow),
    storyRevision: assembleStoryRevision(revisionRow),
    approvedPlan,
    run: pairRun,
    driverAttempts: rows.driverAttempts.map(assemblePairDriverAttempt),
    commandObservations: rows.commandObservations.map(
      assemblePairCommandObservation,
    ),
    redReviews: rows.redReviews.map(assemblePairRedReview),
    currentException: rows.currentException
      ? assemblePairException(rows.currentException)
      : null,
    manifest: rows.manifest ? assemblePairManifest(rows.manifest) : null,
    decisions: rows.decisions.map(assemblePairDecision),
    nextAction: pairNextAction(pairRun, approvedPlan, rows),
  };
}

async function loadEvidenceRows(
  store: PrismaStore,
  pairRunId: string,
): Promise<PairEvidenceRows> {
  const [
    driverAttempts,
    commandObservations,
    redReviews,
    currentException,
    manifest,
    decisions,
  ] = await Promise.all([
    store.pairDriverAttempt.findMany({
      where: { pairRunId },
      orderBy: { sequence: 'asc' },
    }),
    store.pairCommandObservation.findMany({
      where: { pairRunId },
      orderBy: { sequence: 'asc' },
    }),
    store.pairRedReview.findMany({
      where: { pairRunId },
      orderBy: { reviewedAt: 'asc' },
    }),
    store.pairAutomationException.findFirst({
      where: { pairRunId, resolvedAt: null },
      orderBy: { raisedAt: 'desc' },
    }),
    store.pairExecutionManifest.findFirst({ where: { pairRunId } }),
    store.pairCodingDecision.findMany({
      where: { pairRunId },
      orderBy: { decidedAt: 'asc' },
    }),
  ]);
  return {
    driverAttempts: driverAttempts as PairDriverAttemptRow[],
    commandObservations: commandObservations as PairCommandObservationRow[],
    redReviews,
    currentException: currentException as PairAutomationExceptionRow | null,
    manifest,
    decisions,
  } as PairEvidenceRows;
}

async function requireIteration(
  store: PrismaStore,
  workspaceId: string,
  iterationId: string,
) {
  const iteration = await store.iteration.findFirst({
    where: { id: iterationId, workspaceId },
    include: ITERATION_INCLUDE,
  });
  if (!iteration)
    throw DomainError.notFound(`Iteration ${iterationId} not found`);
  return iteration;
}

function validateApprovedPlanForPair(approvedPlan: ApprovedTaskingPlan): void {
  const plan = approvedPlan.description().plan;
  const execution = materializePairExecutionPlan(plan);
  if (
    hashCanonicalJson(plan.projectCatalog as unknown as JsonValue) !==
    plan.projectCatalogSha256
  ) {
    throw DomainError.conflict('Approved Pair Nx project catalog has changed');
  }
  for (const selection of plan.processes) {
    const definition = TASKING_PROCESS_CATALOG.find(
      ({ id }) => id === selection.processId,
    );
    if (
      !definition ||
      hashCanonicalJson(definition as unknown as JsonValue) !==
        selection.definitionSha256
    ) {
      throw DomainError.conflict(
        `Approved Pair process ${selection.processId} has changed`,
      );
    }
    const { materializedSha256, ...materialized } = selection;
    if (
      hashCanonicalJson(materialized as unknown as JsonValue) !==
      materializedSha256
    ) {
      throw DomainError.conflict(
        `Approved Pair process ${selection.processId} materialization has changed`,
      );
    }
  }
  const expectedBudget = materializePairExecutionBudget({
    testCount: execution.workUnits.length,
    processStepCount: plan.processes.reduce(
      (count, process) => count + process.selectedStepIds.length,
      0,
    ),
    qualityGateCount: plan.processes.reduce(
      (count, process) => count + process.qualityGates.length,
      0,
    ),
    policySha256: hashCanonicalJson(
      PAIR_EXECUTION_POLICY as unknown as JsonValue,
    ),
  });
  if (
    hashCanonicalJson(expectedBudget as unknown as JsonValue) !==
    hashCanonicalJson(plan.executionBudget as unknown as JsonValue)
  ) {
    throw DomainError.conflict('Approved Pair execution budget has changed');
  }
}

function requirePlanAuthority(
  iteration: Awaited<ReturnType<typeof requireIteration>>,
  approvedPlan: ApprovedTaskingPlan,
): void {
  const plan = approvedPlan.description();
  if (
    plan.iteration.id() !== iteration.id ||
    plan.plan.baseCommitSha !== iteration.baseCommitSha ||
    plan.plan.story.id() !== iteration.story?.id
  ) {
    throw DomainError.conflict(
      'Approved Tasking Plan no longer matches the Iteration authority',
    );
  }
}

async function claimIteration(
  store: PrismaStore,
  workspaceId: string,
  iterationId: string,
  expectedVersion: number,
  loop: string,
  stages: string[],
  data: Prisma.IterationUpdateManyMutationInput,
  timestamp: Date,
) {
  const claimed = await store.iteration.updateMany({
    where: {
      id: iterationId,
      workspaceId,
      lifecycle: 'active',
      loop,
      stage: { in: stages },
      version: expectedVersion,
    },
    data: { ...data, version: { increment: 1 }, updatedAt: timestamp },
  });
  if (claimed.count !== 1) {
    throw DomainError.conflict(
      `Iteration ${iterationId} changed; reload before Pair`,
    );
  }
}

async function advancePair(
  store: PrismaStore,
  context: ActionContext,
  data: PairAdvance,
  timestamp: Date,
  iterationOverride?: {
    loop?: string;
    stage?: string;
    lifecycle?: string;
  },
): Promise<void> {
  const run = context.view.run.description();
  const advanced = await store.pairRun.updateMany({
    where: {
      id: context.run.id,
      workspaceId: context.run.workspaceId,
      version: run.version,
    },
    data: {
      ...data,
      version: { increment: 1 },
      leaseExpiresAt:
        data.status === 'running' || !data.status
          ? new Date(timestamp.getTime() + LEASE_MS)
          : null,
      updatedAt: timestamp,
    },
  });
  if (advanced.count !== 1) {
    throw DomainError.conflict(
      'Pair changed; reload before recording evidence',
    );
  }
  const iteration = context.iteration.description();
  const iterationAdvanced = await store.iteration.updateMany({
    where: {
      id: context.iteration.identity(),
      workspaceId: context.run.workspaceId,
      version: iteration.version,
      lifecycle: 'active',
      loop: 'pair',
    },
    data: {
      ...(iterationOverride?.loop ? { loop: iterationOverride.loop } : {}),
      ...(iterationOverride?.stage
        ? { stage: iterationOverride.stage }
        : { stage: data.checkpoint }),
      ...(iterationOverride?.lifecycle
        ? { lifecycle: iterationOverride.lifecycle }
        : {}),
      version: { increment: 1 },
      updatedAt: timestamp,
    },
  });
  if (iterationAdvanced.count !== 1) {
    throw DomainError.conflict(
      'Iteration changed; reload before recording Pair evidence',
    );
  }
}

async function actionResult(
  store: PrismaStore,
  workspaceId: string,
  iterationId: string,
  acceptedRecordId: string,
): Promise<PairActionResult> {
  const run = await store.pairRun.findFirst({
    where: { workspaceId, iterationId },
    orderBy: { startedAt: 'desc' },
  });
  if (!run) throw DomainError.internal('Pair Run disappeared after mutation');
  return {
    view: await loadPairView(store, workspaceId, run as PairRunRow),
    acceptedRecordId,
  };
}

function requireActionKind<K extends PairNextAction['kind']>(
  action: PairNextAction | null,
  kind: K,
): Extract<PairNextAction, { kind: K }> {
  if (!action || action.kind !== kind) {
    throw DomainError.conflict(`Pair no longer expects ${kind}`);
  }
  return action as Extract<PairNextAction, { kind: K }>;
}

function validateDriverPaths(
  input: RecordPairDriverAttemptInput,
  action: Extract<PairNextAction, { kind: 'run_driver' }>,
): void {
  if (
    input.role !== 'refactor' &&
    (input.changedPaths.length === 0 ||
      input.beforeWorktreeSha256 === input.afterWorktreeSha256)
  ) {
    throw DomainError.conflict('Pair Driver made no observable progress');
  }
  for (const path of input.changedPaths) {
    if (
      PROTECTED_PATHS.some(
        (root) => path === root || path.startsWith(`${root}/`),
      ) ||
      CONFIG_NAMES.has(path.split('/').at(-1) ?? path)
    ) {
      throw DomainError.conflict(`Pair Driver changed protected path ${path}`);
    }
    if (input.role === 'test') {
      if (
        !action.allowedTestRoots.some((root) => owns(root, path)) ||
        !isTestPath(path)
      ) {
        throw DomainError.conflict(`Test Driver changed non-test path ${path}`);
      }
      continue;
    }
    if (!action.allowedProductionRoots.some((root) => owns(root, path))) {
      throw DomainError.conflict(
        `Production Driver changed unplanned path ${path}`,
      );
    }
    if (isTestPath(path) || action.frozenTestPaths.includes(path)) {
      throw DomainError.conflict(
        `Production Driver changed frozen test ${path}`,
      );
    }
  }
}

async function commandTransition(
  store: PrismaStore,
  context: ActionContext,
  action: Extract<PairNextAction, { kind: 'execute_command' }>,
  input: RecordPairCommandObservationInput,
  observation: PairCommandObservationRow,
  passed: boolean,
  usage: PairBudgetUsage,
  timestamp: Date,
): Promise<PairAdvance> {
  const description = context.view.run.description();
  const execution = materializePairExecutionPlan(
    context.view.approvedPlan.description().plan,
  );
  if (input.stage === 'red') {
    if (passed) {
      return exceptionTransition(
        store,
        input.pairRunId,
        input.actionId,
        'unexpected_green',
        'The newly written TEST passed before Production changed.',
        observation.failureFingerprint,
        usage,
        timestamp,
      );
    }
    if (input.termination !== 'exited' || input.exitCode === null) {
      return exceptionTransition(
        store,
        input.pairRunId,
        input.actionId,
        'pseudo_red',
        `Red command terminated as ${input.termination}.`,
        observation.failureFingerprint,
        usage,
        timestamp,
      );
    }
    return {
      checkpoint: 'test_written',
      currentDiffSha256: input.diffSha256,
      budgetUsage: inputJson(usage),
    };
  }
  if (!passed) {
    const kind: PairExceptionKind =
      input.stage === 'green'
        ? 'green_failed'
        : input.stage === 'refactor'
          ? 'refactor_failed'
          : 'quality_gate_failed';
    return exceptionTransition(
      store,
      input.pairRunId,
      input.actionId,
      kind,
      `${input.stage} command did not pass.`,
      observation.failureFingerprint,
      usage,
      timestamp,
    );
  }
  if (input.stage === 'green') {
    const unit = action.workUnit;
    if (!unit) throw DomainError.internal('Green command lost its TEST');
    const completedTestIds = unique([
      ...description.completedTestIds,
      unit.test.id,
    ]);
    const nextIndex = description.cursor.unitIndex + 1;
    const nextUnit = execution.workUnits[nextIndex];
    const leavesStep = !nextUnit || nextUnit.stepKey !== unit.stepKey;
    return {
      checkpoint: leavesStep ? 'green_observed' : 'plan_confirmed',
      cursor: inputJson({
        ...description.cursor,
        unitIndex: nextIndex,
        pendingRefactorStepKey: leavesStep ? unit.stepKey : null,
        refactorVerificationIndex: 0,
      }),
      completedTestIds: inputJson(completedTestIds),
      currentDiffSha256: input.diffSha256,
      budgetUsage: inputJson(usage),
    };
  }
  if (input.stage === 'refactor') {
    const stepKey = description.cursor.pendingRefactorStepKey;
    if (!stepKey) {
      throw DomainError.internal('Refactor verification lost its process step');
    }
    const stepUnits = execution.workUnits.filter(
      (unit) => unit.stepKey === stepKey,
    );
    const nextVerification = description.cursor.refactorVerificationIndex + 1;
    if (nextVerification < stepUnits.length) {
      return {
        checkpoint: 'refactored',
        cursor: inputJson({
          ...description.cursor,
          refactorVerificationIndex: nextVerification,
        }),
        currentDiffSha256: input.diffSha256,
        budgetUsage: inputJson(usage),
      };
    }
    return {
      checkpoint: 'refactored',
      cursor: inputJson({
        ...description.cursor,
        pendingRefactorStepKey: null,
        refactorVerificationIndex: 0,
        qualityGateIndex: 0,
      }),
      completedStepKeys: inputJson(
        unique([...description.completedStepKeys, stepKey]),
      ),
      currentDiffSha256: input.diffSha256,
      budgetUsage: inputJson(usage),
    };
  }
  const nextGate = description.cursor.qualityGateIndex + 1;
  if (nextGate < execution.qualityGates.length) {
    return {
      checkpoint: 'refactored',
      cursor: inputJson({
        ...description.cursor,
        qualityGateIndex: nextGate,
      }),
      currentDiffSha256: input.diffSha256,
      budgetUsage: inputJson(usage),
    };
  }
  const manifest = await createManifest(
    store,
    context,
    input.diffSha256,
    observation,
    timestamp,
  );
  return {
    status: 'approval_required',
    checkpoint: 'quality_gates_passed',
    currentDiffSha256: input.diffSha256,
    finalManifestSha256: manifest.contentSha256,
    leaseOwnerId: null,
    leaseTokenSha256: null,
    leaseExpiresAt: null,
    budgetUsage: inputJson(usage),
  };
}

async function createManifest(
  store: PrismaStore,
  context: ActionContext,
  finalDiffSha256: string,
  currentObservation: PairCommandObservationRow,
  timestamp: Date,
) {
  const rows = await loadEvidenceRows(store, context.run.id);
  const attempts = rows.driverAttempts;
  const observations = rows.commandObservations.some(
    ({ id }) => id === currentObservation.id,
  )
    ? rows.commandObservations
    : [...rows.commandObservations, currentObservation];
  const changedPaths = unique(
    attempts.flatMap(({ changedPaths, id }) =>
      jsonStrings(changedPaths, id, 'changed paths'),
    ),
  ).sort();
  const description = context.view.run.description();
  const evidenceChainSha256 = hashCanonicalJson([
    ...attempts.map(({ id, recordSha256 }) => ({
      kind: 'driver',
      id,
      recordSha256,
    })),
    ...observations.map(({ id, recordSha256 }) => ({
      kind: 'command',
      id,
      recordSha256,
    })),
    ...rows.redReviews.map(({ id, recordSha256 }) => ({
      kind: 'red-review',
      id,
      recordSha256,
    })),
  ] as unknown as JsonValue);
  const content = {
    pairRunId: context.run.id,
    approvedTaskingPlanSha256: description.approvedTaskingPlanSha256,
    storyRevisionSha256: description.storyRevisionSha256,
    baseCommitSha: description.baseCommitSha,
    completedTestIds: description.completedTestIds,
    completedStepKeys: description.completedStepKeys,
    driverAttemptIds: attempts.map(({ id }) => id),
    commandObservationIds: observations.map(({ id }) => id),
    redReviewIds: rows.redReviews.map(({ id }) => id),
    changedPaths,
    finalDiffSha256,
    evidenceChainSha256,
    generatedAt: timestamp.toISOString(),
  };
  return store.pairExecutionManifest.create({
    data: {
      id: randomUUID(),
      pairRunId: context.run.id,
      approvedTaskingPlanSha256: description.approvedTaskingPlanSha256,
      storyRevisionSha256: description.storyRevisionSha256,
      baseCommitSha: description.baseCommitSha,
      completedTestIds: inputJson(description.completedTestIds),
      completedStepKeys: inputJson(description.completedStepKeys),
      driverAttemptIds: inputJson(attempts.map(({ id }) => id)),
      commandObservationIds: inputJson(observations.map(({ id }) => id)),
      redReviewIds: inputJson(rows.redReviews.map(({ id }) => id)),
      changedPaths: inputJson(changedPaths),
      finalDiffSha256,
      evidenceChainSha256,
      generatedAt: timestamp,
      contentSha256: hashCanonicalJson(content as unknown as JsonValue),
    },
  });
}

async function exceptionTransition(
  store: PrismaStore,
  pairRunId: string,
  actionId: string | null,
  kind: PairExceptionKind,
  summary: string,
  failureFingerprint: string | null,
  usage: PairBudgetUsage,
  timestamp: Date,
): Promise<PairAdvance> {
  const allowedRoutes = allowedPairExceptionRoutes(kind);
  const content = {
    pairRunId,
    actionId,
    kind,
    summary,
    failureFingerprint,
    allowedRoutes,
    raisedAt: timestamp.toISOString(),
  };
  await store.pairAutomationException.create({
    data: {
      id: randomUUID(),
      pairRunId,
      actionId,
      kind,
      summary,
      failureFingerprint,
      allowedRoutes: inputJson(allowedRoutes),
      raisedAt: timestamp,
      resolvedAt: null,
      recordSha256: hashCanonicalJson(content as unknown as JsonValue),
    },
  });
  return {
    status: 'exception',
    checkpoint: 'exception',
    leaseOwnerId: null,
    leaseTokenSha256: null,
    leaseExpiresAt: null,
    budgetUsage: inputJson(usage),
  };
}

function decisionTransition(
  view: PairView,
  input: ReturnType<typeof normalizeDecidePairInput>,
  timestamp: Date,
) {
  const description = view.run.description();
  const execution = materializePairExecutionPlan(
    view.approvedPlan.description().plan,
  );
  switch (input.action) {
    case 'approve':
      return {
        pair: {
          status: 'approved',
          checkpoint: 'approved',
          approvedCommitSha: input.commitSha,
          completedAt: timestamp,
          leaseOwnerId: null,
          leaseTokenSha256: null,
          leaseExpiresAt: null,
        } satisfies PairAdvance,
        iterationLoop: 'pair',
        iterationStage: 'approved',
        iterationLifecycle: 'active',
      };
    case 'back_test':
      return {
        pair: {
          status: 'running',
          checkpoint: 'plan_confirmed',
          completedAt: null,
        } satisfies PairAdvance,
        iterationLoop: 'pair',
        iterationStage: 'plan_confirmed',
        iterationLifecycle: 'active',
      };
    case 'back_implementation': {
      const unitIndex = Math.min(
        description.cursor.unitIndex,
        Math.max(execution.workUnits.length - 1, 0),
      );
      const unit = execution.workUnits[unitIndex];
      return {
        pair: {
          status: 'running',
          checkpoint: 'red_observed',
          cursor: inputJson({
            ...description.cursor,
            unitIndex,
            pendingRefactorStepKey: null,
            refactorVerificationIndex: 0,
          }),
          completedTestIds: inputJson(
            unit
              ? description.completedTestIds.filter((id) => id !== unit.test.id)
              : description.completedTestIds,
          ),
          completedStepKeys: inputJson(
            unit
              ? description.completedStepKeys.filter(
                  (key) => key !== unit.stepKey,
                )
              : description.completedStepKeys,
          ),
          completedAt: null,
        } satisfies PairAdvance,
        iterationLoop: 'pair',
        iterationStage: 'red_observed',
        iterationLifecycle: 'active',
      };
    }
    case 'retry_quality':
      return {
        pair: {
          status: 'running',
          checkpoint: 'refactored',
          cursor: inputJson({
            ...description.cursor,
            pendingRefactorStepKey: null,
            refactorVerificationIndex: 0,
            qualityGateIndex: 0,
          }),
          completedAt: null,
        } satisfies PairAdvance,
        iterationLoop: 'pair',
        iterationStage: 'refactored',
        iterationLifecycle: 'active',
      };
    case 'back_tasking':
      return {
        pair: {
          status: 'cancelled',
          checkpoint: 'exception',
          completedAt: timestamp,
          leaseOwnerId: null,
          leaseTokenSha256: null,
          leaseExpiresAt: null,
        } satisfies PairAdvance,
        iterationLoop: 'tasking',
        iterationStage: 'knowledge_gap',
        iterationLifecycle: 'active',
      };
    case 'cancel':
      return {
        pair: {
          status: 'cancelled',
          checkpoint: 'exception',
          completedAt: timestamp,
          leaseOwnerId: null,
          leaseTokenSha256: null,
          leaseExpiresAt: null,
        } satisfies PairAdvance,
        iterationLoop: 'pair',
        iterationStage: 'exception',
        iterationLifecycle: 'halted',
      };
  }
}

function requireHumanAction(view: PairView, action: DecidePairInput['action']) {
  if (view.run.description().status === 'approval_required') {
    if (
      !['approve', 'back_implementation', 'back_tasking', 'cancel'].includes(
        action,
      )
    ) {
      throw DomainError.conflict(`Pair approval cannot route ${action}`);
    }
    return;
  }
  const exception = view.currentException?.description();
  if (
    view.run.description().status !== 'exception' ||
    !exception ||
    !exception.allowedRoutes.includes(action)
  ) {
    throw DomainError.conflict(
      `Pair cannot route ${action} from this checkpoint`,
    );
  }
}

function initialCursor(): PairCursor {
  return {
    unitIndex: 0,
    pendingRefactorStepKey: null,
    refactorVerificationIndex: 0,
    qualityGateIndex: 0,
  };
}

function initialUsage(): PairBudgetUsage {
  return {
    agentCalls: 0,
    checkpoints: 0,
    repeatedFingerprintCount: 0,
    noProgressCheckpoints: 0,
  };
}

function incrementUsage(
  usage: PairBudgetUsage,
  agentCalls: number,
): PairBudgetUsage {
  return {
    ...usage,
    agentCalls: usage.agentCalls + agentCalls,
    checkpoints: usage.checkpoints + 1,
  };
}

function requireBudget(
  budget: PairExecutionBudget,
  usage: PairBudgetUsage,
): void {
  if (
    usage.agentCalls > budget.maxAgentCalls ||
    usage.checkpoints > budget.maxCheckpoints ||
    usage.repeatedFingerprintCount > budget.maxRetriesPerFingerprint ||
    usage.noProgressCheckpoints > budget.maxNoProgressCheckpoints
  ) {
    throw DomainError.conflict('Pair execution budget is exhausted');
  }
}

function owns(root: string, path: string): boolean {
  return path === root || path.startsWith(`${root}/`);
}

function isTestPath(path: string): boolean {
  return /(^|\/)(?:tests?\/|__tests__\/)|\.(?:test|spec)\.[cm]?[jt]sx?$/.test(
    path,
  );
}

function sha256Text(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function jsonStrings(
  value: Prisma.JsonValue,
  id: string,
  field: string,
): string[] {
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== 'string')
  ) {
    throw DomainError.internal(`Pair record ${id} has invalid ${field}`);
  }
  return value as string[];
}
