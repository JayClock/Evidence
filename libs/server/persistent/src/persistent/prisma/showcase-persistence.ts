import {
  DomainError,
  Ref,
  ShowcaseDecision,
  ShowcaseEvaluation,
  ShowcaseProductObservation,
  ShowcaseQ2Observation,
  ShowcaseReview,
  ShowcaseRiskDecision,
  ShowcaseRun,
  materializeShowcaseQ2Checks,
  type JsonValue,
  type ShowcaseDecisionDescription,
  type ShowcaseEvaluationDescription,
  type ShowcaseNextAction,
  type ShowcaseProductObservationDescription,
  type ShowcaseQ2ObservationDescription,
  type ShowcaseReviewDescription,
  type ShowcaseRiskActivity,
  type ShowcaseRiskDecisionDescription,
  type ShowcaseRunDescription,
  type ShowcaseStage,
  type ShowcaseView,
} from '@evidence/server-domain';
import { Prisma } from '@prisma/client';
import { hashCanonicalJson } from '../workflow-content';

export type ShowcaseRunRow = Prisma.ShowcaseRunGetPayload<
  Record<string, never>
>;
export type ShowcaseQ2ObservationRow = Prisma.ShowcaseQ2ObservationGetPayload<
  Record<string, never>
>;
export type ShowcaseProductObservationRow =
  Prisma.ShowcaseProductObservationGetPayload<Record<string, never>>;
export type ShowcaseRiskDecisionRow = Prisma.ShowcaseRiskDecisionGetPayload<
  Record<string, never>
>;
export type ShowcaseEvaluationRow = Prisma.ShowcaseEvaluationGetPayload<
  Record<string, never>
>;
export type ShowcaseReviewRow = Prisma.ShowcaseReviewGetPayload<
  Record<string, never>
>;
export type ShowcaseDecisionRow = Prisma.ShowcaseDecisionGetPayload<
  Record<string, never>
>;

export type ShowcaseViewBase = Omit<ShowcaseView, 'nextAction'>;

export function assembleShowcaseRun(row: ShowcaseRunRow): ShowcaseRun {
  return new ShowcaseRun(row.id, {
    reference: row.reference,
    attempt: row.attempt,
    workspace: new Ref(row.workspaceId),
    iteration: new Ref(row.iterationId),
    story: new Ref(row.storyId),
    storyRevision: new Ref(row.storyRevisionId),
    storyRevisionSha256: row.storyRevisionSha256,
    approvedTaskingPlan: new Ref(row.approvedTaskingPlanId),
    approvedTaskingPlanSha256: row.approvedTaskingPlanSha256,
    pairRun: new Ref(row.pairRunId),
    pairManifest: new Ref(row.pairManifestId),
    pairManifestSha256: row.pairManifestSha256,
    approvedCommitSha: row.approvedCommitSha,
    stage: row.stage as ShowcaseStage,
    version: row.version,
    evidenceBundleSha256: row.evidenceBundleSha256,
    startedAt: row.startedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  } satisfies ShowcaseRunDescription);
}

export function assembleShowcaseQ2Observation(
  row: ShowcaseQ2ObservationRow,
): ShowcaseQ2Observation {
  return new ShowcaseQ2Observation(row.id, {
    showcaseRun: new Ref(row.showcaseRunId),
    actionId: row.actionId,
    sequence: row.sequence,
    testId: row.testId,
    scenarioIds: jsonStrings(row.scenarioIds, row.id, 'Scenario ids'),
    processId: row.processId,
    stepId: row.stepId,
    projectId: row.projectId,
    command: row.command,
    termination:
      row.termination as ShowcaseQ2ObservationDescription['termination'],
    exitCode: row.exitCode,
    signal: row.signal,
    durationMs: row.durationMs,
    stdoutSha256: row.stdoutSha256,
    stdoutBytes: row.stdoutBytes,
    stdoutLines: row.stdoutLines,
    stderrSha256: row.stderrSha256,
    stderrBytes: row.stderrBytes,
    stderrLines: row.stderrLines,
    approvedCommitSha: row.approvedCommitSha,
    worktreeSha256: row.worktreeSha256,
    observedAt: row.observedAt.toISOString(),
    previousRecordSha256: row.previousRecordSha256,
    recordSha256: row.recordSha256,
  } satisfies ShowcaseQ2ObservationDescription);
}

export function assembleShowcaseProductObservation(
  row: ShowcaseProductObservationRow,
): ShowcaseProductObservation {
  return new ShowcaseProductObservation(row.id, {
    showcaseRun: new Ref(row.showcaseRunId),
    scenarioId: row.scenarioId,
    scenarioReference: row.scenarioReference,
    givenSteps: jsonStrings(row.givenSteps, row.id, 'Given steps'),
    whenStep: row.whenStep,
    expectedThenSteps: jsonStrings(
      row.expectedThenSteps,
      row.id,
      'expected Then steps',
    ),
    businessData: jsonStrings(row.businessData, row.id, 'business data'),
    observedOutcomes: jsonStrings(
      row.observedOutcomes,
      row.id,
      'observed outcomes',
    ),
    observation: row.observation,
    valueFeedback: row.valueFeedback,
    evidenceRefs: jsonStrings(row.evidenceRefs, row.id, 'evidence refs'),
    observedBy: new Ref(row.observedByUserId),
    observedAt: row.observedAt.toISOString(),
    contentSha256: row.contentSha256,
  } satisfies ShowcaseProductObservationDescription);
}

export function assembleShowcaseRiskDecision(
  row: ShowcaseRiskDecisionRow,
): ShowcaseRiskDecision {
  return new ShowcaseRiskDecision(row.id, {
    showcaseRun: new Ref(row.showcaseRunId),
    quadrant: row.quadrant as ShowcaseRiskDecisionDescription['quadrant'],
    disposition:
      row.disposition as ShowcaseRiskDecisionDescription['disposition'],
    activities: jsonStrings(
      row.activities,
      row.id,
      'risk activities',
    ) as ShowcaseRiskActivity[],
    reason: row.reason,
    decidedBy: new Ref(row.decidedByUserId),
    decidedAt: row.decidedAt.toISOString(),
    contentSha256: row.contentSha256,
  } satisfies ShowcaseRiskDecisionDescription);
}

export function assembleShowcaseEvaluation(
  row: ShowcaseEvaluationRow,
): ShowcaseEvaluation {
  return new ShowcaseEvaluation(row.id, {
    showcaseRun: new Ref(row.showcaseRunId),
    sequence: row.sequence,
    quadrant: row.quadrant as ShowcaseEvaluationDescription['quadrant'],
    activity: row.activity as ShowcaseEvaluationDescription['activity'],
    outcome: row.outcome as ShowcaseEvaluationDescription['outcome'],
    finding: row.finding,
    evidenceRefs: jsonStrings(row.evidenceRefs, row.id, 'evidence refs'),
    observedBy: new Ref(row.observedByUserId),
    observedAt: row.observedAt.toISOString(),
    contentSha256: row.contentSha256,
  } satisfies ShowcaseEvaluationDescription);
}

export function assembleShowcaseReview(row: ShowcaseReviewRow): ShowcaseReview {
  return new ShowcaseReview(row.id, {
    showcaseRun: new Ref(row.showcaseRunId),
    evidenceBundleSha256: row.evidenceBundleSha256,
    observedFacts: jsonStrings(row.observedFacts, row.id, 'observed facts'),
    productDomainFeedback: jsonStrings(
      row.productDomainFeedback,
      row.id,
      'product/domain feedback',
    ),
    technicalQualityFeedback: jsonStrings(
      row.technicalQualityFeedback,
      row.id,
      'technical quality feedback',
    ),
    unresolvedAssumptions: jsonStrings(
      row.unresolvedAssumptions,
      row.id,
      'unresolved assumptions',
    ),
    recommendation:
      row.recommendation as ShowcaseReviewDescription['recommendation'],
    reviewedAt: row.reviewedAt.toISOString(),
    contentSha256: row.contentSha256,
  } satisfies ShowcaseReviewDescription);
}

export function assembleShowcaseDecision(
  row: ShowcaseDecisionRow,
): ShowcaseDecision {
  return new ShowcaseDecision(row.id, {
    showcaseRun: new Ref(row.showcaseRunId),
    action: row.action as ShowcaseDecisionDescription['action'],
    reason: row.reason,
    feedbackTarget:
      row.feedbackTarget as ShowcaseDecisionDescription['feedbackTarget'],
    evidenceBundleSha256: row.evidenceBundleSha256,
    review: row.reviewId ? new Ref(row.reviewId) : null,
    decidedBy: new Ref(row.decidedByUserId),
    decidedAt: row.decidedAt.toISOString(),
    contentSha256: row.contentSha256,
  } satisfies ShowcaseDecisionDescription);
}

export function showcaseNextAction(
  base: ShowcaseViewBase,
): ShowcaseNextAction | null {
  const run = base.run.description();
  if (
    run.stage === 'accepted' ||
    run.stage === 'revised' ||
    run.stage === 'rejected'
  ) {
    return null;
  }
  if (run.stage === 'reviewing') {
    if (!run.evidenceBundleSha256) {
      throw DomainError.internal(
        `Showcase Run ${base.run.identity()} lost its evidence bundle`,
      );
    }
    return action(run.version, {
      kind: 'run_reviewer',
      evidenceBundleSha256: run.evidenceBundleSha256,
    });
  }
  if (run.stage === 'decision') {
    if (!base.review) {
      throw DomainError.internal(
        `Showcase Run ${base.run.identity()} lost its independent Review`,
      );
    }
    return action(run.version, {
      kind: 'await_human',
      reviewId: base.review.identity(),
      reviewSha256: base.review.description().contentSha256,
    });
  }

  const checks = materializeShowcaseQ2Checks(
    base.approvedPlan.description().plan,
  );
  for (const check of checks) {
    const observation = base.q2Observations.find(
      (candidate) => candidate.description().testId === check.testId,
    );
    if (!observation) {
      return action(run.version, {
        kind: 'execute_q2',
        ...check,
        timeoutMs:
          base.approvedPlan.description().plan.executionBudget.commandTimeoutMs,
        approvedCommitSha: run.approvedCommitSha,
      });
    }
    const result = observation.description();
    if (result.termination !== 'exited' || result.exitCode !== 0) {
      return action(run.version, {
        kind: 'resolve_failure',
        observationId: observation.identity(),
        allowedActions: ['revise', 'reject'],
      });
    }
  }

  for (const scenario of base.storyRevision.description().scenarios) {
    if (
      !base.productObservations.some(
        (candidate) => candidate.description().scenarioId === scenario.id,
      )
    ) {
      return action(run.version, {
        kind: 'observe_scenario',
        scenarioId: scenario.id,
        scenarioReference: scenario.reference,
      });
    }
  }

  for (const quadrant of ['Q3', 'Q4'] as const) {
    const risk = base.riskDecisions.find(
      (candidate) => candidate.description().quadrant === quadrant,
    );
    if (!risk) {
      return action(run.version, { kind: 'decide_risk', quadrant });
    }
    for (const activity of risk.description().activities) {
      const latest = base.evaluations
        .filter((candidate) => {
          const description = candidate.description();
          return (
            description.quadrant === quadrant &&
            description.activity === activity
          );
        })
        .sort(
          (left, right) =>
            right.description().sequence - left.description().sequence,
        )[0];
      if (!latest || latest.description().outcome === 'concern') {
        return action(run.version, {
          kind: 'evaluate_risk',
          quadrant,
          activity,
        });
      }
    }
  }

  throw DomainError.internal(
    `Showcase Run ${base.run.identity()} is ready but was not advanced to Review`,
  );
}

function action<
  T extends Omit<ShowcaseNextAction, 'actionId' | 'expectedShowcaseVersion'>,
>(version: number, value: T): ShowcaseNextAction {
  const authority = { expectedShowcaseVersion: version, ...value };
  const digest = hashCanonicalJson(authority as unknown as JsonValue);
  return {
    actionId: `ACT-${digest.slice('sha256:'.length, 'sha256:'.length + 24)}`,
    ...authority,
  } as unknown as ShowcaseNextAction;
}

function jsonStrings(
  value: Prisma.JsonValue,
  id: string,
  label: string,
): string[] {
  if (
    !Array.isArray(value) ||
    value.some((candidate) => typeof candidate !== 'string')
  ) {
    throw DomainError.internal(`Showcase record ${id} has invalid ${label}`);
  }
  return value as string[];
}
