import type { Entity } from '@hateoas-ts/resource';

import type { components } from './openapi-schema.js';

import type {
  StoryCandidateCollectionResource,
  StoryCollectionResource,
} from './delivery-resource.js';
import type { DiagramResource } from './diagram-resource.js';
import type { InboxItemCollectionResource } from './inbox-resource.js';
import type { LogicalEntityCollectionResource } from './logical-entity-resource.js';
import type { LogicalRelationshipCollectionResource } from './logical-relationship-resource.js';
import type { MemberCollectionResource } from './member-resource.js';

type WorkspaceResourceSchema = components['schemas']['WorkspaceResource'];

export type WorkspaceResourceData = Omit<WorkspaceResourceSchema, '_links'>;

export type WorkspaceResource = Entity<
  WorkspaceResourceData,
  {
    self: WorkspaceResource;
    members: MemberCollectionResource;
    diagram: DiagramResource;
    'inbox-items': InboxItemCollectionResource;
    'story-candidates': StoryCandidateCollectionResource;
    stories: StoryCollectionResource;
    'logical-entities': LogicalEntityCollectionResource;
    'logical-relationships': LogicalRelationshipCollectionResource;
  }
>;
