import { Entity, HasMany, Ref } from '../core';

export type StoryCognitiveMode = 'clear' | 'complicated' | 'complex';
export type StoryCandidateStatus = 'pending' | 'confirmed' | 'rejected';

export interface StoryCitationInput {
  inboxItemId: string;
  inboxRevisionId: string;
  contentSha256: string;
  locator: string;
}

export interface StoryCitationDescription {
  inboxItem: Ref<string>;
  inboxRevision: Ref<string>;
  inboxRevisionNumber: number;
  contentSha256: string;
  locator: string;
}

export interface StoryCandidateInput {
  title: string;
  problem: string;
  role: string;
  goal: string;
  value: string;
  cognitiveMode: StoryCognitiveMode;
  citations: StoryCitationInput[];
}

export interface StoryScenarioInput {
  title: string;
  given: string[];
  when: string;
  then: string[];
}

export interface StoryScenarioDescription extends StoryScenarioInput {
  id: string;
}

export interface StoryRevisionInput extends StoryCandidateInput {
  scenarios: StoryScenarioInput[];
}

export interface StoryCandidateDescription {
  workspace: Ref<string>;
  title: string;
  problem: string;
  role: string;
  goal: string;
  value: string;
  cognitiveMode: StoryCognitiveMode;
  citations: StoryCitationDescription[];
  contentSha256: string;
  status: StoryCandidateStatus;
  version: number;
  proposedBy: Ref<string>;
  proposedAt: string;
  decidedBy: Ref<string> | null;
  decidedAt: string | null;
  confirmedStory: Ref<string> | null;
  confirmedRevision: Ref<string> | null;
}

export class StoryCandidate
  implements Entity<string, StoryCandidateDescription>
{
  constructor(
    private readonly id: string,
    private readonly desc: StoryCandidateDescription,
  ) {}

  identity(): string {
    return this.id;
  }

  description(): StoryCandidateDescription {
    return this.desc;
  }
}

export interface StoryDescription {
  workspace: Ref<string>;
  title: string;
  latestRevision: Ref<string>;
  latestRevisionNumber: number;
  latestScenarioCount: number;
  revisionCount: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export class Story implements Entity<string, StoryDescription> {
  constructor(
    private readonly id: string,
    private readonly desc: StoryDescription,
  ) {}

  identity(): string {
    return this.id;
  }

  description(): StoryDescription {
    return this.desc;
  }
}

export interface StoryRevisionDescription {
  story: Ref<string>;
  revisionNumber: number;
  title: string;
  problem: string;
  role: string;
  goal: string;
  value: string;
  cognitiveMode: StoryCognitiveMode;
  citations: StoryCitationDescription[];
  scenarios: StoryScenarioDescription[];
  contentSha256: string;
  sourceCandidate: Ref<string> | null;
  createdBy: Ref<string>;
  createdAt: string;
}

export class StoryRevision implements Entity<string, StoryRevisionDescription> {
  constructor(
    private readonly id: string,
    private readonly desc: StoryRevisionDescription,
  ) {}

  identity(): string {
    return this.id;
  }

  description(): StoryRevisionDescription {
    return this.desc;
  }
}

export interface StoryCandidateListQuery {
  page: number;
  pageSize: number;
  status?: StoryCandidateStatus;
}

export interface StoryListQuery {
  page: number;
  pageSize: number;
}

export interface ConfirmedStoryCandidate {
  candidate: StoryCandidate;
  story: Story;
  revision: StoryRevision;
  created: boolean;
}

export interface CreatedStoryRevision {
  story: Story;
  revision: StoryRevision;
}

export interface WorkspaceDelivery extends HasMany<StoryCandidate> {
  listCandidates(
    query: StoryCandidateListQuery,
  ): Promise<[StoryCandidate[], number]>;
  proposeCandidate(
    input: StoryCandidateInput,
    proposedByUserId: string,
  ): Promise<StoryCandidate>;
  confirmCandidate(
    candidateId: string,
    expectedVersion: number,
    decidedByUserId: string,
  ): Promise<ConfirmedStoryCandidate>;
  rejectCandidate(
    candidateId: string,
    expectedVersion: number,
    decidedByUserId: string,
  ): Promise<StoryCandidate>;
  listStories(query: StoryListQuery): Promise<[Story[], number]>;
  findStory(storyId: string): Promise<Story | null>;
  listStoryRevisions(
    storyId: string,
    page: number,
    pageSize: number,
  ): Promise<[StoryRevision[], number]>;
  findStoryRevision(
    storyId: string,
    revisionId: string,
  ): Promise<StoryRevision | null>;
  appendStoryRevision(
    storyId: string,
    expectedVersion: number,
    expectedLatestRevisionId: string,
    input: StoryRevisionInput,
    createdByUserId: string,
  ): Promise<CreatedStoryRevision>;
}
