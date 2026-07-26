import { Entity, Ref } from '../core';

export type StoryCognitiveMode = 'clear' | 'complicated' | 'complex';

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

export interface StoryContentInput {
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

export interface StoryRevisionInput extends StoryContentInput {
  scenarios: StoryScenarioInput[];
}

export interface StoryDescription {
  workspace: Ref<string>;
  reference: 'US-001';
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

export interface StoryListQuery {
  page: number;
  pageSize: number;
}

export interface CreatedStoryRevision {
  story: Story;
  revision: StoryRevision;
}

export interface WorkspaceDelivery {
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
