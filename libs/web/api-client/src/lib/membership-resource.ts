import type { Collection, Entity } from '@hateoas-ts/resource';

import type { components } from './openapi-schema.js';

import type { UserResource } from './user-resource.js';
import type { WorkspaceResource } from './workspace-resource.js';

type MembershipResourceSchema = components['schemas']['MembershipResource'];
type MembershipCollectionResourceSchema =
  components['schemas']['MembershipCollectionResource'];
type WorkspaceMembershipResourceSchema =
  components['schemas']['WorkspaceMembershipResource'];
type WorkspaceMembershipCollectionResourceSchema =
  components['schemas']['WorkspaceMembershipCollectionResource'];

export type MembershipResourceData = Omit<MembershipResourceSchema, '_links'>;
export type MembershipCollectionResourceData = Omit<
  MembershipCollectionResourceSchema,
  '_links' | '_embedded'
>;
export type WorkspaceMembershipResourceData = Omit<
  WorkspaceMembershipResourceSchema,
  '_links'
>;
export type WorkspaceMembershipCollectionResourceData = Omit<
  WorkspaceMembershipCollectionResourceSchema,
  '_links' | '_embedded'
>;

export type MembershipResource = Entity<
  MembershipResourceData,
  {
    self: WorkspaceMembershipResource;
    collection: WorkspaceMembershipCollectionResource;
    workspace: WorkspaceResource;
    user: UserResource;
  }
>;

export type WorkspaceMembershipResource = Entity<
  WorkspaceMembershipResourceData,
  {
    self: WorkspaceMembershipResource;
    collection: WorkspaceMembershipCollectionResource;
    workspace: WorkspaceResource;
    user: UserResource;
  }
>;

export type MembershipWorkspace = MembershipResourceData['workspace'];

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

export type WorkspaceMembershipCollectionResource =
  Collection<WorkspaceMembershipResource> &
    Entity<
      WorkspaceMembershipCollectionResourceData,
      {
        self: WorkspaceMembershipCollectionResource;
        workspace: WorkspaceResource;
        prev: WorkspaceMembershipCollectionResource;
        next: WorkspaceMembershipCollectionResource;
      }
    >;
