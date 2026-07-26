import type {
  AnswerClarificationResult,
  ScenarioDraft,
  ScenarioSetProposal,
  StoryClarification,
  UnderstandingDecision,
  UnderstandingDecisionResult,
  UnderstandingView,
} from '@evidence/server-domain';
import {
  link,
  type Link,
  workspaceIterationClarificationAnswerHref,
  workspaceIterationClarificationsHref,
  workspaceIterationHref,
  workspaceIterationKickoffHref,
  workspaceIterationNoModelImpactHref,
  workspaceIterationScenarioProposalsHref,
  workspaceIterationUnderstandingDecisionsHref,
  workspaceIterationUnderstandingHref,
  workspaceStoryHref,
  workspaceStoryRevisionHref,
} from '../links';
import { storyModel, storyRevisionModel } from './delivery-model';
import { iterationModel } from './iteration-workflow-model';

export interface ClarificationModel {
  id: string;
  reference: string;
  storyId: string;
  storyRevisionId: string;
  target: string;
  question: string;
  status: string;
  askedAt: string;
  answer: string | null;
  answeredByUserId: string | null;
  answeredAt: string | null;
  waivedReason: string | null;
  waivedByUserId: string | null;
  waivedAt: string | null;
  contentSha256: string;
}

export interface ScenarioDraftModel {
  id: string;
  reference: string;
  position: number;
  title: string;
  given: string[];
  when: string;
  then: string[];
  businessData: string[];
  contentSha256: string;
}

export interface ScenarioProposalModel {
  id: string;
  reference: string;
  storyId: string;
  storyRevisionId: string;
  sequence: number;
  drafts: ScenarioDraftModel[];
  proposedAt: string;
  contentSha256: string;
}

export interface UnderstandingDecisionModel {
  id: string;
  reference: string;
  proposalId: string | null;
  action: string;
  reason: string | null;
  selectedDraftIds: string[];
  confirmedScenarioIds: string[];
  decidedByUserId: string;
  decidedAt: string;
  contentSha256: string;
}

export function understandingModel(
  workspaceId: string,
  view: UnderstandingView,
) {
  const iterationId = view.iteration.identity();
  const description = view.iteration.description();
  const links: Record<string, Link> = {
    self: link(workspaceIterationUnderstandingHref(workspaceId, iterationId)),
    iteration: link(workspaceIterationHref(workspaceId, iterationId)),
    story: link(workspaceStoryHref(workspaceId, view.story.identity())),
  };
  if (
    description.lifecycle === 'active' &&
    description.loop === 'understand' &&
    description.stage === 'tqa'
  ) {
    if (view.pendingClarification) {
      links['answer-question'] = link(
        workspaceIterationClarificationAnswerHref(
          workspaceId,
          iterationId,
          view.pendingClarification.identity(),
        ),
      );
    } else {
      links['ask-question'] = link(
        workspaceIterationClarificationsHref(workspaceId, iterationId),
      );
      links['propose-scenarios'] = link(
        workspaceIterationScenarioProposalsHref(workspaceId, iterationId),
      );
    }
    links.decide = link(
      workspaceIterationUnderstandingDecisionsHref(workspaceId, iterationId),
    );
  }
  if (
    description.lifecycle === 'active' &&
    description.loop === 'understand' &&
    description.stage === 'scenario_review'
  ) {
    links.decide = link(
      workspaceIterationUnderstandingDecisionsHref(workspaceId, iterationId),
    );
  }
  if (
    description.lifecycle === 'active' &&
    description.loop === 'understand' &&
    description.stage === 'modeling'
  ) {
    links['record-no-model-impact'] = link(
      workspaceIterationNoModelImpactHref(workspaceId, iterationId),
    );
  }
  if (description.loop === 'kickoff') {
    links.kickoff = link(
      workspaceIterationKickoffHref(workspaceId, iterationId),
    );
  }
  return {
    _links: links,
    iteration: iterationModel(view.iteration),
    story: storyModel(view.story),
    storyRevision: storyRevisionModel(workspaceId, view.storyRevision),
    pendingClarification: view.pendingClarification
      ? clarificationModel(view.pendingClarification)
      : null,
    clarifications: view.clarifications.map(clarificationModel),
    currentScenarioProposal: view.currentScenarioProposal
      ? scenarioProposalModel(view.currentScenarioProposal)
      : null,
    decisions: view.decisions.map(understandingDecisionModel),
  };
}

export function clarificationModel(
  value: StoryClarification,
): ClarificationModel {
  const description = value.description();
  return {
    id: value.identity(),
    reference: description.reference,
    storyId: description.story.id(),
    storyRevisionId: description.storyRevision.id(),
    target: description.target,
    question: description.question,
    status: description.status,
    askedAt: description.askedAt,
    answer: description.answer,
    answeredByUserId: description.answeredBy?.id() ?? null,
    answeredAt: description.answeredAt,
    waivedReason: description.waivedReason,
    waivedByUserId: description.waivedBy?.id() ?? null,
    waivedAt: description.waivedAt,
    contentSha256: description.contentSha256,
  };
}

export function scenarioProposalModel(
  value: ScenarioSetProposal,
): ScenarioProposalModel {
  const description = value.description();
  return {
    id: value.identity(),
    reference: description.reference,
    storyId: description.story.id(),
    storyRevisionId: description.storyRevision.id(),
    sequence: description.sequence,
    drafts: description.drafts.map(scenarioDraftModel),
    proposedAt: description.proposedAt,
    contentSha256: description.contentSha256,
  };
}

function scenarioDraftModel(value: ScenarioDraft): ScenarioDraftModel {
  const description = value.description();
  return {
    id: value.identity(),
    reference: description.reference,
    position: description.position,
    title: description.title,
    given: description.given,
    when: description.when,
    then: description.then,
    businessData: description.businessData,
    contentSha256: description.contentSha256,
  };
}

export function understandingDecisionModel(
  value: UnderstandingDecision,
): UnderstandingDecisionModel {
  const description = value.description();
  return {
    id: value.identity(),
    reference: description.reference,
    proposalId: description.proposal?.id() ?? null,
    action: description.action,
    reason: description.reason,
    selectedDraftIds: description.selectedDrafts.map((draft) => draft.id()),
    confirmedScenarioIds: description.confirmedScenarios.map((scenario) =>
      scenario.id(),
    ),
    decidedByUserId: description.decidedBy.id(),
    decidedAt: description.decidedAt,
    contentSha256: description.contentSha256,
  };
}

export function clarificationAnswerResultModel(
  workspaceId: string,
  result: AnswerClarificationResult,
) {
  return {
    _links: {
      iteration: link(
        workspaceIterationHref(workspaceId, result.iteration.identity()),
      ),
      understanding: link(
        workspaceIterationUnderstandingHref(
          workspaceId,
          result.iteration.identity(),
        ),
      ),
    },
    iteration: iterationModel(result.iteration),
    clarification: clarificationModel(result.clarification),
  };
}

export function understandingDecisionResultModel(
  workspaceId: string,
  result: UnderstandingDecisionResult,
) {
  const links: Record<string, Link> = {
    iteration: link(
      workspaceIterationHref(workspaceId, result.iteration.identity()),
    ),
    understanding: link(
      workspaceIterationUnderstandingHref(
        workspaceId,
        result.iteration.identity(),
      ),
    ),
  };
  if (result.storyRevision) {
    const description = result.storyRevision.description();
    links['story-revision'] = link(
      workspaceStoryRevisionHref(
        workspaceId,
        description.story.id(),
        result.storyRevision.identity(),
      ),
    );
  }
  return {
    _links: links,
    iteration: iterationModel(result.iteration),
    decision: understandingDecisionModel(result.decision),
    storyRevision: result.storyRevision
      ? storyRevisionModel(workspaceId, result.storyRevision)
      : null,
  };
}
