import { describe, expect, it } from 'vitest';
import {
  DomainCalculatorIntentSchema,
  FulfillmentPairIntentSchema,
  RoleifyConfirmationIntentSchema,
} from '../index.js';

const pair = {
  contextRef: 'context.procurement',
  request: {
    id: 'request.refund',
    label: 'Refund',
    responsibleRoleRef: 'role.buyer',
    window: '7 days',
  },
  confirmation: {
    id: 'confirmation.refund',
    label: 'Refunded',
    responsibleRoleRef: 'role.seller',
  },
  proof: { id: 'evidence.receipt', label: 'Receipt' },
};
const calculator = {
  host: {
    ref: 'request.payment',
    attribute: {
      name: 'total_amount',
      label: 'Total',
      meaning: 'computed from price',
      valueType: 'money',
    },
  },
  context: { id: 'context.pricing', label: 'Pricing' },
  calculator: {
    id: 'thing.calculator',
    label: 'Calculator',
    role: 'calculator',
  },
  rule: {
    id: 'rule.price',
    label: 'Price',
    description: 'Price',
    expression: '1',
    resultType: 'money',
    alias: 'calculator',
  },
};

describe('shared operator schemas', () => {
  it('preserves optional fields without adding defaults', () => {
    expect(FulfillmentPairIntentSchema.parse(pair)).toEqual(pair);
    expect(DomainCalculatorIntentSchema.parse(calculator)).toEqual(calculator);
  });
  it.each([
    {
      ...calculator,
      host: {
        ...calculator.host,
        attribute: { ...calculator.host.attribute, name: 'camelCase' },
      },
    },
    {
      ...calculator,
      host: {
        ...calculator.host,
        attribute: { ...calculator.host.attribute, valueType: 'number' },
      },
    },
    {
      ...calculator,
      calculator: { ...calculator.calculator, role: 'invented' },
    },
    { ...calculator, rule: { ...calculator.rule, alias: 'not-a-variable' } },
    { ...calculator, bindings: { 'bad-alias': { ref: 'request.payment' } } },
  ])('rejects values outside the shared AST vocabulary', (input) => {
    expect(DomainCalculatorIntentSchema.safeParse(input).success).toBe(false);
  });
  it('uses an existing confirmation and a new or existing socket', () => {
    const base = {
      targetConfirmationRef: 'confirmation.payment',
      providerConfirmationRef: 'confirmation.wallet',
    };
    for (const socket of [
      { mode: 'create', id: 'role.payment', label: '付款能力' },
      { mode: 'reuse', ref: 'role.payment' },
    ]) {
      expect(
        RoleifyConfirmationIntentSchema.parse({ ...base, socket }),
      ).toEqual({ ...base, socket });
      expect(
        RoleifyConfirmationIntentSchema.safeParse({
          ...base,
          socket,
          supporting: {},
        }).success,
      ).toBe(false);
    }
    expect(
      RoleifyConfirmationIntentSchema.safeParse({
        ...base,
        socket: { mode: 'reuse', label: '付款能力' },
      }).success,
    ).toBe(false);
  });
});
