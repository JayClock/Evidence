import type { Collection, Entity } from '@hateoas-ts/resource';

import type { components } from './openapi-schema.js';

import type { UserResource } from './user-resource.js';
import type { WorkspaceResource } from './workspace-resource.js';

type StoryCandidateResourceSchema =
  components['schemas']['StoryCandidateResource'];
type StoryCandidateCollectionResourceSchema =
  components['schemas']['StoryCandidateCollectionResource'];
type StoryResourceSchema = components['schemas']['StoryResource'];
type StoryCollectionResourceSchema =
  components['schemas']['StoryCollectionResource'];
type StoryRevisionResourceSchema =
  components['schemas']['StoryRevisionResource'];
type StoryRevisionCollectionResourceSchema =
  components['schemas']['StoryRevisionCollectionResource'];
type CodingRunResourceSchema = components['schemas']['CodingRunResource'];
type CodingRunCollectionResourceSchema =
  components['schemas']['CodingRunCollectionResource'];

type RequiredNullable<T, K extends keyof T> = Omit<T, K> & {
  [P in K]-?: Exclude<T[P], undefined>;
};

export type StoryCandidateInput = components['schemas']['StoryCandidateInput'];
export type StoryCandidateDecisionInput =
  components['schemas']['StoryCandidateDecisionInput'];
export type StoryCandidateStatus =
  components['schemas']['StoryCandidateStatus'];
export type StoryCognitiveMode = components['schemas']['StoryCognitiveMode'];
export type StoryRevisionInput = components['schemas']['StoryRevisionInput'];
export type StoryScenarioInput = components['schemas']['StoryScenarioInput'];
export type CodingRunStatus = components['schemas']['CodingRunStatus'];
export type CodingRunQualityCheck =
  components['schemas']['CodingRunQualityCheck'];
export type StartCodingRunInput = components['schemas']['StartCodingRunInput'];
export type CodingRunReviewInput =
  components['schemas']['CodingRunReviewInput'];
export type CodingRunFailureInput =
  components['schemas']['CodingRunFailureInput'];
export type CodingRunAcceptanceInput =
  components['schemas']['CodingRunAcceptanceInput'];
export type CodingRunRejectionInput =
  components['schemas']['CodingRunRejectionInput'];
export type CodingRunVersionInput =
  components['schemas']['CodingRunVersionInput'];

export type StoryCandidateResourceData = RequiredNullable<
  Omit<StoryCandidateResourceSchema, '_links'>,
  'decidedByUserId' | 'decidedAt' | 'confirmedStoryId' | 'confirmedRevisionId'
>;
export type StoryCandidateCollectionResourceData = Omit<
  StoryCandidateCollectionResourceSchema,
  '_links' | '_embedded'
>;
export type StoryResourceData = Omit<StoryResourceSchema, '_links'>;
export type StoryCollectionResourceData = Omit<
  StoryCollectionResourceSchema,
  '_links' | '_embedded'
>;
export type StoryRevisionResourceData = RequiredNullable<
  Omit<StoryRevisionResourceSchema, '_links'>,
  'sourceCandidateId'
>;
export type StoryRevisionCollectionResourceData = Omit<
  StoryRevisionCollectionResourceSchema,
  '_links' | '_embedded'
>;
export type CodingRunResourceData = Omit<CodingRunResourceSchema, '_links'>;
export type CodingRunCollectionResourceData = Omit<
  CodingRunCollectionResourceSchema,
  '_links' | '_embedded'
>;

export type StoryCandidateResource = Entity<
  StoryCandidateResourceData,
  {
    self: StoryCandidateResource;
    workspace: WorkspaceResource;
    collection: StoryCandidateCollectionResource;
    'proposed-by': UserResource;
    'decided-by': UserResource;
    confirm: StoryRevisionResource;
    reject: StoryCandidateResource;
    story: StoryResource;
    'story-revision': StoryRevisionResource;
  }
>;

export type StoryCandidateCollectionResource =
  Collection<StoryCandidateResource> &
    Entity<
      StoryCandidateCollectionResourceData,
      {
        self: StoryCandidateCollectionResource;
        workspace: WorkspaceResource;
        prev: StoryCandidateCollectionResource;
        next: StoryCandidateCollectionResource;
      }
    >;

export type StoryResource = Entity<
  StoryResourceData,
  {
    self: StoryResource;
    workspace: WorkspaceResource;
    collection: StoryCollectionResource;
    revisions: StoryRevisionCollectionResource;
    'create-revision': StoryRevisionResource;
    'latest-revision': StoryRevisionResource;
    'coding-runs': CodingRunCollectionResource;
    'start-coding-run': CodingRunResource;
  }
>;

export type StoryCollectionResource = Collection<StoryResource> &
  Entity<
    StoryCollectionResourceData,
    {
      self: StoryCollectionResource;
      workspace: WorkspaceResource;
      prev: StoryCollectionResource;
      next: StoryCollectionResource;
    }
  >;

export type StoryRevisionResource = Entity<
  StoryRevisionResourceData,
  {
    self: StoryRevisionResource;
    story: StoryResource;
    collection: StoryRevisionCollectionResource;
    workspace: WorkspaceResource;
    'created-by': UserResource;
    'source-candidate': StoryCandidateResource;
  }
>;

export type StoryRevisionCollectionResource =
  Collection<StoryRevisionResource> &
    Entity<
      StoryRevisionCollectionResourceData,
      {
        self: StoryRevisionCollectionResource;
        story: StoryResource;
        prev: StoryRevisionCollectionResource;
        next: StoryRevisionCollectionResource;
      }
    >;

export type CodingRunResource = Entity<
  CodingRunResourceData,
  {
    self: CodingRunResource;
    workspace: WorkspaceResource;
    story: StoryResource;
    'story-revision': StoryRevisionResource;
    collection: CodingRunCollectionResource;
    'requested-by': UserResource;
    'decided-by': UserResource;
    review: CodingRunResource;
    fail: CodingRunResource;
    cancel: CodingRunResource;
    accept: CodingRunResource;
    reject: CodingRunResource;
  }
>;

export type CodingRunCollectionResource = Collection<CodingRunResource> &
  Entity<
    CodingRunCollectionResourceData,
    {
      self: CodingRunCollectionResource;
      story: StoryResource;
      prev: CodingRunCollectionResource;
      next: CodingRunCollectionResource;
    }
  >;
