import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
  type RouteConfig,
  type ZodMediaTypeObject,
  type ZodRequestBody,
} from '@asteasolutions/zod-to-openapi';
import type { DomainModelDocument } from '@evidence-poc/evidence-schema';
import type {
  ComponentsObject,
  ExampleObject,
  HeaderObject,
  OpenAPIObject,
  OperationObject,
  ParameterObject,
  ResponseObject,
} from 'openapi3-ts/oas31';

import type { DeliveryRoute, DeliveryRouteMethod } from '../delivery/routes.js';
import { componentName } from '../delivery/schemaName.js';
import type { DeliveryService } from '../delivery/topology.js';
import {
  halLinksFor,
  weaveHypermedia,
  type HypermediaLink,
} from '../http/hateoasWeaver.js';
import {
  collectionRelOf,
  registerSchemas,
  requestSchema,
} from './contractSchemas.js';

const methods = { GET: 'get', POST: 'post' } as const satisfies Record<
  DeliveryRouteMethod,
  RouteConfig['method']
>;
export const methodOf = (method: DeliveryRouteMethod) => methods[method];

type ContractPaths = Record<
  string,
  Partial<Record<ReturnType<typeof methodOf>, OperationObject>>
>;

export interface DeliveryContract extends OpenAPIObject {
  openapi: '3.1.0';
  info: { title: string; version: string; description: string };
  'x-evidence-model': string;
  'x-evidence-model-version': string;
  'x-evidence-service'?: string;
  'x-evidence-delivery-state'?: 'partial' | 'complete';
  'x-evidence-excluded-contexts'?: readonly string[];
  paths: ContractPaths;
  components: Required<Pick<ComponentsObject, 'schemas' | 'examples'>>;
  'x-evidence-services': readonly Pick<
    DeliveryService,
    'id' | 'kind' | 'contextRef' | 'routePrefixes' | 'routes'
  >[];
}

type RouteExtensions = {
  'x-evidence-purpose': DeliveryRoute['purpose'];
  'x-evidence-breach-branch'?: NonNullable<DeliveryRoute['breachBranch']>;
  'x-evidence-context': string;
  'x-evidence-entity': string;
  'x-evidence-service': string;
  'x-evidence-allowed-party-roles': readonly string[];
  'x-evidence-allowed-callback-roles'?: readonly string[];
  'x-evidence-exposure': DeliveryRoute['exposure'];
  'x-evidence-contract'?: string;
  'x-evidence-fulfillment-request'?: string;
  'x-evidence-fulfillment-requests'?: readonly string[];
  'x-evidence-fulfillment-confirmation'?: string;
  'x-evidence-derived': { name: string; ruleRef: string | null }[];
  'x-evidence-stamped': string[];
};

type HalMedia = ZodMediaTypeObject & {
  'x-evidence-link-templates': ReturnType<typeof halLinksFor>;
};

type ResponseConfig = Pick<ResponseObject, 'description' | 'headers'> & {
  content?: { 'application/hal+json': HalMedia };
};

const exampleKey = (route: DeliveryRoute, label: string, position: number) =>
  `${componentName(route.id)}_${componentName(label)}_${position + 1}`;

type ExampleValue = DeliveryRoute['examples'][number]['value'];

type ExampleEntries = [string, ExampleObject][];
const exampleEntries = (
  route: DeliveryRoute,
  project: (value: ExampleValue) => ExampleValue,
): ExampleEntries =>
  route.examples.map(({ label, description, value }, position) => [
    exampleKey(route, label, position),
    {
      summary: label,
      ...(description === undefined ? {} : { description }),
      value: project(value),
    },
  ]);

export const examplesForSchemas = (
  routes: readonly DeliveryRoute[],
): Record<string, ExampleObject> =>
  Object.fromEntries(
    routes.flatMap((route) =>
      route.id === `route.read.${route.entityRef}`
        ? exampleEntries(route, (value) => ({
            ...value,
            _links: { self: { href: route.itemPath } },
          }))
        : [],
    ),
  );

const pathParameters = (route: DeliveryRoute): ParameterObject[] =>
  Array.from(route.path.matchAll(/\{[^{}]+\}/g), ([token]) => ({
    name: token.slice(1, -1),
    in: 'path',
    required: true,
    schema: { type: 'string' },
  }));

const requestBody = (route: DeliveryRoute): ZodRequestBody => ({
  required: true,
  content: {
    'application/json': {
      schema: requestSchema(route),
      ...(route.examples.length === 0
        ? {}
        : {
            examples: Object.fromEntries(
              exampleEntries(route, (value) =>
                Object.fromEntries(
                  route.fields
                    .filter(({ name }) => Object.hasOwn(value, name))
                    .map(({ name }) => [name, value[name]]),
                ),
              ),
            ),
          }),
    },
  },
});

const responseValue = (
  route: DeliveryRoute,
  value: ExampleValue,
  links: ReturnType<typeof halLinksFor>,
): ExampleValue =>
  route.responseShape === 'collection'
    ? {
        _links: links,
        _embedded: {
          [collectionRelOf(route)]: [
            {
              ...value,
              _links: {
                self: {
                  href: route.itemPath,
                  templated: route.itemPath.includes('{'),
                },
              },
            },
          ],
        },
        total: 1,
      }
    : { ...value, _links: links };

const locationHeader = (
  route: DeliveryRoute,
  accepted: boolean,
): HeaderObject & { 'x-evidence-uri-template': string } => ({
  ...(accepted
    ? { description: '已受理请求的查询地址', required: true }
    : { description: '新凭证地址' }),
  schema: { type: 'string', format: 'uri-reference' },
  'x-evidence-uri-template': route.itemPath,
});

const operationOf = (
  route: DeliveryRoute,
  responseSchema: ReturnType<typeof registerSchemas>,
  links: readonly HypermediaLink[],
): RouteConfig &
  RouteExtensions & { responses: Record<string, ResponseConfig> } => ({
  method: methodOf(route.method),
  path: route.path,
  operationId: route.operationId,
  summary: route.summary,
  tags: [`context:${route.contextRef}`],
  'x-evidence-purpose': route.purpose,
  ...(route.breachBranch === undefined
    ? {}
    : { 'x-evidence-breach-branch': route.breachBranch }),
  'x-evidence-context': route.contextRef,
  'x-evidence-entity': route.entityRef,
  'x-evidence-service': route.serviceId,
  'x-evidence-allowed-party-roles': route.allowedPartyRoleRefs,
  ...(route.allowedCallbackRoleRefs === undefined
    ? {}
    : { 'x-evidence-allowed-callback-roles': route.allowedCallbackRoleRefs }),
  'x-evidence-exposure': route.exposure,
  ...(route.contractRef === null
    ? {}
    : { 'x-evidence-contract': route.contractRef }),
  ...(route.requestRef === null
    ? {}
    : { 'x-evidence-fulfillment-request': route.requestRef }),
  ...(route.requestRefs === undefined
    ? {}
    : { 'x-evidence-fulfillment-requests': route.requestRefs }),
  ...(route.confirmationRef === null
    ? {}
    : { 'x-evidence-fulfillment-confirmation': route.confirmationRef }),
  'x-evidence-derived': route.derived.map(({ name, ruleRef }) => ({
    name,
    ruleRef: ruleRef ?? null,
  })),
  'x-evidence-stamped': route.stamped.map(({ name }) => name),
  parameters: pathParameters(route),
  ...(route.method === 'POST' ? { request: { body: requestBody(route) } } : {}),
  responses: Object.fromEntries(
    route.responses.map(({ status, description, entityRef }) => [
      String(status),
      {
        description,
        ...(status === 201 || status === 202
          ? { headers: { Location: locationHeader(route, status === 202) } }
          : {}),
        ...(status >= 200 && status < 300 && entityRef !== undefined
          ? {
              content: {
                'application/hal+json': {
                  schema: responseSchema(entityRef, route.responseShape),
                  ...(route.examples.length === 0
                    ? {}
                    : {
                        examples: Object.fromEntries(
                          exampleEntries(route, (value) =>
                            responseValue(
                              route,
                              value,
                              halLinksFor(links, route.id),
                            ),
                          ),
                        ),
                      }),
                  'x-evidence-link-templates': halLinksFor(
                    links,
                    route.id,
                    true,
                  ),
                } satisfies HalMedia,
              },
            }
          : {}),
      } satisfies ResponseConfig,
    ]),
  ),
});

export const generateDeliveryContract = (
  document: DomainModelDocument,
  routes: readonly DeliveryRoute[],
  services: readonly DeliveryService[],
): DeliveryContract => {
  const registry = new OpenAPIRegistry();
  const responseSchema = registerSchemas(registry, routes);
  const links = weaveHypermedia(document, routes);
  for (const route of routes)
    registry.registerPath(operationOf(route, responseSchema, links));

  const info = {
    title: document.manifest.name,
    version: document.manifest.version,
    description: [
      '由履约模型直接投影的契约：每个路径对应一个业务凭证时刻。',
      '派生值由服务端计算，业务时间由服务端打点，调用方不能提交或回填。',
    ].join('\n'),
  };
  const { paths, components } = new OpenApiGeneratorV31(
    registry.definitions,
  ).generateDocument({ openapi: '3.1.0', info });
  return {
    openapi: '3.1.0',
    info,
    'x-evidence-model': document.manifest.id,
    'x-evidence-model-version': document.manifest.version,
    paths: paths ?? {},
    components: {
      schemas: components?.schemas ?? {},
      examples: examplesForSchemas(routes),
    },
    'x-evidence-services': services.map(
      ({ id, kind, contextRef, routePrefixes, routes: owned }) => ({
        id,
        kind,
        contextRef,
        routePrefixes,
        routes: owned,
      }),
    ),
  };
};
