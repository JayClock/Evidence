import type { Collection, Entity } from '@hateoas-ts/resource';

import type { components } from './openapi-schema.js';

import type { UserResource } from './user-resource.js';
import type { WorkspaceResource } from './workspace-resource.js';

type MemberResourceSchema = components['schemas']['MemberResource'];
type MemberCollectionResourceSchema =
  components['schemas']['MemberCollectionResource'];
type MembershipResourceSchema = components['schemas']['MembershipResource'];
type MembershipCollectionResourceSchema =
  components['schemas']['MembershipCollectionResource'];

export type MemberResourceData = Omit<MemberResourceSchema, '_links'>;
export type MemberCollectionResourceData = Omit<
  MemberCollectionResourceSchema,
  '_links' | '_embedded'
>;
export type MembershipResourceData = Omit<MembershipResourceSchema, '_links'>;
export type MembershipCollectionResourceData = Omit<
  MembershipCollectionResourceSchema,
  '_links' | '_embedded'
>;

export type MemberResource = Entity<
  MemberResourceData,
  {
    self: MemberResource;
    collection: MemberCollectionResource;
    workspace: WorkspaceResource;
    user: UserResource;
  }
>;

export type MembershipResource = Entity<
  MembershipResourceData,
  {
    self: MemberResource;
    collection: MemberCollectionResource;
    workspace: WorkspaceResource;
    user: UserResource;
  }
>;

export type MembershipWorkspace = MembershipResourceData['workspace'];

export type MemberCollectionResource = Collection<MemberResource> &
  Entity<
    MemberCollectionResourceData,
    {
      self: MemberCollectionResource;
      workspace: WorkspaceResource;
      prev: MemberCollectionResource;
      next: MemberCollectionResource;
    }
  >;

export type MembershipCollectionResource = Collection<MembershipResource> &
  Entity<
    MembershipCollectionResourceData,
    {
      self: MembershipCollectionResource;
      user: UserResource;
      prev: MembershipCollectionResource;
      next: MembershipCollectionResource;
    }
  >;
