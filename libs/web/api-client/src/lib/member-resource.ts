import type { Entity } from '@hateoas-ts/resource';

import type { components } from './openapi-schema.js';

import type { UserResource } from './user-resource.js';
import type { WorkspaceResource } from './workspace-resource.js';

type MemberResourceSchema = components['schemas']['MemberResource'];
type MemberCollectionResourceSchema =
  components['schemas']['MemberCollectionResource'];

export type MemberResourceData = Omit<MemberResourceSchema, '_links'>;
export type MemberCollectionResourceData = Omit<
  MemberCollectionResourceSchema,
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

export type MemberCollectionResource = Entity<
  MemberCollectionResourceData,
  {
    self: MemberCollectionResource;
    workspace: WorkspaceResource;
  }
>;
