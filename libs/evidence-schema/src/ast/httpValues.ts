import { z } from 'zod';
import type { ValueType } from './values.js';

/** JSON payload shapes for FM value types at the HTTP boundary, not AST nodes.
 * CEL evaluation can impose additional constraints (such as int64 range on text).
 */
export const HTTP_VALUE_SCHEMAS = {
  bool: z.boolean(),
  int: z.union([
    z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER),
    z.string().regex(/^(?:0|-?[1-9][0-9]*)$/),
  ]),
  uint: z.union([
    z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    z.string().regex(/^(?:0|[1-9][0-9]*)$/),
  ]),
  double: z.number().finite(),
  decimal: z.number().finite(),
  money: z
    .object({ minorUnits: z.number().int(), currency: z.string().min(1) })
    .passthrough(),
  string: z.string(),
  bytes: z.string(),
  timestamp: z.string(),
  date: z.string(),
  duration: z.string(),
  id: z.string(),
  enum: z.string(),
  list: z.array(z.unknown()),
  map: z.record(z.unknown()),
  // A required dynamic field accepts any JSON value, but must still be present.
  dynamic: z.unknown().refine((value) => value !== undefined),
} satisfies Record<ValueType, z.ZodTypeAny>;
