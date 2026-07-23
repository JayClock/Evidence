import type { Collection, Entity } from '@hateoas-ts/resource';

import type { components } from './openapi-schema.js';

import type { StoryCandidateCollectionResource } from './delivery-resource.js';
import type { WorkspaceResource } from './workspace-resource.js';

type InboxItemResourceSchema = components['schemas']['InboxItemResource'];
type InboxItemCollectionResourceSchema =
  components['schemas']['InboxItemCollectionResource'];
type InboxRevisionResourceSchema =
  components['schemas']['InboxRevisionResource'];
type InboxRevisionCollectionResourceSchema =
  components['schemas']['InboxRevisionCollectionResource'];

type RequiredNullable<T, K extends keyof T> = Omit<T, K> & {
  [P in K]-?: Exclude<T[P], undefined>;
};

export type InboxSourceInput = components['schemas']['InboxSourceInput'];
export type InboxSourceUpdateInput =
  components['schemas']['InboxSourceUpdateInput'];
export type InboxItemStatusInput =
  components['schemas']['InboxItemStatusInput'];
export type InboxItemStatus = InboxItemResourceSchema['status'];

export type InboxItemResourceData = Omit<InboxItemResourceSchema, '_links'>;
export type InboxItemCollectionResourceData = Omit<
  InboxItemCollectionResourceSchema,
  '_links' | '_embedded'
>;
export type InboxRevisionResourceData = RequiredNullable<
  Omit<InboxRevisionResourceSchema, '_links'>,
  'uri' | 'sourceUpdatedAt'
>;
export type InboxRevisionCollectionResourceData = Omit<
  InboxRevisionCollectionResourceSchema,
  '_links' | '_embedded'
>;

export type InboxItemResource = Entity<
  InboxItemResourceData,
  {
    self: InboxItemResource;
    workspace: WorkspaceResource;
    collection: InboxItemCollectionResource;
    revisions: InboxRevisionCollectionResource;
    'story-candidates': StoryCandidateCollectionResource;
    'latest-revision': InboxRevisionResource;
  }
>;

export type InboxItemCollectionResource = Collection<InboxItemResource> &
  Entity<
    InboxItemCollectionResourceData,
    {
      self: InboxItemCollectionResource;
      workspace: WorkspaceResource;
      prev: InboxItemCollectionResource;
      next: InboxItemCollectionResource;
    }
  >;

export type InboxRevisionResource = Entity<
  InboxRevisionResourceData,
  {
    self: InboxRevisionResource;
    item: InboxItemResource;
    collection: InboxRevisionCollectionResource;
    workspace: WorkspaceResource;
    'story-candidates': StoryCandidateCollectionResource;
  }
>;

export type InboxRevisionCollectionResource =
  Collection<InboxRevisionResource> &
    Entity<
      InboxRevisionCollectionResourceData,
      {
        self: InboxRevisionCollectionResource;
        item: InboxItemResource;
        prev: InboxRevisionCollectionResource;
        next: InboxRevisionCollectionResource;
      }
    >;
