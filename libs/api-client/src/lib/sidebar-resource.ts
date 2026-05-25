import type { Entity } from '@hateoas-ts/resource';

import type { UserResource } from './user-resource.js';

export type SidebarItemType = 'resource' | 'action' | 'external' | 'group';

export type SidebarItem = {
  key?: string;
  label: string;
  type?: SidebarItemType;
  path?: string | null;
  icon?: string | null;
  rel?: string;
  href?: string;
  template?: string;
  defaultOpen?: boolean;
  active?: boolean;
  children?: SidebarItem[];
};

export type SidebarSection = {
  title: string;
  key: string;
  defaultOpen: boolean;
  order?: number;
  items: SidebarItem[];
};

export type SidebarResource = Entity<
  {
    sections: SidebarSection[];
  },
  {
    self: SidebarResource;
    user: UserResource;
  }
>;
