export * from './lib/api-client.js';
export * from './lib/api-types.js';
export * from './lib/openapi-client.js';
export type { components, operations, paths } from './lib/openapi-schema.js';
export {
  ResourceProvider,
  useClient,
  useResource,
} from '@hateoas-ts/resource-react';
export type {
  Action,
  Collection,
  Entity,
  Link,
  State,
} from '@hateoas-ts/resource';
