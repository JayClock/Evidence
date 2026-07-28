import { randomUUID } from 'node:crypto';
import {
  DomainError,
  SHOWCASE_FEEDBACK_ROUTES,
  materializeShowcaseQ2Checks,
  normalizeDecideShowcaseInput,
  normalizeShowcaseEvaluationInput,
  normalizeShowcaseProductObservationInput,
  normalizeShowcaseQ2ObservationInput,
  normalizeShowcaseReviewInput,
  normalizeShowcaseRiskDecisionInput,
  showcaseReadinessBlockers,
  type DecideShowcaseInput,
  type JsonValue,
  type RecordShowcaseEvaluationInput,
  type RecordShowcaseProductObservationInput,
  type RecordShowcaseQ2ObservationInput,
  type RecordShowcaseReviewInput,
  type RecordShowcaseRiskDecisionInput,
  type ShowcaseActionResult,
  type ShowcaseNextAction,
  type ShowcaseView,
  type WorkspaceShowcase,
} from '@evidence/server-domain';
import { Prisma } from '@prisma/client';
import { hashCanonicalJson } from '../workflow-content';
import { assemblePairManifest, assemblePairRun } from './pair-persistence';
import {
  assembleShowcaseDecision,
  assembleShowcaseEvaluation,
  assembleShowcaseProductObservation,
  assembleShowcaseQ2Observation,
  assembleShowcaseReview,
  assembleShowcaseRiskDecision,
  assembleShowcaseRun,
  showcaseNextAction,
  type ShowcaseDecisionRow,
  type ShowcaseEvaluationRow,
  type ShowcaseProductObservationRow,
  type ShowcaseQ2ObservationRow,
  type ShowcaseReviewRow,
  type ShowcaseRiskDecisionRow,
  type ShowcaseRunRow,
  type ShowcaseViewBase,
} from './showcase-persistence';
import type { PrismaStore } from './types';
import {
  assembleStory,
  assembleStoryRevision,
  STORY_INCLUDE,
  STORY_REVISION_INCLUDE,
} from './workspace-delivery';
import { assembleIteration, iterationInclude } from './workspace-iterations';
import { assembleApprovedPlan } from './workspace-tasking';
import { inputJson, now } from './utils';

const ITERATION_INCLUDE = iterationInclude();

export interface OpenShowcaseInput {
  pairRunId: string;
  pairManifestId: string;
  approvedCommitSha: string;
}

export class PrismaWorkspaceShowcase implements WorkspaceShowcase {
  constructor(
    private readonly store: PrismaStore,
    private readonly workspaceId: string,
  ) {}

  async findShowcase(iterationId: string): Promise<ShowcaseView | null> {
    const run = await latestShowcaseRun(
      this.store,
      this.workspaceId,
      iterationId,
    );
    return run ? loadShowcaseView(this.store, this.workspaceId, run) : null;
  }

  async recordQ2Observation(
    iterationId: string,
    rawInput: RecordShowcaseQ2ObservationInput,
  ): Promise<ShowcaseActionResult> {
    const input = normalizeShowcaseQ2ObservationInput(rawInput);
    return this.transaction(async (store) => {
      const run = await requireCurrentRun(
        store,
        this.workspaceId,
        iterationId,
        input.expectedShowcaseVersion,
      );
      if (run.id !== input.showcaseRunId) {
        throw DomainError.conflict('Showcase Run is no longer current');
      }
      const duplicate = await store.showcaseQ2Observation.findFirst({
        where: { showcaseRunId: run.id, actionId: input.actionId },
      });
      if (duplicate) {
        return actionResult(store, this.workspaceId, iterationId, duplicate.id);
      }
      const base = await loadShowcaseBase(store, this.workspaceId, run);
      const next = requireNextAction(base, 'execute_q2');
      if (
        next.actionId !== input.actionId ||
        next.command !== input.command ||
        next.approvedCommitSha !== input.approvedCommitSha
      ) {
        throw DomainError.conflict('Showcase Q2 authority has changed');
      }
      const timestamp = now();
      const previous = base.q2Observations.at(-1)?.description() ?? null;
      const sequence = base.q2Observations.length + 1;
      const content = {
        showcaseRunId: run.id,
        actionId: input.actionId,
        sequence,
        testId: next.testId,
        scenarioIds: next.scenarioIds,
        processId: next.processId,
        stepId: next.stepId,
        projectId: next.projectId,
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
        approvedCommitSha: input.approvedCommitSha,
        worktreeSha256: input.worktreeSha256,
        observedAt: timestamp.toISOString(),
        previousRecordSha256: previous?.recordSha256 ?? null,
      };
      const observation = await store.showcaseQ2Observation.create({
        data: {
          id: randomUUID(),
          ...content,
          scenarioIds: inputJson(next.scenarioIds),
          observedAt: timestamp,
          recordSha256: hashCanonicalJson(content as unknown as JsonValue),
        },
      });
      await advanceAfterEvidence(store, this.workspaceId, run, timestamp);
      return actionResult(store, this.workspaceId, iterationId, observation.id);
    });
  }

  async recordProductObservation(
    iterationId: string,
    rawInput: RecordShowcaseProductObservationInput,
    observedByUserId: string,
  ): Promise<ShowcaseActionResult> {
    const input = normalizeShowcaseProductObservationInput(rawInput);
    return this.transaction(async (store) => {
      const run = await requireCurrentRun(
        store,
        this.workspaceId,
        iterationId,
        input.expectedShowcaseVersion,
      );
      const base = await loadShowcaseBase(store, this.workspaceId, run);
      const next = requireNextAction(base, 'observe_scenario');
      if (next.scenarioId !== input.scenarioId) {
        throw DomainError.conflict('Showcase Scenario authority has changed');
      }
      const scenario = base.storyRevision
        .description()
        .scenarios.find((candidate) => candidate.id === next.scenarioId);
      if (!scenario) {
        throw DomainError.internal('Showcase Scenario snapshot is missing');
      }
      if (input.observedOutcomes.length !== scenario.then.length) {
        throw DomainError.validation(
          'Showcase must record one observed outcome for every Then step',
        );
      }
      const timestamp = now();
      const content = {
        showcaseRunId: run.id,
        scenarioId: scenario.id,
        scenarioReference: scenario.reference,
        givenSteps: scenario.given,
        whenStep: scenario.when,
        expectedThenSteps: scenario.then,
        businessData: scenario.businessData,
        observedOutcomes: input.observedOutcomes,
        observation: input.observation,
        valueFeedback: input.valueFeedback,
        evidenceRefs: input.evidenceRefs,
        observedByUserId,
        observedAt: timestamp.toISOString(),
      };
      const observation = await store.showcaseProductObservation.create({
        data: {
          id: randomUUID(),
          ...content,
          givenSteps: inputJson(scenario.given),
          expectedThenSteps: inputJson(scenario.then),
          businessData: inputJson(scenario.businessData),
          observedOutcomes: inputJson(input.observedOutcomes),
          evidenceRefs: inputJson(input.evidenceRefs),
          observedAt: timestamp,
          contentSha256: hashCanonicalJson(content as unknown as JsonValue),
        },
      });
      await advanceAfterEvidence(store, this.workspaceId, run, timestamp);
      return actionResult(store, this.workspaceId, iterationId, observation.id);
    });
  }

  async recordRiskDecision(
    iterationId: string,
    rawInput: RecordShowcaseRiskDecisionInput,
    decidedByUserId: string,
  ): Promise<ShowcaseActionResult> {
    const input = normalizeShowcaseRiskDecisionInput(rawInput);
    return this.transaction(async (store) => {
      const run = await requireCurrentRun(
        store,
        this.workspaceId,
        iterationId,
        input.expectedShowcaseVersion,
      );
      const base = await loadShowcaseBase(store, this.workspaceId, run);
      const next = requireNextAction(base, 'decide_risk');
      if (next.quadrant !== input.quadrant) {
        throw DomainError.conflict('Showcase risk authority has changed');
      }
      const timestamp = now();
      const content = {
        showcaseRunId: run.id,
        quadrant: input.quadrant,
        disposition: input.disposition,
        activities: input.activities,
        reason: input.reason,
        decidedByUserId,
        decidedAt: timestamp.toISOString(),
      };
      const decision = await store.showcaseRiskDecision.create({
        data: {
          id: randomUUID(),
          ...content,
          activities: inputJson(input.activities),
          decidedAt: timestamp,
          contentSha256: hashCanonicalJson(content as unknown as JsonValue),
        },
      });
      await advanceAfterEvidence(store, this.workspaceId, run, timestamp);
      return actionResult(store, this.workspaceId, iterationId, decision.id);
    });
  }

  async recordEvaluation(
    iterationId: string,
    rawInput: RecordShowcaseEvaluationInput,
    observedByUserId: string,
  ): Promise<ShowcaseActionResult> {
    const input = normalizeShowcaseEvaluationInput(rawInput);
    return this.transaction(async (store) => {
      const run = await requireCurrentRun(
        store,
        this.workspaceId,
        iterationId,
        input.expectedShowcaseVersion,
      );
      const base = await loadShowcaseBase(store, this.workspaceId, run);
      const next = requireNextAction(base, 'evaluate_risk');
      if (
        next.quadrant !== input.quadrant ||
        next.activity !== input.activity
      ) {
        throw DomainError.conflict('Showcase evaluation authority has changed');
      }
      const timestamp = now();
      const sequence = base.evaluations.length + 1;
      const content = {
        showcaseRunId: run.id,
        sequence,
        quadrant: input.quadrant,
        activity: input.activity,
        outcome: input.outcome,
        finding: input.finding,
        evidenceRefs: input.evidenceRefs,
        observedByUserId,
        observedAt: timestamp.toISOString(),
      };
      const evaluation = await store.showcaseEvaluation.create({
        data: {
          id: randomUUID(),
          ...content,
          evidenceRefs: inputJson(input.evidenceRefs),
          observedAt: timestamp,
          contentSha256: hashCanonicalJson(content as unknown as JsonValue),
        },
      });
      await advanceAfterEvidence(store, this.workspaceId, run, timestamp);
      return actionResult(store, this.workspaceId, iterationId, evaluation.id);
    });
  }

  async recordReview(
    iterationId: string,
    rawInput: RecordShowcaseReviewInput,
  ): Promise<ShowcaseActionResult> {
    const input = normalizeShowcaseReviewInput(rawInput);
    return this.transaction(async (store) => {
      const run = await requireCurrentRun(
        store,
        this.workspaceId,
        iterationId,
        input.expectedShowcaseVersion,
      );
      const base = await loadShowcaseBase(store, this.workspaceId, run);
      const next = requireNextAction(base, 'run_reviewer');
      if (
        next.evidenceBundleSha256 !== input.evidenceBundleSha256 ||
        run.evidenceBundleSha256 !== input.evidenceBundleSha256
      ) {
        throw DomainError.conflict('Showcase Review evidence has changed');
      }
      const timestamp = now();
      const content = {
        showcaseRunId: run.id,
        evidenceBundleSha256: input.evidenceBundleSha256,
        observedFacts: input.observedFacts,
        productDomainFeedback: input.productDomainFeedback,
        technicalQualityFeedback: input.technicalQualityFeedback,
        unresolvedAssumptions: input.unresolvedAssumptions,
        recommendation: input.recommendation,
        reviewedAt: timestamp.toISOString(),
      };
      const review = await store.showcaseReview.create({
        data: {
          id: randomUUID(),
          ...content,
          observedFacts: inputJson(input.observedFacts),
          productDomainFeedback: inputJson(input.productDomainFeedback),
          technicalQualityFeedback: inputJson(input.technicalQualityFeedback),
          unresolvedAssumptions: inputJson(input.unresolvedAssumptions),
          reviewedAt: timestamp,
          contentSha256: hashCanonicalJson(content as unknown as JsonValue),
        },
      });
      await advanceRun(store, run, { stage: 'decision' }, timestamp);
      await advanceIteration(
        store,
        iterationId,
        'showcase',
        'decision',
        timestamp,
      );
      return actionResult(store, this.workspaceId, iterationId, review.id);
    });
  }

  async decideShowcase(
    iterationId: string,
    rawInput: DecideShowcaseInput,
    decidedByUserId: string,
  ): Promise<ShowcaseActionResult> {
    const input = normalizeDecideShowcaseInput(rawInput);
    return this.transaction(async (store) => {
      const run = await requireCurrentRun(
        store,
        this.workspaceId,
        iterationId,
        input.expectedShowcaseVersion,
      );
      const base = await loadShowcaseBase(store, this.workspaceId, run);
      const next = showcaseNextAction(base);
      const review = base.review?.description() ?? null;
      if (input.action === 'accept') {
        if (
          next?.kind !== 'await_human' ||
          !review ||
          input.evidenceBundleSha256 !== run.evidenceBundleSha256 ||
          input.reviewSha256 !== review.contentSha256
        ) {
          throw DomainError.conflict(
            'Showcase acceptance evidence is incomplete or stale',
          );
        }
      } else if (
        next?.kind !== 'await_human' &&
        next?.kind !== 'resolve_failure'
      ) {
        throw DomainError.conflict('Showcase is not ready for a decision');
      }
      if (
        next?.kind === 'await_human' &&
        (input.evidenceBundleSha256 !== run.evidenceBundleSha256 ||
          input.reviewSha256 !== review?.contentSha256)
      ) {
        throw DomainError.conflict('Showcase decision evidence has changed');
      }
      const timestamp = now();
      const decisionId = randomUUID();
      const content = {
        showcaseRunId: run.id,
        action: input.action,
        reason: input.reason,
        feedbackTarget: input.feedbackTarget,
        evidenceBundleSha256: input.evidenceBundleSha256,
        reviewId: base.review?.identity() ?? null,
        decidedByUserId,
        decidedAt: timestamp.toISOString(),
      };
      const decision = await store.showcaseDecision.create({
        data: {
          id: decisionId,
          ...content,
          decidedAt: timestamp,
          contentSha256: hashCanonicalJson(content as unknown as JsonValue),
        },
      });

      if (input.action === 'accept') {
        await advanceRun(
          store,
          run,
          { stage: 'accepted', completedAt: timestamp },
          timestamp,
        );
        await advanceIteration(
          store,
          iterationId,
          'respond',
          'drafting',
          timestamp,
        );
      } else if (input.action === 'reject') {
        await advanceRun(
          store,
          run,
          { stage: 'rejected', completedAt: timestamp },
          timestamp,
        );
        await advanceIteration(
          store,
          iterationId,
          'showcase',
          'rejected',
          timestamp,
          'halted',
        );
      } else {
        const target = input.feedbackTarget;
        if (!target) {
          throw DomainError.internal('Showcase revise target was lost');
        }
        const route = SHOWCASE_FEEDBACK_ROUTES[target];
        await advanceRun(
          store,
          run,
          { stage: 'revised', completedAt: timestamp },
          timestamp,
        );
        await advanceIteration(
          store,
          iterationId,
          route.loop,
          route.stage,
          timestamp,
        );
        if (route.loop === 'showcase') {
          await openShowcaseRun(store, this.workspaceId, iterationId, {
            pairRunId: run.pairRunId,
            pairManifestId: run.pairManifestId,
            approvedCommitSha: run.approvedCommitSha,
          });
        }
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

export async function openShowcaseRun(
  store: PrismaStore,
  workspaceId: string,
  iterationId: string,
  input: OpenShowcaseInput,
): Promise<ShowcaseRunRow> {
  const [pairRun, pairManifest, iteration] = await Promise.all([
    store.pairRun.findFirst({
      where: { id: input.pairRunId, workspaceId, iterationId },
    }),
    store.pairExecutionManifest.findFirst({
      where: { id: input.pairManifestId, pairRunId: input.pairRunId },
    }),
    store.iteration.findFirst({ where: { id: iterationId, workspaceId } }),
  ]);
  if (!pairRun || !pairManifest || !iteration) {
    throw DomainError.conflict('Approved Pair authority cannot open Showcase');
  }
  if (
    pairRun.status !== 'approved' ||
    pairRun.approvedCommitSha !== input.approvedCommitSha ||
    pairRun.finalManifestSha256 !== pairManifest.contentSha256
  ) {
    throw DomainError.conflict('Pair approval does not match its Manifest');
  }
  const active = await store.showcaseRun.findFirst({
    where: {
      workspaceId,
      iterationId,
      stage: { in: ['setup', 'reviewing', 'decision'] },
    },
  });
  if (active) {
    throw DomainError.conflict('Iteration already has an active Showcase Run');
  }
  const timestamp = now();
  const [workspaceCount, iterationCount] = await Promise.all([
    store.showcaseRun.count({ where: { workspaceId } }),
    store.showcaseRun.count({ where: { iterationId } }),
  ]);
  return store.showcaseRun.create({
    data: {
      id: randomUUID(),
      reference: `SHOW-${String(workspaceCount + 1).padStart(4, '0')}`,
      attempt: iterationCount + 1,
      workspaceId,
      iterationId,
      storyId: pairRun.storyId,
      storyRevisionId: pairRun.storyRevisionId,
      storyRevisionSha256: pairRun.storyRevisionSha256,
      approvedTaskingPlanId: pairRun.approvedTaskingPlanId,
      approvedTaskingPlanSha256: pairRun.approvedTaskingPlanSha256,
      pairRunId: pairRun.id,
      pairManifestId: pairManifest.id,
      pairManifestSha256: pairManifest.contentSha256,
      approvedCommitSha: input.approvedCommitSha,
      stage: 'setup',
      version: 1,
      evidenceBundleSha256: null,
      startedAt: timestamp,
      updatedAt: timestamp,
      completedAt: null,
    },
  });
}

async function latestShowcaseRun(
  store: PrismaStore,
  workspaceId: string,
  iterationId: string,
): Promise<ShowcaseRunRow | null> {
  return store.showcaseRun.findFirst({
    where: { workspaceId, iterationId },
    orderBy: { attempt: 'desc' },
  });
}

async function requireCurrentRun(
  store: PrismaStore,
  workspaceId: string,
  iterationId: string,
  expectedVersion: number,
): Promise<ShowcaseRunRow> {
  const run = await latestShowcaseRun(store, workspaceId, iterationId);
  if (!run) throw DomainError.notFound(`Showcase ${iterationId} not found`);
  if (run.version !== expectedVersion) {
    throw DomainError.conflict('Showcase changed; reload before continuing');
  }
  return run;
}

async function loadShowcaseView(
  store: PrismaStore,
  workspaceId: string,
  run: ShowcaseRunRow,
): Promise<ShowcaseView> {
  const base = await loadShowcaseBase(store, workspaceId, run);
  return { ...base, nextAction: showcaseNextAction(base) };
}

async function loadShowcaseBase(
  store: PrismaStore,
  workspaceId: string,
  run: ShowcaseRunRow,
): Promise<ShowcaseViewBase> {
  const [
    iteration,
    story,
    revision,
    plan,
    pairRun,
    pairManifest,
    q2Observations,
    productObservations,
    riskDecisions,
    evaluations,
    review,
    decision,
  ] = await Promise.all([
    store.iteration.findFirst({
      where: { id: run.iterationId, workspaceId },
      include: ITERATION_INCLUDE,
    }),
    store.story.findFirst({
      where: { id: run.storyId, workspaceId },
      include: STORY_INCLUDE,
    }),
    store.storyRevision.findUnique({
      where: { id: run.storyRevisionId },
      include: STORY_REVISION_INCLUDE,
    }),
    store.approvedTaskingPlan.findFirst({
      where: { id: run.approvedTaskingPlanId, workspaceId },
    }),
    store.pairRun.findFirst({
      where: { id: run.pairRunId, workspaceId },
    }),
    store.pairExecutionManifest.findFirst({
      where: { id: run.pairManifestId, pairRunId: run.pairRunId },
    }),
    store.showcaseQ2Observation.findMany({
      where: { showcaseRunId: run.id },
      orderBy: { sequence: 'asc' },
    }),
    store.showcaseProductObservation.findMany({
      where: { showcaseRunId: run.id },
      orderBy: { observedAt: 'asc' },
    }),
    store.showcaseRiskDecision.findMany({
      where: { showcaseRunId: run.id },
      orderBy: { decidedAt: 'asc' },
    }),
    store.showcaseEvaluation.findMany({
      where: { showcaseRunId: run.id },
      orderBy: { sequence: 'asc' },
    }),
    store.showcaseReview.findUnique({ where: { showcaseRunId: run.id } }),
    store.showcaseDecision.findUnique({ where: { showcaseRunId: run.id } }),
  ]);
  if (!iteration || !story || !revision || !plan || !pairRun || !pairManifest) {
    throw DomainError.internal(`Showcase Run ${run.id} lost locked authority`);
  }
  return {
    iteration: assembleIteration(iteration),
    story: assembleStory(story),
    storyRevision: assembleStoryRevision(revision),
    approvedPlan: assembleApprovedPlan(plan),
    pairRun: assemblePairRun(pairRun),
    pairManifest: assemblePairManifest(pairManifest),
    run: assembleShowcaseRun(run),
    q2Observations: (q2Observations as ShowcaseQ2ObservationRow[]).map(
      assembleShowcaseQ2Observation,
    ),
    productObservations: (
      productObservations as ShowcaseProductObservationRow[]
    ).map(assembleShowcaseProductObservation),
    riskDecisions: (riskDecisions as ShowcaseRiskDecisionRow[]).map(
      assembleShowcaseRiskDecision,
    ),
    evaluations: (evaluations as ShowcaseEvaluationRow[]).map(
      assembleShowcaseEvaluation,
    ),
    review: review ? assembleShowcaseReview(review as ShowcaseReviewRow) : null,
    decision: decision
      ? assembleShowcaseDecision(decision as ShowcaseDecisionRow)
      : null,
  };
}

function requireNextAction<K extends ShowcaseNextAction['kind']>(
  base: ShowcaseViewBase,
  kind: K,
): Extract<ShowcaseNextAction, { kind: K }> {
  const next = showcaseNextAction(base);
  if (next?.kind !== kind) {
    throw DomainError.conflict(`Showcase no longer expects ${kind}`);
  }
  return next as Extract<ShowcaseNextAction, { kind: K }>;
}

async function advanceAfterEvidence(
  store: PrismaStore,
  workspaceId: string,
  run: ShowcaseRunRow,
  timestamp: Date,
): Promise<void> {
  const base = await loadShowcaseBase(store, workspaceId, run);
  const blockers = showcaseReadinessBlockers({
    q2Checks: materializeShowcaseQ2Checks(base.approvedPlan.description().plan),
    scenarioIds: base.storyRevision
      .description()
      .scenarios.map((scenario) => scenario.id),
    q2Observations: base.q2Observations,
    productObservations: base.productObservations,
    riskDecisions: base.riskDecisions,
    evaluations: base.evaluations,
  });
  const ready = blockers.length === 0;
  const evidenceBundleSha256 = ready ? evidenceBundle(base) : null;
  await advanceRun(
    store,
    run,
    {
      stage: ready ? 'reviewing' : 'setup',
      evidenceBundleSha256,
    },
    timestamp,
  );
  if (ready) {
    await advanceIteration(
      store,
      run.iterationId,
      'showcase',
      'reviewing',
      timestamp,
    );
  }
}

function evidenceBundle(base: ShowcaseViewBase): string {
  return hashCanonicalJson({
    storyRevisionSha256: base.run.description().storyRevisionSha256,
    approvedTaskingPlanSha256: base.run.description().approvedTaskingPlanSha256,
    pairManifestSha256: base.run.description().pairManifestSha256,
    approvedCommitSha: base.run.description().approvedCommitSha,
    q2: base.q2Observations.map((value) => ({
      id: value.identity(),
      sha256: value.description().recordSha256,
    })),
    productObservations: base.productObservations.map((value) => ({
      id: value.identity(),
      sha256: value.description().contentSha256,
    })),
    riskDecisions: base.riskDecisions.map((value) => ({
      id: value.identity(),
      sha256: value.description().contentSha256,
    })),
    evaluations: base.evaluations.map((value) => ({
      id: value.identity(),
      sha256: value.description().contentSha256,
    })),
  } as JsonValue);
}

async function advanceRun(
  store: PrismaStore,
  run: ShowcaseRunRow,
  data: Prisma.ShowcaseRunUpdateManyMutationInput,
  timestamp: Date,
): Promise<void> {
  const advanced = await store.showcaseRun.updateMany({
    where: { id: run.id, version: run.version },
    data: { ...data, version: { increment: 1 }, updatedAt: timestamp },
  });
  if (advanced.count !== 1) {
    throw DomainError.conflict('Showcase changed; reload before continuing');
  }
}

async function advanceIteration(
  store: PrismaStore,
  iterationId: string,
  loop: string,
  stage: string,
  timestamp: Date,
  lifecycle = 'active',
): Promise<void> {
  const advanced = await store.iteration.updateMany({
    where: { id: iterationId },
    data: {
      loop,
      stage,
      lifecycle,
      lane: 'review',
      version: { increment: 1 },
      updatedAt: timestamp,
    },
  });
  if (advanced.count !== 1) {
    throw DomainError.conflict('Iteration changed during Showcase transition');
  }
}

async function actionResult(
  store: PrismaStore,
  workspaceId: string,
  iterationId: string,
  acceptedRecordId: string,
): Promise<ShowcaseActionResult> {
  const run = await latestShowcaseRun(store, workspaceId, iterationId);
  if (!run) throw DomainError.internal('Showcase action lost its Run');
  return {
    view: await loadShowcaseView(store, workspaceId, run),
    acceptedRecordId,
  };
}
