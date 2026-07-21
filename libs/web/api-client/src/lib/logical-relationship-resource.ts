import type { Collection, Entity } from '@hateoas-ts/resource';

import type { components } from './openapi-schema.js';

import type { WorkspaceResource } from './workspace-resource.js';

type LogicalRelationshipResourceSchema =
  components['schemas']['LogicalRelationshipResource'];
type LogicalRelationshipCollectionResourceSchema =
  components['schemas']['LogicalRelationshipCollectionResource'];

export type LogicalRelationshipResourceData = Omit<
  LogicalRelationshipResourceSchema,
  '_links'
>;
export type LogicalRelationshipCollectionResourceData = Omit<
  LogicalRelationshipCollectionResourceSchema,
  '_links' | '_embedded'
>;

export type LogicalRelationshipResource = Entity<
  LogicalRelationshipResourceData,
  {
    self: LogicalRelationshipResource;
    workspace: WorkspaceResource;
    collection: LogicalRelationshipCollectionResource;
  }
>;

export type LogicalRelationshipCollectionResource =
  Collection<LogicalRelationshipResource> &
    Entity<
      LogicalRelationshipCollectionResourceData,
      {
        self: LogicalRelationshipCollectionResource;
        workspace: WorkspaceResource;
        prev: LogicalRelationshipCollectionResource;
        next: LogicalRelationshipCollectionResource;
      }
    >;
