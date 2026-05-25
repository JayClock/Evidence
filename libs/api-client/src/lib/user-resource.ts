import type { Entity } from '@hateoas-ts/resource';

import type { WorkspaceCollectionResource } from './workspace-resource.js';

export type UserResource = Entity<
  {
    id: string;
    name: string;
    email: string | null;
  },
  {
    self: UserResource;
    workspaces: WorkspaceCollectionResource;
  }
>;
