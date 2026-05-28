import type { Entity } from '@hateoas-ts/resource';

import type { components } from './openapi-schema.js';

import type { SidebarResource } from './sidebar-resource.js';
import type { WorkspaceCollectionResource } from './workspace-resource.js';

type UserResourceSchema = components['schemas']['UserResource'];
export type UserResourceData = Omit<UserResourceSchema, '_links'>;

export type UserResource = Entity<
  UserResourceData,
  {
    self: UserResource;
    workspaces: WorkspaceCollectionResource;
    sidebar: SidebarResource;
  }
>;
