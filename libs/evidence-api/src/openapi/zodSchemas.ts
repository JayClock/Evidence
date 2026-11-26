import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import {
  HTTP_VALUE_SCHEMAS,
  isValueType,
  type ValueType,
} from '@evidence-poc/evidence-schema';
import type { SchemaObject } from 'openapi3-ts/oas31';
import { z } from 'zod';

// Initialize Zod 3's extension here before applying metadata in this package.
extendZodWithOpenApi(z);
export { z };

const transportKeywords: Partial<Record<ValueType, SchemaObject>> = {
  bytes: { format: 'byte' },
  timestamp: { format: 'date-time' },
  date: { format: 'date' },
  map: { additionalProperties: true },
};

export const valueSchemaFor = (valueType: string): z.ZodType<unknown> => {
  // Invalid draft models can still be projected for diagnostics.
  const type = isValueType(valueType) ? valueType : 'string';
  const schema: z.ZodType<unknown> = HTTP_VALUE_SCHEMAS[type];
  const keywords = transportKeywords[type];
  return keywords === undefined ? schema : schema.openapi(keywords);
};
