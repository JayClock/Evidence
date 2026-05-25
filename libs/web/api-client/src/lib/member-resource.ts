import type { Collection, Entity } from '@hateoas-ts/resource';

import type { UserResource } from './user-resource.js';
import type { WorkspaceResource } from './workspace-resource.js';

export type MemberResource = Entity<
  {
    id: string;
    role: string;
    createdAt: string;
    updatedAt: string;
  },
  {
    self: MemberResource;
    collection: MemberCollectionResource;
    workspace: WorkspaceResource;
    user: UserResource;
  }
>;

export type MemberCollectionResource = Collection<MemberResource> &
  Entity<
    {
      total: number;
    },
    {
      self: MemberCollectionResource;
      workspace: WorkspaceResource;
    }
  >;
