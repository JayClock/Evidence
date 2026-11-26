import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import type { SchemaObject } from 'openapi3-ts/oas31';
import type { DeliveryField, DeliveryRoute } from '../delivery/routes.js';
import { SHARED_REQUEST_IDS } from '../delivery/routes.js';
import { componentName } from '../delivery/schemaName.js';
import { valueSchemaFor, z } from './zodSchemas.js';

type Shape = Record<string, z.ZodType<unknown>>;
type FieldExtensions = {
  'x-evidence-origin'?: DeliveryField['reason'];
  'x-evidence-caller-input': boolean;
  'x-evidence-rule'?: string;
  'x-evidence-derived-by-rule'?: string;
};

const withFieldMetadata = (
  field: DeliveryField,
  schema: z.ZodType<unknown>,
  keywords: FieldExtensions & Pick<SchemaObject, 'readOnly'>,
) => schema.openapi({ description: field.meaning, ...keywords });

const fieldSchema = (field: DeliveryField) =>
  withFieldMetadata(field, valueSchemaFor(field.valueType), {
    'x-evidence-origin': field.reason,
    'x-evidence-caller-input': field.reason === 'caller',
    ...(field.reason === 'caller' ? {} : { readOnly: true }),
    ...(field.ruleRef === undefined
      ? {}
      : {
          'x-evidence-rule': field.ruleRef,
          'x-evidence-derived-by-rule': field.ruleRef,
        }),
  });

const halLink = z.object({
  href: z.string(),
  templated: z.boolean().optional(),
  method: z.string().optional(),
});
// HAL permits arbitrary relation names; every value, including self, is a link.
const halLinks = z
  .record(halLink)
  .refine((links) => Object.hasOwn(links, 'self'))
  .openapi({ required: ['self'] });

export const requestSchema = (route: DeliveryRoute) => {
  const shape: Shape = Object.fromEntries(
    route.fields.map((field) => {
      const base =
        route.requestRefs !== undefined && field.name === SHARED_REQUEST_IDS
          ? z
              .array(z.string().min(1))
              .min(1)
              .refine((ids) => new Set(ids).size === ids.length)
              .openapi({ uniqueItems: true })
          : valueSchemaFor(field.valueType);
      const schema = withFieldMetadata(field, base, {
        'x-evidence-caller-input': true,
      });
      return [field.name, field.required ? schema : schema.optional()];
    }),
  );
  return z.object(shape).strict();
};

/** Retain the same representative for each entity and collection as the public projection. */
export const schemaRoutesOf = (routes: readonly DeliveryRoute[]) => {
  const items = new Map<string, DeliveryRoute>();
  const collections = new Map<string, DeliveryRoute>();
  for (const route of routes) {
    items.set(route.entityRef, route);
    if (route.responseShape === 'collection')
      collections.set(route.entityRef, route);
  }
  return { items, collections };
};

export const collectionName = (ref: string) =>
  `${componentName(ref)}Collection`;
export const summaryName = (ref: string) => `${componentName(ref)}Summary`;

export const collectionRelOf = (route: DeliveryRoute): string => {
  if (route.collectionRel === undefined)
    throw new Error(`Missing collection relation: ${route.id}`);
  return route.collectionRel;
};

export const registerSchemas = (
  registry: OpenAPIRegistry,
  routes: readonly DeliveryRoute[],
) => {
  const { items, collections } = schemaRoutesOf(routes);
  const itemSchemas = new Map<string, z.ZodType<unknown>>();
  const collectionSchemas = new Map<string, z.ZodType<unknown>>();
  for (const [ref, route] of items) {
    const fields = route.outputFields
      .filter(({ name }) => name !== '_links')
      .map((field) => [field, fieldSchema(field)] as const);
    const shape: Shape = Object.fromEntries(
      fields.map(([field, schema]) => [
        field.name,
        field.required ? schema : schema.optional(),
      ]),
    );
    const item = z
      .object({ ...shape, _links: halLinks })
      .strict()
      .openapi({
        description: route.summary,
        ...(route.examples.length === 0
          ? {}
          : {
              examples: route.examples.map(({ value }) => ({
                ...value,
                _links: { self: { href: route.itemPath } },
              })),
            }),
      });
    itemSchemas.set(ref, registry.register(componentName(ref), item));

    const collectionRoute = collections.get(ref);
    if (!collectionRoute) continue;
    const rel = collectionRelOf(collectionRoute);
    const requiredIds = new Set(
      collectionRoute.outputFields
        .filter((field) => field.valueType === 'id' && field.required)
        .map((field) => field.name),
    );
    const summaryShape: Shape = Object.fromEntries(
      fields.map(([field, schema]) => [
        field.name,
        requiredIds.has(field.name) ? schema : schema.optional(),
      ]),
    );
    const summary = registry.register(
      summaryName(ref),
      z.object({ _links: halLinks, ...summaryShape }).strict(),
    );
    const collection = z
      .object({
        _links: halLinks,
        _embedded: z.object({ [rel]: z.array(summary) }).strict(),
        total: z.number().int().min(0),
      })
      .strict();
    collectionSchemas.set(
      ref,
      registry.register(collectionName(ref), collection),
    );
  }
  return (
    ref: string,
    shape: DeliveryRoute['responseShape'],
  ): z.ZodType<unknown> => {
    const resolved = (
      shape === 'collection' ? collectionSchemas : itemSchemas
    ).get(ref);
    if (!resolved)
      throw new Error(`Missing response schema: ${ref} (${shape})`);
    return resolved;
  };
};
