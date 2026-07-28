import type {
  ShowcaseActionResult,
  ShowcaseDecision,
  ShowcaseEvaluation,
  ShowcaseProductObservation,
  ShowcaseQ2Observation,
  ShowcaseReview,
  ShowcaseRiskDecision,
  ShowcaseRun,
  ShowcaseView,
} from '@evidence/server-domain';
import {
  link,
  type Link,
  workspaceIterationHref,
  workspaceIterationPairHref,
  workspaceIterationShowcaseActionHref,
  workspaceIterationShowcaseHref,
  workspaceIterationTaskingHref,
  workspaceStoryHref,
  workspaceStoryRevisionHref,
} from '../links';
import { storyModel, storyRevisionModel } from './delivery-model';
import { iterationModel } from './iteration-workflow-model';
import { pairManifestModel, pairRunModel } from './pair-model';
import { approvedTaskingPlanModel } from './tasking-model';

export function showcaseViewModel(workspaceId: string, view: ShowcaseView) {
  const iterationId = view.iteration.identity();
  const links: Record<string, Link> = {
    self: link(workspaceIterationShowcaseHref(workspaceId, iterationId)),
    iteration: link(workspaceIterationHref(workspaceId, iterationId)),
    pair: link(workspaceIterationPairHref(workspaceId, iterationId)),
    tasking: link(workspaceIterationTaskingHref(workspaceId, iterationId)),
    story: link(workspaceStoryHref(workspaceId, view.story.identity())),
    'story-revision': link(
      workspaceStoryRevisionHref(
        workspaceId,
        view.story.identity(),
        view.storyRevision.identity(),
      ),
    ),
  };
  switch (view.nextAction?.kind) {
    case 'execute_q2':
      links['record-q2-observation'] = actionLink(
        workspaceId,
        iterationId,
        'q2-observations',
      );
      break;
    case 'observe_scenario':
      links['record-product-observation'] = actionLink(
        workspaceId,
        iterationId,
        'product-observations',
      );
      break;
    case 'decide_risk':
      links['record-risk-decision'] = actionLink(
        workspaceId,
        iterationId,
        'risk-decisions',
      );
      break;
    case 'evaluate_risk':
      links['record-evaluation'] = actionLink(
        workspaceId,
        iterationId,
        'evaluations',
      );
      break;
    case 'run_reviewer':
      links['record-review'] = actionLink(workspaceId, iterationId, 'reviews');
      break;
    case 'await_human':
    case 'resolve_failure':
      links.decide = actionLink(workspaceId, iterationId, 'decisions');
      break;
  }
  return {
    _links: links,
    iteration: iterationModel(view.iteration),
    story: storyModel(view.story),
    storyRevision: storyRevisionModel(workspaceId, view.storyRevision),
    approvedPlan: approvedTaskingPlanModel(workspaceId, view.approvedPlan),
    pairRun: pairRunModel(view.pairRun),
    pairManifest: pairManifestModel(view.pairManifest),
    run: showcaseRunModel(view.run),
    q2Observations: view.q2Observations.map(showcaseQ2ObservationModel),
    productObservations: view.productObservations.map(
      showcaseProductObservationModel,
    ),
    riskDecisions: view.riskDecisions.map(showcaseRiskDecisionModel),
    evaluations: view.evaluations.map(showcaseEvaluationModel),
    review: view.review ? showcaseReviewModel(view.review) : null,
    decision: view.decision ? showcaseDecisionModel(view.decision) : null,
    nextAction: view.nextAction,
  };
}

export function showcaseActionResultModel(
  workspaceId: string,
  result: ShowcaseActionResult,
) {
  return {
    _links: {
      self: link(
        workspaceIterationShowcaseHref(
          workspaceId,
          result.view.iteration.identity(),
        ),
      ),
    },
    showcase: showcaseViewModel(workspaceId, result.view),
    acceptedRecordId: result.acceptedRecordId,
  };
}

function showcaseRunModel(value: ShowcaseRun) {
  const description = value.description();
  return {
    id: value.identity(),
    reference: description.reference,
    attempt: description.attempt,
    workspaceId: description.workspace.id(),
    iterationId: description.iteration.id(),
    storyId: description.story.id(),
    storyRevisionId: description.storyRevision.id(),
    storyRevisionSha256: description.storyRevisionSha256,
    approvedTaskingPlanId: description.approvedTaskingPlan.id(),
    approvedTaskingPlanSha256: description.approvedTaskingPlanSha256,
    pairRunId: description.pairRun.id(),
    pairManifestId: description.pairManifest.id(),
    pairManifestSha256: description.pairManifestSha256,
    approvedCommitSha: description.approvedCommitSha,
    stage: description.stage,
    version: description.version,
    evidenceBundleSha256: description.evidenceBundleSha256,
    startedAt: description.startedAt,
    updatedAt: description.updatedAt,
    completedAt: description.completedAt,
  };
}

function showcaseQ2ObservationModel(value: ShowcaseQ2Observation) {
  const { showcaseRun, ...description } = value.description();
  return {
    id: value.identity(),
    showcaseRunId: showcaseRun.id(),
    ...description,
  };
}

function showcaseProductObservationModel(value: ShowcaseProductObservation) {
  const { showcaseRun, observedBy, ...description } = value.description();
  return {
    id: value.identity(),
    showcaseRunId: showcaseRun.id(),
    observedByUserId: observedBy.id(),
    ...description,
  };
}

function showcaseRiskDecisionModel(value: ShowcaseRiskDecision) {
  const { showcaseRun, decidedBy, ...description } = value.description();
  return {
    id: value.identity(),
    showcaseRunId: showcaseRun.id(),
    decidedByUserId: decidedBy.id(),
    ...description,
  };
}

function showcaseEvaluationModel(value: ShowcaseEvaluation) {
  const { showcaseRun, observedBy, ...description } = value.description();
  return {
    id: value.identity(),
    showcaseRunId: showcaseRun.id(),
    observedByUserId: observedBy.id(),
    ...description,
  };
}

function showcaseReviewModel(value: ShowcaseReview) {
  const { showcaseRun, ...description } = value.description();
  return {
    id: value.identity(),
    showcaseRunId: showcaseRun.id(),
    ...description,
  };
}

function showcaseDecisionModel(value: ShowcaseDecision) {
  const { showcaseRun, review, decidedBy, ...description } =
    value.description();
  return {
    id: value.identity(),
    showcaseRunId: showcaseRun.id(),
    reviewId: review?.id() ?? null,
    decidedByUserId: decidedBy.id(),
    ...description,
  };
}

function actionLink(
  workspaceId: string,
  iterationId: string,
  resource:
    | 'q2-observations'
    | 'product-observations'
    | 'risk-decisions'
    | 'evaluations'
    | 'reviews'
    | 'decisions',
) {
  return link(
    workspaceIterationShowcaseActionHref(workspaceId, iterationId, resource),
  );
}
