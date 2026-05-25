import type { Entity } from '@hateoas-ts/resource';

export type HealthResource = Entity<
  {
    status: string;
    service: string;
  },
  {
    self: HealthResource;
  }
>;
