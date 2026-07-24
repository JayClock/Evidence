import { Entity, HasMany, HasOne } from '../core';
import { Diagram, WorkspaceDiagram } from '../diagram';
import {
  CodingRun,
  CodingRunAcceptanceInput,
  CodingRunFailureInput,
  CodingRunListQuery,
  CodingRunReviewInput,
  ConfirmedStoryCandidate,
  CreatedStoryRevision,
  StartCodingRunInput,
  Story,
  StoryCandidate,
  StoryCandidateInput,
  StoryCandidateListQuery,
  StoryListQuery,
  StoryRevision,
  StoryRevisionInput,
  WorkspaceCodingRuns,
  WorkspaceDelivery,
} from '../delivery';
import {
  CapturedInboxItem,
  InboxItem,
  InboxItemStatus,
  InboxListQuery,
  InboxRevision,
  InboxSourceInput,
  WorkspaceInbox,
} from '../inbox';
import {
  LogicalEntity,
  LogicalEntityDescription,
  WorkspaceLogicalEntities,
} from '../logical-entity';
import {
  LogicalRelationship,
  LogicalRelationshipDescription,
  WorkspaceLogicalRelationships,
} from '../logical-relationship';
import { Member, MemberDescription, WorkspaceMembers } from '../member';

export interface WorkspaceDescription {
  title: string;
  description: string | null;
  status: string;
  metadata: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export class Workspace implements Entity<string, WorkspaceDescription> {
  constructor(
    private readonly id: string,
    private readonly desc: WorkspaceDescription,
    private readonly workspaceMembers: WorkspaceMembers,
    private readonly workspaceDiagram: WorkspaceDiagram,
    private readonly workspaceLogicalEntities: WorkspaceLogicalEntities,
    private readonly workspaceLogicalRelationships: WorkspaceLogicalRelationships,
    private readonly workspaceInbox: WorkspaceInbox,
    private readonly workspaceDelivery: WorkspaceDelivery,
    private readonly workspaceCodingRuns: WorkspaceCodingRuns,
  ) {}

  identity(): string {
    return this.id;
  }

  description(): WorkspaceDescription {
    return this.desc;
  }

  members(): HasMany<Member> {
    return this.workspaceMembers;
  }

  addMember(desc: MemberDescription): Promise<Member> {
    return this.workspaceMembers.addMember(desc);
  }

  updateMember(memberId: string, role: string): Promise<Member> {
    return this.workspaceMembers.updateMember(memberId, role);
  }

  removeMember(memberId: string): Promise<void> {
    return this.workspaceMembers.removeMember(memberId);
  }

  diagram(): HasOne<Diagram> {
    return this.workspaceDiagram;
  }

  inbox(): HasMany<InboxItem> {
    return this.workspaceInbox;
  }

  captureInboxSource(source: InboxSourceInput): Promise<CapturedInboxItem> {
    return this.workspaceInbox.capture(source);
  }

  appendInboxRevision(
    itemId: string,
    source: InboxSourceInput,
    expectedLatestRevisionSha256?: string,
  ): Promise<CapturedInboxItem> {
    return this.workspaceInbox.appendRevision(
      itemId,
      source,
      expectedLatestRevisionSha256,
    );
  }

  changeInboxItemStatus(
    itemId: string,
    status: InboxItemStatus,
    expectedVersion: number,
  ): Promise<InboxItem> {
    return this.workspaceInbox.changeStatus(itemId, status, expectedVersion);
  }

  listInboxItems(query: InboxListQuery): Promise<[InboxItem[], number]> {
    return this.workspaceInbox.list(query);
  }

  listInboxRevisions(
    itemId: string,
    page: number,
    pageSize: number,
  ): Promise<[InboxRevision[], number]> {
    return this.workspaceInbox.listRevisions(itemId, page, pageSize);
  }

  findInboxRevision(
    itemId: string,
    revisionId: string,
  ): Promise<InboxRevision | null> {
    return this.workspaceInbox.findRevision(itemId, revisionId);
  }

  storyCandidates(): HasMany<StoryCandidate> {
    return this.workspaceDelivery;
  }

  listStoryCandidates(
    query: StoryCandidateListQuery,
  ): Promise<[StoryCandidate[], number]> {
    return this.workspaceDelivery.listCandidates(query);
  }

  proposeStoryCandidate(
    input: StoryCandidateInput,
    proposedByUserId: string,
  ): Promise<StoryCandidate> {
    return this.workspaceDelivery.proposeCandidate(input, proposedByUserId);
  }

  confirmStoryCandidate(
    candidateId: string,
    expectedVersion: number,
    decidedByUserId: string,
  ): Promise<ConfirmedStoryCandidate> {
    return this.workspaceDelivery.confirmCandidate(
      candidateId,
      expectedVersion,
      decidedByUserId,
    );
  }

  rejectStoryCandidate(
    candidateId: string,
    expectedVersion: number,
    decidedByUserId: string,
  ): Promise<StoryCandidate> {
    return this.workspaceDelivery.rejectCandidate(
      candidateId,
      expectedVersion,
      decidedByUserId,
    );
  }

  listStories(query: StoryListQuery): Promise<[Story[], number]> {
    return this.workspaceDelivery.listStories(query);
  }

  findStory(storyId: string): Promise<Story | null> {
    return this.workspaceDelivery.findStory(storyId);
  }

  listStoryRevisions(
    storyId: string,
    page: number,
    pageSize: number,
  ): Promise<[StoryRevision[], number]> {
    return this.workspaceDelivery.listStoryRevisions(storyId, page, pageSize);
  }

  findStoryRevision(
    storyId: string,
    revisionId: string,
  ): Promise<StoryRevision | null> {
    return this.workspaceDelivery.findStoryRevision(storyId, revisionId);
  }

  appendStoryRevision(
    storyId: string,
    expectedVersion: number,
    expectedLatestRevisionId: string,
    input: StoryRevisionInput,
    createdByUserId: string,
  ): Promise<CreatedStoryRevision> {
    return this.workspaceDelivery.appendStoryRevision(
      storyId,
      expectedVersion,
      expectedLatestRevisionId,
      input,
      createdByUserId,
    );
  }

  codingRuns(): HasMany<CodingRun> {
    return this.workspaceCodingRuns;
  }

  listCodingRuns(query: CodingRunListQuery): Promise<[CodingRun[], number]> {
    return this.workspaceCodingRuns.list(query);
  }

  startCodingRun(
    storyId: string,
    input: StartCodingRunInput,
    requestedByUserId: string,
  ): Promise<CodingRun> {
    return this.workspaceCodingRuns.start(storyId, input, requestedByUserId);
  }

  submitCodingRunForReview(
    runId: string,
    expectedVersion: number,
    input: CodingRunReviewInput,
  ): Promise<CodingRun> {
    return this.workspaceCodingRuns.submitForReview(
      runId,
      expectedVersion,
      input,
    );
  }

  failCodingRun(
    runId: string,
    expectedVersion: number,
    input: CodingRunFailureInput,
  ): Promise<CodingRun> {
    return this.workspaceCodingRuns.fail(runId, expectedVersion, input);
  }

  cancelCodingRun(runId: string, expectedVersion: number): Promise<CodingRun> {
    return this.workspaceCodingRuns.cancel(runId, expectedVersion);
  }

  acceptCodingRun(
    runId: string,
    expectedVersion: number,
    input: CodingRunAcceptanceInput,
    decidedByUserId: string,
  ): Promise<CodingRun> {
    return this.workspaceCodingRuns.accept(
      runId,
      expectedVersion,
      input,
      decidedByUserId,
    );
  }

  rejectCodingRun(
    runId: string,
    expectedVersion: number,
    reason: string,
    decidedByUserId: string,
  ): Promise<CodingRun> {
    return this.workspaceCodingRuns.reject(
      runId,
      expectedVersion,
      reason,
      decidedByUserId,
    );
  }

  logicalEntities(): HasMany<LogicalEntity> {
    return this.workspaceLogicalEntities;
  }

  addLogicalEntity(desc: LogicalEntityDescription): Promise<LogicalEntity> {
    return this.workspaceLogicalEntities.add(desc);
  }

  updateLogicalEntity(
    entityId: string,
    desc: LogicalEntityDescription,
  ): Promise<LogicalEntity> {
    return this.workspaceLogicalEntities.update(entityId, desc);
  }

  deleteLogicalEntity(entityId: string): Promise<void> {
    return this.workspaceLogicalEntities.delete(entityId);
  }

  listLogicalEntities(
    page: number,
    pageSize: number,
  ): Promise<[LogicalEntity[], number]> {
    return this.workspaceLogicalEntities.list(page, pageSize);
  }

  logicalRelationships(): HasMany<LogicalRelationship> {
    return this.workspaceLogicalRelationships;
  }

  addLogicalRelationship(
    desc: LogicalRelationshipDescription,
  ): Promise<LogicalRelationship> {
    return this.workspaceLogicalRelationships.add(desc);
  }

  updateLogicalRelationship(
    relationshipId: string,
    desc: LogicalRelationshipDescription,
  ): Promise<LogicalRelationship> {
    return this.workspaceLogicalRelationships.update(relationshipId, desc);
  }

  deleteLogicalRelationship(relationshipId: string): Promise<void> {
    return this.workspaceLogicalRelationships.delete(relationshipId);
  }

  listLogicalRelationships(
    page: number,
    pageSize: number,
  ): Promise<[LogicalRelationship[], number]> {
    return this.workspaceLogicalRelationships.list(page, pageSize);
  }
}
