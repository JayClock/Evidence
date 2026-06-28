import type { Collection, Entity } from '@hateoas-ts/resource';

import type { components } from './openapi-schema.js';

import type { DiagramResource } from './diagram-resource.js';
import type { LogicalEntityCollectionResource } from './logical-entity-resource.js';
import type { MemberCollectionResource } from './member-resource.js';
import type { UserResource } from './user-resource.js';

type WorkspaceResourceSchema = components['schemas']['WorkspaceResource'];
type WorkspaceCollectionResourceSchema =
  components['schemas']['WorkspaceCollectionResource'];

export type WorkspaceResourceData = Omit<WorkspaceResourceSchema, '_links'>;
export type WorkspaceCollectionResourceData = Omit<
  WorkspaceCollectionResourceSchema,
  '_links' | '_embedded'
>;

export type WorkspaceResource = Entity<
  WorkspaceResourceData,
  {
    self: WorkspaceResource;
    user: UserResource;
    members: MemberCollectionResource;
    diagram: DiagramResource;
    'logical-entities': LogicalEntityCollectionResource;
    collection: WorkspaceCollectionResource;
  }
>;

export type WorkspaceCollectionResource = Collection<WorkspaceResource> &
  Entity<
    WorkspaceCollectionResourceData,
    {
      self: WorkspaceCollectionResource;
      user: UserResource;
      prev: WorkspaceCollectionResource;
      next: WorkspaceCollectionResource;
    }
  >;
