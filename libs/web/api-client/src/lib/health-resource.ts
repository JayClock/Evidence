import type { Entity } from '@hateoas-ts/resource';

import type { components } from './openapi-schema.js';

type HealthResourceSchema = components['schemas']['HealthResource'];
export type HealthResourceData = Omit<HealthResourceSchema, '_links'>;

export type HealthResource = Entity<
  HealthResourceData,
  {
    self: HealthResource;
  }
>;
