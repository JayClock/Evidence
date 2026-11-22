import { describe, expect, it } from 'vitest';

import { strictValidateDomainModel } from '@evidence-poc/evidence-schema';

import {
  introduceFulfillmentPairMutator,
  isolateDomainCalculatorMutator,
  roleifyAndInvertDependencyMutator,
  type FulfillmentPairIntent,
} from './operators.js';
import { runMutation } from '../testing/runMutation.js';
import { createProcurementModel } from '../testing/modelFixture.js';

const pairIntent = (
  overrides: Partial<FulfillmentPairIntent> = {},
): FulfillmentPairIntent => ({
  contextRef: 'context.procurement',
  request: {
    id: 'request.refund',
    label: '退款申请',
    responsibleRoleRef: 'role.buyer',
    window: '3 个工作日',
  },
  confirmation: {
    id: 'confirmation.refund',
    label: '退款到账确认',
    responsibleRoleRef: 'role.seller',
  },
  ...overrides,
});

describe('introduceFulfillmentPair', () => {
  it('writes a request, a confirmation and the reference to the root contract', () => {
    const model = createProcurementModel();
    const intent = pairIntent();
    const patch = runMutation(model, (draft) =>
      introduceFulfillmentPairMutator(draft, intent),
    );
    const { document } = patch;

    expect(patch.result.createdIds).toEqual([
      'request.refund',
      'confirmation.refund',
    ]);
    expect(
      document.entities.find((entity) => entity.id === 'request.refund'),
    ).toMatchObject({
      category: 'evidence',
      kind: 'fulfillment_request',
      contextRef: 'context.procurement',
      responsibleRoleRef: 'role.buyer',
    });
    expect(
      document.entities.find((entity) => entity.id === 'confirmation.refund'),
    ).toMatchObject({
      kind: 'fulfillment_confirmation',
      responsibleRoleRef: 'role.seller',
    });
    expect(
      document.relationships.some(
        (relationship) =>
          relationship.sourceRef === 'request.refund' &&
          relationship.targetRef === 'contract.procurement',
      ),
    ).toBe(true);
    expect(
      document.rules.some(
        (rule) =>
          rule.kind === 'completion' &&
          Object.values(rule.bindings).some(
            (binding) => 'ref' in binding && binding.ref === 'request.refund',
          ),
      ),
    ).toBe(true);
  });

  it('models the mandatory business time instead of leaving it to the caller', () => {
    const patch = runMutation(createProcurementModel(), (draft) =>
      introduceFulfillmentPairMutator(draft, pairIntent()),
    );
    expect(
      patch.document.entities
        .find((entity) => entity.id === 'request.refund')
        ?.attributes?.map((item) => item.name),
    ).toEqual(['started_at', 'expired_at']);
    expect(
      patch.document.entities
        .find((entity) => entity.id === 'confirmation.refund')
        ?.attributes?.map((item) => item.name),
    ).toEqual(['confirmed_at']);
  });

  it('keeps the proof as its own evidence and links it to the confirmation', () => {
    const model = createProcurementModel();
    const patch = runMutation(model, (draft) =>
      introduceFulfillmentPairMutator(
        draft,
        pairIntent({
          proof: { id: 'evidence.refund-receipt', label: '退款水单' },
        }),
      ),
    );
    const { document } = patch;

    expect(patch.result.createdIds).toEqual([
      'evidence.refund-receipt',
      'request.refund',
      'confirmation.refund',
    ]);
    expect(
      document.entities.find(
        (entity) => entity.id === 'evidence.refund-receipt',
      ),
    ).toMatchObject({
      kind: 'other_evidence',
      responsibleRoleRef: 'role.seller',
    });
    expect(
      document.relationships.some(
        (relationship) =>
          relationship.sourceRef === 'confirmation.refund' &&
          relationship.targetRef === 'evidence.refund-receipt',
      ),
    ).toBe(true);
  });

  it('refuses a context it cannot name', () => {
    expect(() =>
      runMutation(createProcurementModel(), (draft) =>
        introduceFulfillmentPairMutator(
          draft,
          pairIntent({ contextRef: 'context.unknown' }),
        ),
      ),
    ).toThrow("未知的上下文 'context.unknown'");
  });

  it('rejects a context with no single root contract atomically', () => {
    const model = createProcurementModel();
    const detached = {
      ...model,
      entities: model.entities.map((entity) =>
        entity.id === 'context.procurement'
          ? { ...entity, rootRefs: [] }
          : entity,
      ),
    };
    expect(() =>
      runMutation(detached, (draft) =>
        introduceFulfillmentPairMutator(draft, pairIntent()),
      ),
    ).toThrow(/requires exactly one root Contract/);
  });
});

describe('roleifyAndInvertDependency', () => {
  const setup = () => {
    const model = createProcurementModel();
    for (const name of ['wallet', 'credit']) {
      const contextRef = `context.${name}`;
      model.entities.push(
        {
          type: 'entity',
          category: 'context',
          kind: 'contract',
          id: contextRef,
          label: name,
        },
        {
          type: 'entity',
          category: 'evidence',
          kind: 'fulfillment_confirmation',
          id: `confirmation.${name}`,
          label: name,
          contextRef,
        },
      );
      model.relationships.push({
        type: 'relationship',
        kind: 'references',
        id: `relation.payment-uses-${name}`,
        sourceRef: 'confirmation.payment',
        targetRef: `confirmation.${name}`,
        label: name,
      });
    }
    return model;
  };
  const targetConfirmationRef = 'confirmation.payment';
  const roleId = 'role.payment-capability';
  const createSocket = {
    mode: 'create',
    id: roleId,
    label: '付款能力',
  } as const;

  it('replaces only the chosen direct reference and reuses the provider confirmation', () => {
    const model = setup();
    const patch = runMutation(model, (draft) =>
      roleifyAndInvertDependencyMutator(draft, {
        targetConfirmationRef,
        providerConfirmationRef: 'confirmation.wallet',
        socket: createSocket,
      }),
    );
    expect(patch.document.entities).toHaveLength(model.entities.length + 1);
    expect(
      patch.document.entities.find(({ id }) => id === roleId),
    ).toMatchObject({
      category: 'role',
      kind: 'evidence',
      contextRef: 'context.procurement',
    });
    expect(patch.document.relationships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'references',
          sourceRef: targetConfirmationRef,
          targetRef: roleId,
        }),
        expect.objectContaining({
          kind: 'plays_role',
          sourceRef: 'confirmation.wallet',
          targetRef: roleId,
        }),
        expect.objectContaining({ id: 'relation.payment-uses-credit' }),
      ]),
    );
    expect(
      patch.document.relationships.some(
        ({ id }) => id === 'relation.payment-uses-wallet',
      ),
    ).toBe(false);
    expect(strictValidateDomainModel(patch.document).issues).toEqual([]);
    expect(patch.undo()).toStrictEqual(model);
  });

  it('adds a second confirmed provider to the same socket without duplicating the consumer link', () => {
    const patch = runMutation(setup(), (draft) => {
      roleifyAndInvertDependencyMutator(draft, {
        targetConfirmationRef,
        providerConfirmationRef: 'confirmation.wallet',
        socket: createSocket,
      });
      return roleifyAndInvertDependencyMutator(draft, {
        targetConfirmationRef,
        providerConfirmationRef: 'confirmation.credit',
        socket: { mode: 'reuse', ref: roleId },
      });
    });
    const links = patch.document.relationships.filter(
      ({ targetRef }) => targetRef === roleId,
    );
    expect(links.filter(({ kind }) => kind === 'references')).toHaveLength(1);
    expect(
      links
        .filter(({ kind }) => kind === 'plays_role')
        .map(({ sourceRef }) => sourceRef),
    ).toEqual(['confirmation.wallet', 'confirmation.credit']);
  });

  it.each([
    ['request.payment', '需要两张真实的履约确认'],
    ['confirmation.payment', '不同的合同上下文'],
    ['confirmation.absent', 'confirmation.absent'],
  ])('rejects an invalid provider (%s)', (providerConfirmationRef, message) => {
    expect(() =>
      runMutation(setup(), (draft) =>
        roleifyAndInvertDependencyMutator(draft, {
          targetConfirmationRef,
          providerConfirmationRef,
          socket: createSocket,
        }),
      ),
    ).toThrow(message);
  });
});

const calculatorIntent = (overrides: Record<string, unknown> = {}) => ({
  host: {
    ref: 'request.payment',
    attribute: {
      name: 'service_fee',
      label: '服务费',
      meaning: '按协议费率与请求金额派生的服务费',
      valueType: 'money' as const,
      required: true,
      keyData: true,
    },
  },
  context: { id: 'context.fee-rules', label: '费率规则上下文' },
  calculator: {
    id: 'thing.fee-calculator',
    label: '服务费计算器',
    meaning: '按协议费率计算服务费',
    attributes: [
      {
        name: 'rate',
        label: '费率',
        meaning: '协议约定的服务费率',
        valueType: 'decimal' as const,
        required: true,
        keyData: true,
      },
    ],
  },
  rule: {
    id: 'rule.service-fee',
    label: '服务费派生',
    description: '服务费 = 请求金额 × 协议费率',
    expression: 'host.requested_minor_units * calculator.rate',
    resultType: 'money' as const,
  },
  ...overrides,
});

describe('isolateDomainCalculator', () => {
  it('creates the Domain Context, the component and the derivation together', () => {
    const model = createProcurementModel();
    const patch = runMutation(model, (draft) =>
      isolateDomainCalculatorMutator(draft, calculatorIntent()),
    );
    const { document } = patch;

    expect(patch.result.createdIds).toEqual([
      'context.fee-rules',
      'thing.fee-calculator',
      'request.payment.service_fee',
      'rule.service-fee',
    ]);
    expect(
      document.entities.find((entity) => entity.id === 'context.fee-rules'),
    ).toMatchObject({ kind: 'domain', rootRefs: ['thing.fee-calculator'] });
    expect(
      document.entities.find((entity) => entity.id === 'thing.fee-calculator'),
    ).toMatchObject({
      category: 'participant',
      kind: 'thing',
      domainRole: 'calculator',
      contextRef: 'context.fee-rules',
    });
  });

  it('binds both sides of the link the static check demands', () => {
    const model = createProcurementModel();
    const { document } = runMutation(model, (draft) =>
      isolateDomainCalculatorMutator(draft, calculatorIntent()),
    );
    const request = document.entities.find(
      (entity) => entity.id === 'request.payment',
    );

    expect(
      request?.attributes?.find(
        (attribute) => attribute.name === 'service_fee',
      ),
    ).toMatchObject({ derivedByRuleRef: 'rule.service-fee' });
    expect(
      document.rules.find((rule) => rule.id === 'rule.service-fee'),
    ).toMatchObject({
      contextRef: 'context.procurement',
      target: { entityRef: 'request.payment', attribute: 'service_fee' },
    });
  });

  it('keeps the resulting model free of static FM issues', () => {
    const model = createProcurementModel();
    const { document } = runMutation(model, (draft) =>
      isolateDomainCalculatorMutator(draft, calculatorIntent()),
    );

    expect(strictValidateDomainModel(document).issues).toEqual([]);
  });

  it('reuses a Domain Context that already exists instead of creating a second', () => {
    const model = createProcurementModel();
    const patch = runMutation(model, (draft) =>
      isolateDomainCalculatorMutator(draft, {
        ...calculatorIntent(),
        context: { id: 'context.catalogue', label: '商品目录上下文' },
      }),
    );

    expect(patch.result.createdIds).not.toContain('context.catalogue');
  });

  it('adds an attribute that the host does not carry yet', () => {
    const model = createProcurementModel();
    const patch = runMutation(model, (draft) =>
      isolateDomainCalculatorMutator(draft, {
        ...calculatorIntent(),
        host: {
          ref: 'confirmation.payment',
          attribute: {
            name: 'net_amount',
            label: '实收金额',
            meaning: '扣费后的实收金额',
            valueType: 'money' as const,
            required: true,
            keyData: true,
          },
        },
        rule: {
          id: 'rule.net-amount',
          label: '实收金额派生',
          description: '实收金额 = 请求金额 × 费率',
          expression: 'host.requested_minor_units * calculator.rate',
          resultType: 'money' as const,
        },
      }),
    );

    expect(
      patch.document.entities
        .find((entity) => entity.id === 'confirmation.payment')
        ?.attributes?.some((attribute) => attribute.name === 'net_amount'),
    ).toBe(true);
  });

  it('refuses to overwrite a value that is already derived', () => {
    const model = createProcurementModel();
    const request = model.entities.find(
      (entity) => entity.id === 'request.payment',
    );

    if (request?.category !== 'evidence') {
      throw new Error('fixture changed');
    }

    request.attributes?.push({
      name: 'already_derived',
      label: '已有派生',
      meaning: '已经由规则写入',
      valueType: 'int',
      derivedByRuleRef: 'rule.existing',
    });

    expect(() =>
      runMutation(model, (draft) =>
        isolateDomainCalculatorMutator(draft, {
          ...calculatorIntent(),
          host: {
            ref: 'request.payment',
            attribute: {
              name: 'already_derived',
              label: '已有派生',
              meaning: '已经由规则写入',
              valueType: 'int',
            },
          },
        }),
      ),
    ).toThrow('已有派生规则');
  });

  it('refuses a context that is not a Domain Context', () => {
    expect(() =>
      runMutation(createProcurementModel(), (draft) =>
        isolateDomainCalculatorMutator(draft, {
          ...calculatorIntent(),
          context: { id: 'context.procurement', label: '采购上下文' },
        }),
      ),
    ).toThrow('不是领域上下文');
  });
});
