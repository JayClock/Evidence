import type { Collection, Entity } from '@hateoas-ts/resource';

import type { DiagramCollectionResource } from './diagram-resource.js';
import type { LogicalEntityCollectionResource } from './logical-entity-resource.js';
import type { MemberCollectionResource } from './member-resource.js';
import type { UserResource } from './user-resource.js';

export type WorkspaceResource = Entity<
  {
    id: string;
    title: string;
    description: string | null;
    status: string;
    metadata: Record<string, string>;
    createdAt: string;
    updatedAt: string;
  },
  {
    self: WorkspaceResource;
    user: UserResource;
    members: MemberCollectionResource;
    diagrams: DiagramCollectionResource;
    'logical-entities': LogicalEntityCollectionResource;
    collection: WorkspaceCollectionResource;
  }
>;

export type WorkspaceCollectionResource = Collection<WorkspaceResource> &
  Entity<
    {
      page: {
        number: number;
        size: number;
        totalElements: number;
        totalPages: number;
      };
    },
    {
      self: WorkspaceCollectionResource;
      user: UserResource;
      prev: WorkspaceCollectionResource;
      next: WorkspaceCollectionResource;
    }
  >;
