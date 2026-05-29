import type { Collection, Entity } from '@hateoas-ts/resource';

import type { components } from './openapi-schema.js';

import type { WorkspaceResource } from './workspace-resource.js';

type LogicalEntityResourceSchema =
  components['schemas']['LogicalEntityResource'];
type LogicalEntityCollectionResourceSchema =
  components['schemas']['LogicalEntityCollectionResource'];

export type LogicalEntityType = components['schemas']['LogicalEntityType'];
export type LogicalEntitySubType = NonNullable<
  LogicalEntityResourceSchema['subType']
>;
export type EvidenceSubType = string;
export type ParticipantSubType = string;
export type RoleSubType = string;
export type ContextSubType = string;
export type EntityAttribute = components['schemas']['EntityAttribute'];
type RequiredNullable<T, K extends keyof T> = Omit<T, K> & {
  [P in K]-?: Exclude<T[P], undefined>;
};

export type LogicalEntityResourceData = RequiredNullable<
  Omit<LogicalEntityResourceSchema, '_links'>,
  'subType' | 'label' | 'description'
>;
export type LogicalEntityCollectionResourceData = Omit<
  LogicalEntityCollectionResourceSchema,
  '_links' | '_embedded'
>;

export type LogicalEntityResource = Entity<
  LogicalEntityResourceData,
  {
    self: LogicalEntityResource;
    workspace: WorkspaceResource;
    collection: LogicalEntityCollectionResource;
  }
>;

export type LogicalEntityCollectionResource =
  Collection<LogicalEntityResource> &
    Entity<
      LogicalEntityCollectionResourceData,
      {
        self: LogicalEntityCollectionResource;
        workspace: WorkspaceResource;
        prev: LogicalEntityCollectionResource;
        next: LogicalEntityCollectionResource;
      }
    >;
