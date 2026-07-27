import type { Collection, Entity } from '@hateoas-ts/resource';

import type { components } from './openapi-schema.js';

import type { UserResource } from './user-resource.js';
import type { WorkspaceResource } from './workspace-resource.js';

type StoryCandidateResourceSchema =
  components['schemas']['InboxStoryCandidateResource'];
type StoryCandidateCollectionResourceSchema =
  components['schemas']['InboxStoryCandidateCollectionResource'];
type StoryResourceSchema = components['schemas']['StoryResource'];
type StoryCollectionResourceSchema =
  components['schemas']['StoryCollectionResource'];
type StoryRevisionResourceSchema =
  components['schemas']['StoryRevisionResource'];
type StoryRevisionCollectionResourceSchema =
  components['schemas']['StoryRevisionCollectionResource'];
export type StoryCandidateInput =
  components['schemas']['InboxStoryCandidateInput'];
export type StoryCandidateDecisionInput =
  components['schemas']['InboxCandidateDecisionInput'];
export type SelectStoryCandidateInput =
  components['schemas']['SelectInboxCandidateInput'];
export type StoryCandidateStatus =
  components['schemas']['InboxCandidateStatus'];
export type StoryCognitiveMode = components['schemas']['StoryCognitiveMode'];
export type StoryCandidateResourceData = Omit<
  StoryCandidateResourceSchema,
  '_links'
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
export type StoryRevisionResourceData = Omit<
  StoryRevisionResourceSchema,
  '_links'
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
    extraction: import('./inbox-resource.js').InboxExtractionResource;
    defer: StoryCandidateResource;
    reject: StoryCandidateResource;
    select: import('./iteration-resource.js').IterationResource;
    iteration: import('./iteration-resource.js').IterationResource;
  }
>;

export type StoryCandidateCollectionResource =
  Collection<StoryCandidateResource> &
    Entity<
      StoryCandidateCollectionResourceData,
      {
        self: StoryCandidateCollectionResource;
        workspace: WorkspaceResource;
        extraction: import('./inbox-resource.js').InboxExtractionResource;
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
