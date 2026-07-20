import type { Entity } from '@hateoas-ts/resource';

import type { components } from './openapi-schema.js';

import type { MembershipCollectionResource } from './member-resource.js';
import type { SidebarResource } from './sidebar-resource.js';
import type {
  WorkspaceCollectionResource,
  WorkspaceResource,
} from './workspace-resource.js';

type UserResourceSchema = components['schemas']['UserResource'];
export type UserResourceData = Omit<UserResourceSchema, '_links'>;

export type UserResource = Entity<
  UserResourceData,
  {
    self: UserResource;
    memberships: MembershipCollectionResource;
    'create-workspace': WorkspaceResource;
    workspaces: WorkspaceCollectionResource;
    sidebar: SidebarResource;
  }
>;
