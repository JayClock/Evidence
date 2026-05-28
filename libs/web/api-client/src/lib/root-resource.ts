import type { Entity } from '@hateoas-ts/resource';

import type { components } from './openapi-schema.js';

import type { HealthResource } from './health-resource.js';
import type { UserResource } from './user-resource.js';

type RootResourceSchema = components['schemas']['RootResource'];
export type RootResourceData = Omit<RootResourceSchema, '_links'>;

export type RootResource = Entity<
  RootResourceData,
  {
    self: RootResource;
    health: HealthResource;
    'default-user': UserResource;
  }
>;
