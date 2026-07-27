import type {
  InboxCandidateDecision,
  InboxExtraction,
  InboxStoryCandidate,
} from '@evidence/server-domain';
import {
  link,
  type Link,
  workspaceHref,
  workspaceExtractionStoryCandidatesHref,
  workspaceInboxExtractionCandidatesHref,
  workspaceInboxExtractionHref,
  workspaceInboxExtractionsHref,
  workspaceInboxItemHref,
  workspaceInboxRevisionHref,
  workspaceIterationHref,
  workspaceStoryCandidateDeferHref,
  workspaceStoryCandidateHref,
  workspaceStoryCandidateRejectHref,
  workspaceStoryCandidateSelectHref,
  workspaceStoryCandidatesHref,
} from '../links';

export interface InboxExtractionSourceModel {
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
    InboxExtraction['description']
  >['sources'][number]['providerMetadata'];
  sourceUpdatedAt: string | null;
  capturedAt: string;
  contentSha256: string;
  locatorLinks: Record<string, Link>;
}

export interface InboxExtractionModel {
  _links: Record<string, Link>;
  id: string;
  reference: string;
  status: string;
  sources: InboxExtractionSourceModel[];
  version: number;
  requestedByUserId: string;
  requestedAt: string;
  completedAt: string | null;
  failureSummary: string | null;
}

export interface InboxCandidateCitationModel {
  inboxItemId: string;
  inboxRevisionId: string;
  revisionNumber: number;
  revisionSha256: string;
  locator: string;
  _links: Record<string, Link>;
}

export interface InboxStoryCandidateModel {
  _links: Record<string, Link>;
  id: string;
  reference: string;
  extractionId: string;
  title: string;
  problem: string;
  role: string;
  goal: string;
  value: string;
  cognitiveMode: string;
  citations: InboxCandidateCitationModel[];
  contentSha256: string;
  status: string;
  proposedBy: 'inbox-analyst';
  proposedAt: string;
  terminalDecisionId: string | null;
  selectedIterationId: string | null;
}

export interface InboxCandidateDecisionModel {
  _links: Record<string, Link>;
  id: string;
  reference: string;
  candidateId: string;
  candidateSha256: string;
  action: string;
  reason: string;
  decidedByUserId: string;
  decidedAt: string;
  contentSha256: string;
}

export function inboxExtractionModel(
  extraction: InboxExtraction,
): InboxExtractionModel {
  const id = extraction.identity();
  const description = extraction.description();
  const workspaceId = description.workspace.id();
  const links: Record<string, Link> = {
    self: link(workspaceInboxExtractionHref(workspaceId, id)),
    collection: link(workspaceInboxExtractionsHref(workspaceId)),
    workspace: link(workspaceHref(workspaceId)),
    'story-candidates': link(
      workspaceExtractionStoryCandidatesHref(workspaceId, id),
    ),
  };
  if (description.status === 'awaiting_agent') {
    links['propose-candidates'] = link(
      workspaceInboxExtractionCandidatesHref(workspaceId, id),
    );
  }
  return {
    _links: links,
    id,
    reference: description.reference,
    status: description.status,
    sources: description.sources.map((source) => {
      const inboxItemId = source.inboxItem.id();
      const inboxRevisionId = source.inboxRevision.id();
      return {
        inboxItemId,
        inboxRevisionId,
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
        locatorLinks: {
          item: link(workspaceInboxItemHref(workspaceId, inboxItemId)),
          revision: link(
            workspaceInboxRevisionHref(
              workspaceId,
              inboxItemId,
              inboxRevisionId,
            ),
          ),
        },
      };
    }),
    version: description.version,
    requestedByUserId: description.requestedBy.id(),
    requestedAt: description.requestedAt,
    completedAt: description.completedAt,
    failureSummary: description.failureSummary,
  };
}

export function inboxStoryCandidateModel(
  candidate: InboxStoryCandidate,
): InboxStoryCandidateModel {
  const id = candidate.identity();
  const description = candidate.description();
  const workspaceId = description.workspace.id();
  const links: Record<string, Link> = {
    self: link(workspaceStoryCandidateHref(workspaceId, id)),
    collection: link(workspaceStoryCandidatesHref(workspaceId)),
    workspace: link(workspaceHref(workspaceId)),
    extraction: link(
      workspaceInboxExtractionHref(workspaceId, description.extraction.id()),
    ),
  };
  if (description.status === 'ready' || description.status === 'stale') {
    links.defer = link(workspaceStoryCandidateDeferHref(workspaceId, id));
    links.reject = link(workspaceStoryCandidateRejectHref(workspaceId, id));
  }
  if (description.status === 'ready') {
    links.select = link(workspaceStoryCandidateSelectHref(workspaceId, id));
  }
  if (description.selectedIteration) {
    links.iteration = link(
      workspaceIterationHref(workspaceId, description.selectedIteration.id()),
    );
  }
  return {
    _links: links,
    id,
    reference: description.reference,
    extractionId: description.extraction.id(),
    title: description.title,
    problem: description.problem,
    role: description.role,
    goal: description.goal,
    value: description.value,
    cognitiveMode: description.cognitiveMode,
    citations: description.citations.map((citation) => {
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
            workspaceInboxRevisionHref(
              workspaceId,
              inboxItemId,
              inboxRevisionId,
            ),
          ),
        },
      };
    }),
    contentSha256: description.contentSha256,
    status: description.status,
    proposedBy: description.proposedBy,
    proposedAt: description.proposedAt,
    terminalDecisionId: description.terminalDecision?.id() ?? null,
    selectedIterationId: description.selectedIteration?.id() ?? null,
  };
}

export function inboxCandidateDecisionModel(
  decision: InboxCandidateDecision,
): InboxCandidateDecisionModel {
  const description = decision.description();
  const workspaceId = description.workspace.id();
  const candidateId = description.candidate.id();
  return {
    _links: {
      self: link(
        `${workspaceStoryCandidateHref(workspaceId, candidateId)}/decisions/${decision.identity()}`,
      ),
      candidate: link(workspaceStoryCandidateHref(workspaceId, candidateId)),
      workspace: link(workspaceHref(workspaceId)),
    },
    id: decision.identity(),
    reference: description.reference,
    candidateId,
    candidateSha256: description.candidateSha256,
    action: description.action,
    reason: description.reason,
    decidedByUserId: description.decidedBy.id(),
    decidedAt: description.decidedAt,
    contentSha256: description.contentSha256,
  };
}
