import type {
  ApprovedTaskingPlan,
  DeskCheckDecision,
  DeskCheckDecisionResult,
  NoModelImpactDecision,
  TaskingCandidate,
  TaskingCandidateDescription,
  TaskingView,
} from '@evidence/server-domain';
import {
  link,
  type Link,
  workspaceIterationDeskCheckDecisionsHref,
  workspaceIterationHref,
  workspaceIterationNoModelImpactHref,
  workspaceIterationTaskingCandidatesHref,
  workspaceIterationTaskingHref,
  workspaceStoryHref,
  workspaceStoryRevisionHref,
} from '../links';
import { storyModel, storyRevisionModel } from './delivery-model';
import { iterationModel } from './iteration-workflow-model';

export function taskingModel(workspaceId: string, view: TaskingView) {
  const iterationId = view.iteration.identity();
  const iteration = view.iteration.description();
  const links: Record<string, Link> = {
    self: link(workspaceIterationTaskingHref(workspaceId, iterationId)),
    iteration: link(workspaceIterationHref(workspaceId, iterationId)),
    story: link(workspaceStoryHref(workspaceId, view.story.identity())),
    'story-revision': link(
      workspaceStoryRevisionHref(
        workspaceId,
        view.story.identity(),
        view.storyRevision.identity(),
      ),
    ),
  };
  if (
    iteration.lifecycle === 'active' &&
    iteration.loop === 'understand' &&
    iteration.stage === 'modeling' &&
    !view.noModelImpactDecision
  ) {
    links['record-no-model-impact'] = link(
      workspaceIterationNoModelImpactHref(workspaceId, iterationId),
    );
  }
  if (
    iteration.lifecycle === 'active' &&
    iteration.loop === 'tasking' &&
    ['drafting', 'knowledge_gap'].includes(iteration.stage) &&
    view.noModelImpactDecision
  ) {
    links['propose-candidate'] = link(
      workspaceIterationTaskingCandidatesHref(workspaceId, iterationId),
    );
  }
  if (
    iteration.lifecycle === 'active' &&
    iteration.loop === 'tasking' &&
    iteration.stage === 'desk_check' &&
    view.currentCandidate
  ) {
    links.decide = link(
      workspaceIterationDeskCheckDecisionsHref(workspaceId, iterationId),
    );
  }
  return {
    _links: links,
    iteration: iterationModel(view.iteration),
    story: storyModel(view.story),
    storyRevision: storyRevisionModel(workspaceId, view.storyRevision),
    noModelImpactDecision: view.noModelImpactDecision
      ? noModelImpactDecisionModel(workspaceId, view.noModelImpactDecision)
      : null,
    currentCandidate: view.currentCandidate
      ? taskingCandidateModel(workspaceId, view.currentCandidate)
      : null,
    decisions: view.decisions.map((decision) =>
      deskCheckDecisionModel(workspaceId, decision),
    ),
    approvedPlan: view.approvedPlan
      ? approvedTaskingPlanModel(workspaceId, view.approvedPlan)
      : null,
    processCatalog: view.processCatalog,
  };
}

export function noModelImpactDecisionModel(
  workspaceId: string,
  value: NoModelImpactDecision,
) {
  const description = value.description();
  const iterationId = description.iteration.id();
  return {
    _links: {
      self: link(
        `${workspaceIterationNoModelImpactHref(workspaceId, iterationId)}/${value.identity()}`,
      ),
      tasking: link(workspaceIterationTaskingHref(workspaceId, iterationId)),
      iteration: link(workspaceIterationHref(workspaceId, iterationId)),
      story: link(workspaceStoryHref(workspaceId, description.story.id())),
      'story-revision': link(
        workspaceStoryRevisionHref(
          workspaceId,
          description.story.id(),
          description.storyRevision.id(),
        ),
      ),
    },
    id: value.identity(),
    reference: description.reference,
    storyId: description.story.id(),
    storyRevisionId: description.storyRevision.id(),
    storyRevisionSha256: description.storyRevisionSha256,
    subject: description.subject,
    method: description.method,
    modelChangeRequired: description.modelChangeRequired,
    reason: description.reason,
    decidedByUserId: description.decidedBy.id(),
    decidedAt: description.decidedAt,
    contentSha256: description.contentSha256,
  };
}

export function taskingCandidateModel(
  workspaceId: string,
  value: TaskingCandidate,
) {
  const description = value.description();
  const iterationId = description.iteration.id();
  return {
    _links: {
      self: link(
        `${workspaceIterationTaskingCandidatesHref(workspaceId, iterationId)}/${value.identity()}`,
      ),
      tasking: link(workspaceIterationTaskingHref(workspaceId, iterationId)),
      iteration: link(workspaceIterationHref(workspaceId, iterationId)),
      decide: link(
        workspaceIterationDeskCheckDecisionsHref(workspaceId, iterationId),
      ),
    },
    id: value.identity(),
    ...taskingSnapshotModel(description),
  };
}

export function deskCheckDecisionModel(
  workspaceId: string,
  value: DeskCheckDecision,
) {
  const description = value.description();
  const iterationId = description.iteration.id();
  return {
    _links: {
      self: link(
        `${workspaceIterationDeskCheckDecisionsHref(workspaceId, iterationId)}/${value.identity()}`,
      ),
      tasking: link(workspaceIterationTaskingHref(workspaceId, iterationId)),
      iteration: link(workspaceIterationHref(workspaceId, iterationId)),
    },
    id: value.identity(),
    reference: description.reference,
    candidateId: description.candidate.id(),
    candidateSha256: description.candidateSha256,
    action: description.action,
    reason: description.reason,
    decidedByUserId: description.decidedBy.id(),
    decidedAt: description.decidedAt,
    contentSha256: description.contentSha256,
  };
}

export function approvedTaskingPlanModel(
  workspaceId: string,
  value: ApprovedTaskingPlan,
) {
  const description = value.description();
  const iterationId = description.iteration.id();
  return {
    _links: {
      self: link(
        `${workspaceIterationTaskingHref(workspaceId, iterationId)}/approved-plan`,
      ),
      tasking: link(workspaceIterationTaskingHref(workspaceId, iterationId)),
      iteration: link(workspaceIterationHref(workspaceId, iterationId)),
      story: link(workspaceStoryHref(workspaceId, description.story.id())),
      'story-revision': link(
        workspaceStoryRevisionHref(
          workspaceId,
          description.story.id(),
          description.storyRevision.id(),
        ),
      ),
    },
    id: value.identity(),
    storyId: description.story.id(),
    storyRevisionId: description.storyRevision.id(),
    taskingCandidateId: description.taskingCandidate.id(),
    deskCheckDecisionId: description.deskCheckDecision.id(),
    plan: taskingSnapshotModel(description.plan),
    contentSha256: description.contentSha256,
    approvedByUserId: description.approvedBy.id(),
    approvedAt: description.approvedAt,
  };
}

export function deskCheckDecisionResultModel(
  workspaceId: string,
  result: DeskCheckDecisionResult,
) {
  const iterationId = result.iteration.identity();
  return {
    _links: {
      self: link(
        `${workspaceIterationDeskCheckDecisionsHref(workspaceId, iterationId)}/${result.decision.identity()}`,
      ),
      tasking: link(workspaceIterationTaskingHref(workspaceId, iterationId)),
      iteration: link(workspaceIterationHref(workspaceId, iterationId)),
    },
    iteration: iterationModel(result.iteration),
    decision: deskCheckDecisionModel(workspaceId, result.decision),
    approvedPlan: result.approvedPlan
      ? approvedTaskingPlanModel(workspaceId, result.approvedPlan)
      : null,
  };
}

function taskingSnapshotModel(description: TaskingCandidateDescription) {
  return {
    planVersion: description.planVersion,
    reference: description.reference,
    storyId: description.story.id(),
    storyRevisionId: description.storyRevision.id(),
    storyRevisionSha256: description.storyRevisionSha256,
    baseCommitSha: description.baseCommitSha,
    noModelImpactDecisionId: description.noModelImpactDecision.id(),
    noModelImpactDecisionSha256: description.noModelImpactDecisionSha256,
    sequence: description.sequence,
    projectCatalog: description.projectCatalog,
    projectCatalogSha256: description.projectCatalogSha256,
    tests: description.tests,
    tasks: description.tasks,
    processes: description.processes,
    executionBudget: description.executionBudget,
    contentSha256: description.contentSha256,
    proposedBy: description.proposedBy,
    proposedAt: description.proposedAt,
  };
}
