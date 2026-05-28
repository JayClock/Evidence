import type { Entity } from '@hateoas-ts/resource';

import type { components } from './openapi-schema.js';

import type { UserResource } from './user-resource.js';

type SidebarResourceSchema = components['schemas']['SidebarResource'];

export type SidebarItem = components['schemas']['SidebarItem'];
export type SidebarItemType = SidebarItem['type'];
export type SidebarSection = components['schemas']['SidebarSection'];
export type SidebarResourceData = Omit<SidebarResourceSchema, '_links'>;

export type SidebarResource = Entity<
  SidebarResourceData,
  {
    self: SidebarResource;
    user: UserResource;
  }
>;
