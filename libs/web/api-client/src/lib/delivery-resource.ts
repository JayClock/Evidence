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
