import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
} from '@asteasolutions/zod-to-openapi';
import { VALUE_TYPES } from '@evidence-poc/evidence-schema';
import { compileSchema } from '../schemas/jsonSchema.js';
import { valueSchemaFor, z } from './zodSchemas.js';

it('derives payload constraints from the FM vocabulary without tightening the HTTP boundary', () => {
  const registry = new OpenAPIRegistry();
  for (const type of VALUE_TYPES) registry.register(type, valueSchemaFor(type));
  registry.register(
    'requiredDynamic',
    z.object({ value: valueSchemaFor('dynamic') }),
  );
  const schemas = new OpenApiGeneratorV31(
    registry.definitions,
  ).generateComponents().components?.schemas;
  expect(schemas).toBeDefined();
  const check = (key: string, valid: unknown[], invalid: unknown[]) => {
    const { validate } = compileSchema(schemas![key]);
    for (const value of valid) expect(validate(value), key).toBe(true);
    for (const value of invalid) expect(validate(value), key).toBe(false);
  };
  check(
    'int',
    [Number.MIN_SAFE_INTEGER, '-9223372036854775808'],
    [Number.MIN_SAFE_INTEGER - 1, '-0', '1.5'],
  );
  check(
    'uint',
    [Number.MAX_SAFE_INTEGER, '18446744073709551615'],
    [Number.MAX_SAFE_INTEGER + 1, -1, '-1'],
  );
  check('decimal', [1.5], ['1.5']);
  check(
    'money',
    [{ minorUnits: 1, currency: 'CNY', note: 'extra' }],
    [{ minorUnits: 1, currency: '' }],
  );
  check('timestamp', ['2026-11-27T12:00:00+08:00'], ['2026-11-27']);
  check('list', [[null, 'a', { nested: true }]], [1]);
  check('map', [{ key: ['a'] }], [null, []]);
  check('requiredDynamic', [{ value: null }, { value: ['a'] }], [{}]);
});
