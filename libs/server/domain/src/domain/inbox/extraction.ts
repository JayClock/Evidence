import { Entity, Ref } from '../core';
import type { InboxContentType, InboxItemStatus, JsonValue } from './inbox';

export type InboxExtractionStatus =
  | 'awaiting_agent'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type InboxCandidateStatus =
  | 'ready'
  | 'stale'
  | 'selected'
  | 'deferred'
  | 'rejected';

export type InboxCandidateDecisionAction = 'defer' | 'reject';
export type InboxCandidateCognitiveMode = 'clear' | 'complicated' | 'complex';

export interface InboxExtractionSourceDescription {
  position: number;
  inboxItem: Ref<string>;
  inboxRevision: Ref<string>;
  revisionNumber: number;
  sourceKind: string;
  externalKey: string;
  itemStatus: InboxItemStatus;
  title: string;
  body: string;
  contentType: InboxContentType;
  uri: string | null;
  providerMetadata: Record<string, JsonValue>;
  sourceUpdatedAt: string | null;
  capturedAt: string;
  contentSha256: string;
}

export interface InboxExtractionDescription {
  reference: string;
  workspace: Ref<string>;
  status: InboxExtractionStatus;
  sources: InboxExtractionSourceDescription[];
  version: number;
  requestedBy: Ref<string>;
  requestedAt: string;
  completedAt: string | null;
  failureSummary: string | null;
}

export class InboxExtraction
  implements Entity<string, InboxExtractionDescription>
{
  constructor(
    private readonly id: string,
    private readonly desc: InboxExtractionDescription,
  ) {}

  identity(): string {
    return this.id;
  }

  description(): InboxExtractionDescription {
    return this.desc;
  }
}

export interface CreateInboxExtractionInput {
  inboxItemIds: string[];
}

export interface InboxCandidateCitationInput {
  inboxItemId: string;
  revisionSha256: string;
  locator: string;
}

export interface InboxStoryCandidateInput {
  title: string;
  problem: string;
  role: string;
  goal: string;
  value: string;
  cognitiveMode: InboxCandidateCognitiveMode;
  citations: InboxCandidateCitationInput[];
}

export interface InboxCandidateCitationDescription {
  inboxItem: Ref<string>;
  inboxRevision: Ref<string>;
  revisionNumber: number;
  revisionSha256: string;
  locator: string;
}

export interface InboxStoryCandidateDescription {
  reference: string;
  workspace: Ref<string>;
  extraction: Ref<string>;
  title: string;
  problem: string;
  role: string;
  goal: string;
  value: string;
  cognitiveMode: InboxCandidateCognitiveMode;
  citations: InboxCandidateCitationDescription[];
  contentSha256: string;
  status: InboxCandidateStatus;
  proposedBy: 'inbox-analyst';
  proposedAt: string;
  terminalDecision: Ref<string> | null;
  selectedIteration: Ref<string> | null;
}

export class InboxStoryCandidate
  implements Entity<string, InboxStoryCandidateDescription>
{
  constructor(
    private readonly id: string,
    private readonly desc: InboxStoryCandidateDescription,
  ) {}

  identity(): string {
    return this.id;
  }

  description(): InboxStoryCandidateDescription {
    return this.desc;
  }
}

export interface InboxCandidateDecisionDescription {
  reference: string;
  workspace: Ref<string>;
  candidate: Ref<string>;
  candidateSha256: string;
  action: InboxCandidateDecisionAction;
  reason: string;
  decidedBy: Ref<string>;
  decidedAt: string;
  contentSha256: string;
}

export class InboxCandidateDecision
  implements Entity<string, InboxCandidateDecisionDescription>
{
  constructor(
    private readonly id: string,
    private readonly desc: InboxCandidateDecisionDescription,
  ) {}

  identity(): string {
    return this.id;
  }

  description(): InboxCandidateDecisionDescription {
    return this.desc;
  }
}

export interface InboxCandidateListQuery {
  page: number;
  pageSize: number;
  status?: InboxCandidateStatus;
}

export interface ProposedInboxCandidateSet {
  extraction: InboxExtraction;
  candidates: InboxStoryCandidate[];
}

export interface WorkspaceInboxWorkflow {
  createExtraction(
    input: CreateInboxExtractionInput,
    requestedByUserId: string,
  ): Promise<InboxExtraction>;
  findExtraction(extractionId: string): Promise<InboxExtraction | null>;
  proposeCandidates(
    extractionId: string,
    expectedVersion: number,
    candidates: InboxStoryCandidateInput[],
  ): Promise<ProposedInboxCandidateSet>;
  listCandidates(
    query: InboxCandidateListQuery,
  ): Promise<[InboxStoryCandidate[], number]>;
  findCandidate(candidateId: string): Promise<InboxStoryCandidate | null>;
  decideCandidate(
    candidateId: string,
    candidateSha256: string,
    action: InboxCandidateDecisionAction,
    reason: string,
    decidedByUserId: string,
  ): Promise<{
    candidate: InboxStoryCandidate;
    decision: InboxCandidateDecision;
  }>;
}
