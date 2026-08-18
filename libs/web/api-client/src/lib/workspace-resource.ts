import type { Collection, Entity, State } from '@hateoas-ts/resource';

import type { components } from './openapi-schema.js';

import type {
  StoryCandidateCollectionResource,
  StoryCollectionResource,
} from './delivery-resource.js';
import type { DiagramResource } from './diagram-resource.js';
import type {
  InboxExtractionResource,
  InboxItemCollectionResource,
} from './inbox-resource.js';
import type { IterationResource } from './iteration-resource.js';
import type { LogicalEntityCollectionResource } from './logical-entity-resource.js';
import type { LogicalRelationshipCollectionResource } from './logical-relationship-resource.js';
import type { WorkspaceMembershipCollectionResource } from './membership-resource.js';
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
    memberships: WorkspaceMembershipCollectionResource;
    diagram: DiagramResource;
    'inbox-items': InboxItemCollectionResource;
    'inbox-extractions': InboxExtractionResource;
    'story-candidates': StoryCandidateCollectionResource;
    iterations: IterationResource;
    stories: StoryCollectionResource;
    'logical-entities': LogicalEntityCollectionResource;
    'logical-relationships': LogicalRelationshipCollectionResource;
  }
>;

export type WorkspaceState = State<WorkspaceResource>;

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
