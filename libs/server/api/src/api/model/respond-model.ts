import type {
  RespondActionResult,
  RespondCandidate,
  RespondDecision,
  RespondView,
} from '@evidence/server-domain';
import {
  link,
  type Link,
  workspaceIterationHref,
  workspaceIterationRespondActionHref,
  workspaceIterationRespondHref,
  workspaceIterationShowcaseHref,
  workspaceStoryHref,
  workspaceStoryRevisionHref,
} from '../links';
import { storyModel, storyRevisionModel } from './delivery-model';
import { iterationModel } from './iteration-workflow-model';
import { showcaseDecisionModel, showcaseRunModel } from './showcase-model';

export function respondViewModel(workspaceId: string, view: RespondView) {
  const iterationId = view.iteration.identity();
  const links: Record<string, Link> = {
    self: link(workspaceIterationRespondHref(workspaceId, iterationId)),
    iteration: link(workspaceIterationHref(workspaceId, iterationId)),
    showcase: link(workspaceIterationShowcaseHref(workspaceId, iterationId)),
    story: link(workspaceStoryHref(workspaceId, view.story.identity())),
    'story-revision': link(
      workspaceStoryRevisionHref(
        workspaceId,
        view.story.identity(),
        view.storyRevision.identity(),
      ),
    ),
  };
  if (view.nextAction?.kind === 'run_learner') {
    links['propose-candidate'] = link(
      workspaceIterationRespondActionHref(
        workspaceId,
        iterationId,
        'candidates',
      ),
    );
  }
  if (view.nextAction?.kind === 'await_human') {
    links.decide = link(
      workspaceIterationRespondActionHref(
        workspaceId,
        iterationId,
        'decisions',
      ),
    );
  }
  return {
    _links: links,
    iteration: iterationModel(view.iteration),
    story: storyModel(view.story),
    storyRevision: storyRevisionModel(workspaceId, view.storyRevision),
    showcaseRun: showcaseRunModel(view.showcaseRun),
    showcaseDecision: showcaseDecisionModel(view.showcaseDecision),
    authority: view.authority,
    candidates: view.candidates.map(respondCandidateModel),
    decisions: view.decisions.map(respondDecisionModel),
    nextAction: view.nextAction,
  };
}

export function respondActionResultModel(
  workspaceId: string,
  result: RespondActionResult,
) {
  return {
    _links: {
      self: link(
        workspaceIterationRespondHref(
          workspaceId,
          result.view.iteration.identity(),
        ),
      ),
    },
    respond: respondViewModel(workspaceId, result.view),
    acceptedRecordId: result.acceptedRecordId,
  };
}

function respondCandidateModel(value: RespondCandidate) {
  const {
    workspace,
    iteration,
    story,
    storyRevision,
    showcaseRun,
    showcaseDecision,
    ...description
  } = value.description();
  return {
    id: value.identity(),
    workspaceId: workspace.id(),
    iterationId: iteration.id(),
    storyId: story.id(),
    storyRevisionId: storyRevision.id(),
    showcaseRunId: showcaseRun.id(),
    showcaseDecisionId: showcaseDecision.id(),
    ...description,
  };
}

function respondDecisionModel(value: RespondDecision) {
  const { candidate, decidedBy, ...description } = value.description();
  return {
    id: value.identity(),
    candidateId: candidate.id(),
    decidedByUserId: decidedBy.id(),
    ...description,
  };
}
