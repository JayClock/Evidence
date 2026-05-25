import type { Collection, Entity } from '@hateoas-ts/resource';

import type { WorkspaceResource } from './workspace-resource.js';

export type LogicalEntityResource = Entity<
  {
    id: string;
    type: string;
    subType: string | null;
    name: string;
    label: string | null;
    createdAt: string;
    updatedAt: string;
  },
  {
    self: LogicalEntityResource;
    workspace: WorkspaceResource;
    collection: LogicalEntityCollectionResource;
  }
>;

export type LogicalEntityCollectionResource =
  Collection<LogicalEntityResource> &
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
        self: LogicalEntityCollectionResource;
        workspace: WorkspaceResource;
        prev: LogicalEntityCollectionResource;
        next: LogicalEntityCollectionResource;
      }
    >;
