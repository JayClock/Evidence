import type {
  Iteration,
  IterationIntake,
  KickoffDecision,
  KickoffDecisionResult,
  KickoffProposal,
  KickoffView,
  ProblemStatement,
  StoryCard,
} from '@evidence/server-domain';
import {
  link,
  type Link,
  workspaceHref,
  workspaceInboxItemHref,
  workspaceInboxRevisionHref,
  workspaceIterationHref,
  workspaceIterationIntakeHref,
  workspaceIterationKickoffDecisionsHref,
  workspaceIterationKickoffHref,
  workspaceIterationKickoffProposalsHref,
  workspaceIterationProvisioningHref,
  workspaceIterationsHref,
  workspaceStoryCandidateHref,
  workspaceStoryHref,
} from '../links';

export interface IterationModel {
  _links: Record<string, Link>;
  id: string;
  reference: string;
  sourceCandidateId: string;
  sourceCandidateSha256: string;
  lifecycle: string;
  loop: string;
  stage: string;
  lane: string;
  version: number;
  baseCommitSha: string;
  branchName: string | null;
  provisioningFailureSummary: string | null;
  activeStoryId: string | null;
  admittedByUserId: string;
  admittedAt: string;
  updatedAt: string;
}

export interface FrozenCitationModel {
  inboxItemId: string;
  inboxRevisionId: string;
  revisionNumber: number;
  revisionSha256: string;
  locator: string;
  _links: Record<string, Link>;
}

export interface IterationIntakeModel {
  _links: Record<string, Link>;
  iterationId: string;
  candidate: {
    candidateId: string;
    candidateReference: string;
    extractionId: string;
    title: string;
    problem: string;
    role: string;
    goal: string;
    value: string;
    cognitiveMode: string;
    citations: FrozenCitationModel[];
    contentSha256: string;
    proposedAt: string;
  };
  sources: Array<{
    inboxItemId: string;
    inboxRevisionId: string;
    revisionNumber: number;
    sourceKind: string;
    externalKey: string;
    itemStatus: string;
    title: string;
    body: string;
    contentType: string;
    uri: string | null;
    providerMetadata: ReturnType<
      IterationIntake['description']
    >['sources'][number]['providerMetadata'];
    sourceUpdatedAt: string | null;
    capturedAt: string;
    contentSha256: string;
  }>;
  requirementsProjection: string;
  contentSha256: string;
  frozenAt: string;
}

export interface KickoffProposalModel {
  _links: Record<string, Link>;
  id: string;
  reference: string;
  sequence: number;
  origin: string;
  title: string;
  problem: string;
  role: string;
  goal: string;
  value: string;
  cognitiveMode: string;
  citations: FrozenCitationModel[];
  contentSha256: string;
  proposedAt: string;
}

export interface KickoffDecisionModel {
  _links: Record<string, Link>;
  id: string;
  reference: string;
  proposalId: string;
  proposalSha256: string;
  action: string;
  reason: string | null;
  decidedByUserId: string;
  decidedAt: string;
  contentSha256: string;
}

export interface KickoffModel {
  _links: Record<string, Link>;
  iteration: IterationModel;
  intake: IterationIntakeModel;
  currentProposal: KickoffProposalModel | null;
  decisions: KickoffDecisionModel[];
}

export interface ProblemStatementModel {
  id: string;
  storyId: string;
  revisionNumber: number;
  title: string;
  problem: string;
  cognitiveMode: string;
  citations: FrozenCitationModel[];
  contentSha256: string;
  createdAt: string;
}

export interface StoryCardModel {
  id: string;
  reference: 'US-001';
  storyId: string;
  revisionNumber: number;
  title: string;
  role: string;
  goal: string;
  value: string;
  problemStatementId: string;
  contentSha256: string;
  createdAt: string;
}

export interface KickoffDecisionResultModel {
  _links: Record<string, Link>;
  iteration: IterationModel;
  decision: KickoffDecisionModel;
  problemStatement: ProblemStatementModel | null;
  storyCard: StoryCardModel | null;
}

export function iterationModel(iteration: Iteration): IterationModel {
  const id = iteration.identity();
  const description = iteration.description();
  const workspaceId = description.workspace.id();
  const links: Record<string, Link> = {
    self: link(workspaceIterationHref(workspaceId, id)),
    collection: link(workspaceIterationsHref(workspaceId)),
    workspace: link(workspaceHref(workspaceId)),
    candidate: link(
      workspaceStoryCandidateHref(
        workspaceId,
        description.sourceCandidate.id(),
      ),
    ),
    intake: link(workspaceIterationIntakeHref(workspaceId, id)),
    kickoff: link(workspaceIterationKickoffHref(workspaceId, id)),
  };
  if (description.lifecycle === 'provisioning') {
    links['complete-provisioning'] = link(
      workspaceIterationProvisioningHref(workspaceId, id, 'complete'),
    );
    links['fail-provisioning'] = link(
      workspaceIterationProvisioningHref(workspaceId, id, 'fail'),
    );
  }
  if (description.activeStory) {
    links.story = link(
      workspaceStoryHref(workspaceId, description.activeStory.id()),
    );
  }
  return {
    _links: links,
    id,
    reference: description.reference,
    sourceCandidateId: description.sourceCandidate.id(),
    sourceCandidateSha256: description.sourceCandidateSha256,
    lifecycle: description.lifecycle,
    loop: description.loop,
    stage: description.stage,
    lane: description.lane,
    version: description.version,
    baseCommitSha: description.baseCommitSha,
    branchName: description.branchName,
    provisioningFailureSummary: description.provisioningFailureSummary,
    activeStoryId: description.activeStory?.id() ?? null,
    admittedByUserId: description.admittedBy.id(),
    admittedAt: description.admittedAt,
    updatedAt: description.updatedAt,
  };
}

export function iterationIntakeModel(
  workspaceId: string,
  intake: IterationIntake,
): IterationIntakeModel {
  const description = intake.description();
  return {
    _links: {
      self: link(
        workspaceIterationIntakeHref(workspaceId, description.iteration.id()),
      ),
      iteration: link(
        workspaceIterationHref(workspaceId, description.iteration.id()),
      ),
    },
    iterationId: description.iteration.id(),
    candidate: {
      ...description.candidate,
      citations: description.candidate.citations.map((citation) =>
        frozenCitationModel(workspaceId, citation),
      ),
    },
    sources: description.sources.map((source) => ({
      inboxItemId: source.inboxItem.id(),
      inboxRevisionId: source.inboxRevision.id(),
      revisionNumber: source.revisionNumber,
      sourceKind: source.sourceKind,
      externalKey: source.externalKey,
      itemStatus: source.itemStatus,
      title: source.title,
      body: source.body,
      contentType: source.contentType,
      uri: source.uri,
      providerMetadata: source.providerMetadata,
      sourceUpdatedAt: source.sourceUpdatedAt,
      capturedAt: source.capturedAt,
      contentSha256: source.contentSha256,
    })),
    requirementsProjection: description.requirementsProjection,
    contentSha256: description.contentSha256,
    frozenAt: description.frozenAt,
  };
}

export function kickoffProposalModel(
  workspaceId: string,
  proposal: KickoffProposal,
): KickoffProposalModel {
  const description = proposal.description();
  const iterationId = description.iteration.id();
  return {
    _links: {
      self: link(
        `${workspaceIterationKickoffProposalsHref(workspaceId, iterationId)}/${proposal.identity()}`,
      ),
      iteration: link(workspaceIterationHref(workspaceId, iterationId)),
      decide: link(
        workspaceIterationKickoffDecisionsHref(workspaceId, iterationId),
      ),
    },
    id: proposal.identity(),
    reference: description.reference,
    sequence: description.sequence,
    origin: description.origin,
    title: description.title,
    problem: description.problem,
    role: description.role,
    goal: description.goal,
    value: description.value,
    cognitiveMode: description.cognitiveMode,
    citations: description.citations.map((citation) =>
      frozenCitationModel(workspaceId, citation),
    ),
    contentSha256: description.contentSha256,
    proposedAt: description.proposedAt,
  };
}

export function kickoffDecisionModel(
  workspaceId: string,
  decision: KickoffDecision,
): KickoffDecisionModel {
  const description = decision.description();
  const iterationId = description.iteration.id();
  return {
    _links: {
      self: link(
        `${workspaceIterationKickoffDecisionsHref(workspaceId, iterationId)}/${decision.identity()}`,
      ),
      iteration: link(workspaceIterationHref(workspaceId, iterationId)),
    },
    id: decision.identity(),
    reference: description.reference,
    proposalId: description.proposal.id(),
    proposalSha256: description.proposalSha256,
    action: description.action,
    reason: description.reason,
    decidedByUserId: description.decidedBy.id(),
    decidedAt: description.decidedAt,
    contentSha256: description.contentSha256,
  };
}

export function kickoffModel(
  workspaceId: string,
  view: KickoffView,
): KickoffModel {
  const iterationId = view.iteration.identity();
  const links: Record<string, Link> = {
    self: link(workspaceIterationKickoffHref(workspaceId, iterationId)),
    iteration: link(workspaceIterationHref(workspaceId, iterationId)),
    intake: link(workspaceIterationIntakeHref(workspaceId, iterationId)),
  };
  if (
    view.iteration.description().lifecycle === 'active' &&
    view.iteration.description().loop === 'kickoff' &&
    view.iteration.description().stage === 'candidate_drafting'
  ) {
    links['propose-replacement'] = link(
      workspaceIterationKickoffProposalsHref(workspaceId, iterationId),
    );
  }
  if (view.currentProposal) {
    links.decide = link(
      workspaceIterationKickoffDecisionsHref(workspaceId, iterationId),
    );
  }
  return {
    _links: links,
    iteration: iterationModel(view.iteration),
    intake: iterationIntakeModel(workspaceId, view.intake),
    currentProposal: view.currentProposal
      ? kickoffProposalModel(workspaceId, view.currentProposal)
      : null,
    decisions: view.decisions.map((decision) =>
      kickoffDecisionModel(workspaceId, decision),
    ),
  };
}

export function kickoffDecisionResultModel(
  workspaceId: string,
  result: KickoffDecisionResult,
): KickoffDecisionResultModel {
  return {
    _links: {
      iteration: link(
        workspaceIterationHref(workspaceId, result.iteration.identity()),
      ),
      kickoff: link(
        workspaceIterationKickoffHref(workspaceId, result.iteration.identity()),
      ),
    },
    iteration: iterationModel(result.iteration),
    decision: kickoffDecisionModel(workspaceId, result.decision),
    problemStatement: result.problemStatement
      ? problemStatementModel(workspaceId, result.problemStatement)
      : null,
    storyCard: result.storyCard
      ? storyCardModel(workspaceId, result.storyCard)
      : null,
  };
}

function problemStatementModel(
  workspaceId: string,
  problem: ProblemStatement,
): ProblemStatementModel {
  const description = problem.description();
  return {
    id: problem.identity(),
    storyId: description.story.id(),
    revisionNumber: description.revisionNumber,
    title: description.title,
    problem: description.problem,
    cognitiveMode: description.cognitiveMode,
    citations: description.citations.map((citation) =>
      frozenCitationModel(workspaceId, citation),
    ),
    contentSha256: description.contentSha256,
    createdAt: description.createdAt,
  };
}

function storyCardModel(_workspaceId: string, card: StoryCard): StoryCardModel {
  const description = card.description();
  return {
    id: card.identity(),
    reference: description.reference,
    storyId: description.story.id(),
    revisionNumber: description.revisionNumber,
    title: description.title,
    role: description.role,
    goal: description.goal,
    value: description.value,
    problemStatementId: description.problemStatement.id(),
    contentSha256: description.contentSha256,
    createdAt: description.createdAt,
  };
}

function frozenCitationModel(
  workspaceId: string,
  citation: ReturnType<KickoffProposal['description']>['citations'][number],
): FrozenCitationModel {
  const inboxItemId = citation.inboxItem.id();
  const inboxRevisionId = citation.inboxRevision.id();
  return {
    inboxItemId,
    inboxRevisionId,
    revisionNumber: citation.revisionNumber,
    revisionSha256: citation.revisionSha256,
    locator: citation.locator,
    _links: {
      item: link(workspaceInboxItemHref(workspaceId, inboxItemId)),
      revision: link(
        workspaceInboxRevisionHref(workspaceId, inboxItemId, inboxRevisionId),
      ),
    },
  };
}
