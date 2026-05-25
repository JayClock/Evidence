import type { Collection, Entity } from '@hateoas-ts/resource';

import type { WorkspaceResource } from './workspace-resource.js';

export type DiagramResource = Entity<
  {
    id: string;
    title: string;
    type: string;
    status: string;
    createdAt: string;
    updatedAt: string;
  },
  {
    self: DiagramResource;
    collection: DiagramCollectionResource;
    workspace: WorkspaceResource;
  }
>;

export type DiagramCollectionResource = Collection<DiagramResource> &
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
      self: DiagramCollectionResource;
      workspace: WorkspaceResource;
      prev: DiagramCollectionResource;
      next: DiagramCollectionResource;
    }
  >;
