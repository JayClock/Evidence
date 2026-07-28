import type {
  ClaimPairLeaseResult,
  PairActionResult,
  PairAutomationException,
  PairCodingDecision,
  PairCommandObservation,
  PairDriverAttempt,
  PairExecutionManifest,
  PairRedReview,
  PairRun,
  PairView,
  StartPairResult,
} from '@evidence/server-domain';
import {
  link,
  type Link,
  workspaceIterationHref,
  workspaceIterationPairActionHref,
  workspaceIterationPairHref,
  workspaceIterationPairLeaseHref,
  workspaceIterationPairRunsHref,
  workspaceIterationShowcaseHref,
  workspaceIterationTaskingHref,
  workspaceStoryHref,
  workspaceStoryRevisionHref,
} from '../links';
import { storyModel, storyRevisionModel } from './delivery-model';
import { iterationModel } from './iteration-workflow-model';
import { approvedTaskingPlanModel } from './tasking-model';

export function pairViewModel(workspaceId: string, view: PairView) {
  const iterationId = view.iteration.identity();
  const links: Record<string, Link> = {
    self: link(workspaceIterationPairHref(workspaceId, iterationId)),
    iteration: link(workspaceIterationHref(workspaceId, iterationId)),
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
  const run = view.run.description();
  if (run.status === 'running') {
    if (
      !run.leaseExpiresAt ||
      new Date(run.leaseExpiresAt).getTime() <= Date.now()
    ) {
      links['claim-lease'] = link(
        workspaceIterationPairLeaseHref(workspaceId, iterationId, 'claim'),
      );
    } else {
      links['heartbeat-lease'] = link(
        workspaceIterationPairLeaseHref(workspaceId, iterationId, 'heartbeat'),
      );
    }
    if (view.nextAction?.kind === 'run_driver') {
      links['record-driver-attempt'] = link(
        workspaceIterationPairActionHref(
          workspaceId,
          iterationId,
          'driver-attempts',
        ),
      );
    }
    if (view.nextAction?.kind === 'execute_command') {
      links['record-command-observation'] = link(
        workspaceIterationPairActionHref(
          workspaceId,
          iterationId,
          'command-observations',
        ),
      );
    }
    if (view.nextAction?.kind === 'review_red') {
      links['record-red-review'] = link(
        workspaceIterationPairActionHref(
          workspaceId,
          iterationId,
          'red-reviews',
        ),
      );
    }
    links['record-exception'] = link(
      workspaceIterationPairActionHref(workspaceId, iterationId, 'exceptions'),
    );
  }
  if (run.status === 'exception' || run.status === 'approval_required') {
    links.decide = link(
      workspaceIterationPairActionHref(workspaceId, iterationId, 'decisions'),
    );
  }
  if (run.status === 'approved') {
    links.showcase = link(
      workspaceIterationShowcaseHref(workspaceId, iterationId),
    );
  }
  return {
    _links: links,
    iteration: iterationModel(view.iteration),
    story: storyModel(view.story),
    storyRevision: storyRevisionModel(workspaceId, view.storyRevision),
    approvedPlan: approvedTaskingPlanModel(workspaceId, view.approvedPlan),
    run: pairRunModel(view.run),
    driverAttempts: view.driverAttempts.map(pairDriverAttemptModel),
    commandObservations: view.commandObservations.map(
      pairCommandObservationModel,
    ),
    redReviews: view.redReviews.map(pairRedReviewModel),
    currentException: view.currentException
      ? pairExceptionModel(view.currentException)
      : null,
    manifest: view.manifest ? pairManifestModel(view.manifest) : null,
    decisions: view.decisions.map(pairDecisionModel),
    nextAction: view.nextAction,
  };
}

export function startPairResultModel(
  workspaceId: string,
  result: StartPairResult,
) {
  return {
    _links: {
      self: link(
        workspaceIterationPairHref(
          workspaceId,
          result.view.iteration.identity(),
        ),
      ),
    },
    pair: pairViewModel(workspaceId, result.view),
    leaseToken: result.leaseToken,
  };
}

export function pairRunResourceModel(value: PairRun) {
  return pairRunModel(value);
}

export function claimPairLeaseResultModel(result: ClaimPairLeaseResult) {
  return {
    run: pairRunModel(result.run),
    leaseToken: result.leaseToken,
  };
}

export function pairActionResultModel(
  workspaceId: string,
  result: PairActionResult,
) {
  return {
    _links: {
      self: link(
        workspaceIterationPairHref(
          workspaceId,
          result.view.iteration.identity(),
        ),
      ),
    },
    pair: pairViewModel(workspaceId, result.view),
    acceptedRecordId: result.acceptedRecordId,
  };
}

export function pairEntryLinks(workspaceId: string, iterationId: string) {
  return {
    pair: link(workspaceIterationPairHref(workspaceId, iterationId)),
    'start-pair': link(
      workspaceIterationPairRunsHref(workspaceId, iterationId),
    ),
  };
}

export function pairRunModel(value: PairRun) {
  const description = value.description();
  return {
    id: value.identity(),
    reference: description.reference,
    workspaceId: description.workspace.id(),
    iterationId: description.iteration.id(),
    storyId: description.story.id(),
    storyRevisionId: description.storyRevision.id(),
    storyRevisionSha256: description.storyRevisionSha256,
    approvedTaskingPlanId: description.approvedTaskingPlan.id(),
    approvedTaskingPlanSha256: description.approvedTaskingPlanSha256,
    baseCommitSha: description.baseCommitSha,
    branchName: description.branchName,
    status: description.status,
    checkpoint: description.checkpoint,
    version: description.version,
    cursor: description.cursor,
    completedTestIds: description.completedTestIds,
    completedStepKeys: description.completedStepKeys,
    executionBudget: description.executionBudget,
    budgetUsage: description.budgetUsage,
    leaseOwnerId: description.leaseOwnerId,
    leaseExpiresAt: description.leaseExpiresAt,
    currentDiffSha256: description.currentDiffSha256,
    finalManifestSha256: description.finalManifestSha256,
    approvedCommitSha: description.approvedCommitSha,
    startedAt: description.startedAt,
    updatedAt: description.updatedAt,
    completedAt: description.completedAt,
  };
}

function pairDriverAttemptModel(value: PairDriverAttempt) {
  const { pairRun, ...description } = value.description();
  return {
    id: value.identity(),
    pairRunId: pairRun.id(),
    ...description,
  };
}

function pairCommandObservationModel(value: PairCommandObservation) {
  const { pairRun, ...description } = value.description();
  return {
    id: value.identity(),
    pairRunId: pairRun.id(),
    ...description,
  };
}

function pairRedReviewModel(value: PairRedReview) {
  const { pairRun, observation, ...description } = value.description();
  return {
    id: value.identity(),
    pairRunId: pairRun.id(),
    observationId: observation.id(),
    ...description,
  };
}

function pairExceptionModel(value: PairAutomationException) {
  const { pairRun, ...description } = value.description();
  return {
    id: value.identity(),
    pairRunId: pairRun.id(),
    ...description,
  };
}

export function pairManifestModel(value: PairExecutionManifest) {
  const { pairRun, ...description } = value.description();
  return {
    id: value.identity(),
    pairRunId: pairRun.id(),
    ...description,
  };
}

function pairDecisionModel(value: PairCodingDecision) {
  const { pairRun, decidedBy, ...description } = value.description();
  return {
    id: value.identity(),
    pairRunId: pairRun.id(),
    decidedByUserId: decidedBy.id(),
    ...description,
  };
}
