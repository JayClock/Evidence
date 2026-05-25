import type { Entity } from '@hateoas-ts/resource';

import type { HealthResource } from './health-resource.js';
import type { UserResource } from './user-resource.js';

export type RootResource = Entity<
  Record<string, never>,
  {
    self: RootResource;
    health: HealthResource;
    'default-user': UserResource;
  }
>;
