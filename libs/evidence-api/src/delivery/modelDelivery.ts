import type { DomainModelDocument } from '@evidence-poc/evidence-schema';
import { createDomainGraph } from '@evidence-poc/evidence-model-core';

import { compileSchema } from '../schemas/jsonSchema.js';
import { errorDiagnostic, type Diagnostic } from '../diagnostics.js';
import { weaveHypermedia, type HypermediaLink } from '../http/hateoasWeaver.js';
import {
  examplesForSchemas,
  generateDeliveryContract,
  methodOf,
  type DeliveryContract,
} from '../openapi/contractBuilder.js';
import {
  collectionName,
  schemaRoutesOf,
  summaryName,
} from '../openapi/contractSchemas.js';
import { componentName } from './schemaName.js';
import { buildDeliveryRoutes, type DeliveryRoute } from './routes.js';
import {
  buildDeliveryTopology,
  type DeliveryLink,
  type DeliveryService,
} from './topology.js';

export type { DeliveryContract } from '../openapi/contractBuilder.js';

/** Project the final routes without inventing addresses outside the model. */
export const buildDeliveryContract = (
  document: DomainModelDocument,
  routes: readonly DeliveryRoute[] = buildDeliveryRoutes(document),
  services: readonly DeliveryService[] = buildDeliveryTopology(document, routes)
    .services,
): DeliveryContract => generateDeliveryContract(document, routes, services);

const serviceSchemasOf = (
  openapi: DeliveryContract,
  owned: readonly DeliveryRoute[],
) => {
  const schemas: DeliveryContract['components']['schemas'] = {};
  const include = (name: string, description?: string) => {
    const schema = openapi.components.schemas[name];
    if (!schema) throw new Error(`API schema missing from aggregate: ${name}`);
    schemas[name] =
      description === undefined ? schema : { ...schema, description };
  };
  const { items, collections } = schemaRoutesOf(owned);
  for (const [ref, route] of items) include(componentName(ref), route.summary);
  const includeCollection = (ref: string) => {
    include(collectionName(ref));
    include(summaryName(ref)); // The only nested named component of a collection.
  };
  for (const ref of collections.keys()) includeCollection(ref);
  for (const route of owned) {
    for (const { status, entityRef } of route.responses) {
      if (status < 200 || status >= 300 || entityRef === undefined) continue;
      if (route.responseShape === 'collection' && !collections.has(entityRef))
        includeCollection(entityRef);
      else if (route.responseShape === 'item' && !items.has(entityRef))
        include(componentName(entityRef));
    }
  }
  return schemas;
};

/** A service view selects final operations; it does not re-address or re-weave them. */
export const serviceContractsOf = ({
  openapi,
  routes,
  services,
}: Pick<ModelDelivery, 'openapi' | 'routes' | 'services'>) => {
  const routesByService = new Map<string, DeliveryRoute[]>();
  for (const route of routes) {
    const owned = routesByService.get(route.serviceId) ?? [];
    owned.push(route);
    routesByService.set(route.serviceId, owned);
  }
  return services.flatMap((service) => {
    const owned = routesByService.get(service.id);
    if (owned === undefined) return [];
    const paths: DeliveryContract['paths'] = {};
    for (const route of owned) {
      const method = methodOf(route.method);
      const operation = openapi.paths[route.path]?.[method];
      if (operation === undefined)
        throw new Error(`API operation missing from aggregate: ${route.id}`);
      const entry = paths[route.path] ?? {};
      entry[method] = operation;
      paths[route.path] = entry;
    }
    const contract: DeliveryContract = {
      ...openapi,
      info: { ...openapi.info, title: service.name },
      'x-evidence-service': service.id,
      'x-evidence-services': openapi['x-evidence-services'].filter(
        ({ id }) => id === service.id,
      ),
      paths,
      components: {
        schemas: serviceSchemasOf(openapi, owned),
        examples: examplesForSchemas(owned),
      },
    };
    return [{ serviceId: service.id, contract }];
  });
};

/** Example facts must satisfy the same payload contract as a real response. */
export const validateDeliveryExamples = (
  contract: DeliveryContract,
  routes: readonly DeliveryRoute[],
): Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];
  for (const route of routes) {
    if (route.examples.length === 0) continue;
    const schema = compileSchema(
      contract.components.schemas[componentName(route.entityRef)],
    );
    for (const example of route.examples) {
      if (
        !schema.validate({
          ...example.value,
          _links: { self: { href: route.itemPath } },
        })
      )
        diagnostics.push(
          errorDiagnostic(
            'API_EXAMPLE_INVALID',
            `${example.label}: ${JSON.stringify(schema.errors())}`,
            route.entityRef,
          ),
        );
    }
  }
  return diagnostics;
};

/** The whole delivery, as one document a caller can write to disk. */
export interface ModelDelivery {
  schemaVersion: '1.0';
  modelId: string;
  modelName: string;
  modelVersion: string;
  routes: readonly DeliveryRoute[];
  hypermedia: readonly HypermediaLink[];
  services: readonly DeliveryService[];
  links: readonly DeliveryLink[];
  openapi: DeliveryContract;
  /** Things the model cannot answer, printed so the sketch is not read as a release. */
  limitations: readonly string[];
}

const limitationsOf = (
  document: DomainModelDocument,
  routes: readonly DeliveryRoute[],
): string[] => {
  const graph = createDomainGraph(document);
  const limitations: string[] = [];
  const withoutConfirmation = graph
    .fulfillmentPairs()
    .filter((pair) => pair.confirmations.length === 0);

  for (const pair of withoutConfirmation) {
    limitations.push(`${pair.request.id} 没有履约确认，未生成确认回调接口。`);
  }

  const derived = routes.flatMap((route) => route.derived);

  if (derived.length > 0) {
    limitations.push(
      `派生属性 ${derived.map((field) => field.name).join('、')} 需要服务端的规则运行时求值，本契约只声明其来源。`,
    );
  }

  return limitations;
};

/** Composes routes, topology, contract and deployment into one document. */
export const buildModelDelivery = (
  document: DomainModelDocument,
): ModelDelivery => {
  const routes = buildDeliveryRoutes(document);
  const topology = buildDeliveryTopology(document, routes);
  const services = topology.services;
  const openapi = buildDeliveryContract(document, routes, services);

  return {
    schemaVersion: '1.0',
    modelId: document.manifest.id,
    modelName: document.manifest.name,
    modelVersion: document.manifest.version,
    routes,
    hypermedia: weaveHypermedia(document, routes),
    services,
    links: topology.links,
    openapi,
    limitations: limitationsOf(document, routes),
  };
};
