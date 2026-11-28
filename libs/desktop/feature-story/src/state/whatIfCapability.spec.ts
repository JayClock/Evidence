import { describe, expect, it } from 'vitest';
import { createDomainGraph } from '@evidence-poc/evidence-model-core';
import { isFulfillmentRequest } from '@evidence-poc/evidence-schema';
import { createDesktopFixture } from '@evidence-poc/desktop-testing';
import { storyFlow, storySnapshot } from '@evidence-poc/desktop-testing/story';
import {
  blockedStoryScenes,
  evaluateWhatIfCapability,
  hasWhatIfBreach,
  promotableSceneRequests,
  requestsForProof,
} from './whatIfCapability';

const steps = storyFlow().steps;

describe('What-If capability', () => {
  it('freezes direct and transitive dependents and leaves independent scenes available', () => {
    const [contract, request, confirmation] =
      storySnapshot().selected!.projection.scenes;
    const scenes = [
      contract!,
      request!,
      confirmation!,
      { ...request!, stepIndex: 4 },
      {
        ...confirmation!,
        stepIndex: 5,
        prerequisites: [
          { ...confirmation!.prerequisites[0]!, previousStepIndex: 3 },
        ],
      },
    ];
    expect([...blockedStoryScenes(scenes, 2).keys()]).toEqual([3, 5]);
  });

  it('locates the causal request instance behind a supporting receipt', () => {
    const model = createDesktopFixture();
    const receipt = {
      type: 'entity',
      category: 'evidence',
      kind: 'other_evidence',
      id: 'evidence.receipt',
      label: '签收回执',
    } as const;
    model.entities.push(receipt);
    model.relationships.push({
      type: 'relationship',
      kind: 'references',
      id: 'relation.receipt',
      label: '签收依据',
      sourceRef: receipt.id,
      targetRef: 'evidence.confirmation',
    });
    const graph = createDomainGraph(model);
    const projection = storySnapshot().selected?.projection;
    if (!projection) throw new Error('Missing story fixture');
    const [contract, request, confirmation] = projection.scenes;
    const proof = {
      ...confirmation,
      stepIndex: 5,
      activity: {
        ...confirmation.activity,
        fulfillment: undefined,
        workObject: {
          entityId: receipt.id,
          entityKind: receipt.kind,
          entityLabel: receipt.label,
        },
      },
      prerequisites: [
        { ...confirmation.prerequisites[0], previousStepIndex: 3 },
      ],
    };
    const scenes = [
      contract,
      request,
      confirmation,
      { ...request, stepIndex: 4 },
      proof,
    ];
    expect(requestsForProof(graph, scenes, proof)).toEqual([
      {
        id: 'evidence.request',
        label: '交付请求（Delivery Request）',
        stepIndex: 2,
      },
    ]);
    const trial = {
      ...steps[2],
      sequence: 5,
      entityId: receipt.id,
      entityKind: receipt.kind,
      entityLabel: receipt.label,
      basedOn: ['evidence.confirmation#example-2'],
    };
    expect(
      evaluateWhatIfCapability(graph, [...steps, trial], trial).status,
    ).toBe('eligible');
  });
  it('uses the causal deadline and keeps the currency on a one-subunit shortfall', () => {
    const model = createDesktopFixture();
    const [contract, request, confirmation] = steps;
    const paid = 'received';
    const due = 'agreed';
    const graph = createDomainGraph(model);
    for (const [id, name] of [
      [confirmation!.entityId, paid],
      [request!.entityId, due],
    ] as const) {
      graph.getEntity(id)!.attributes!.push({
        name,
        label: name === paid ? '实收金额' : '约定金额',
        meaning: '以最小货币单位计',
        valueType: 'money',
      });
    }
    model.rules.push({
      ...model.rules[0]!,
      id: 'rule.shortfall',
      kind: 'breach',
      expression:
        'request.agreed.minorUnits > confirmation.received.minorUnits',
    });
    const receipt = {
      ...confirmation!,
      values: {
        [paid]: { minorUnits: 12000, currency: 'CNY' },
        confirmed_at: '2026-11-11T08:00:00Z',
      },
    };
    const enrichedSteps = [
      contract!,
      {
        ...request!,
        values: {
          [due]: { minorUnits: 10000, currency: 'CNY' },
          expired_at: '2026-11-12T08:00:00+08:00',
        },
      },
      receipt,
    ];
    expect(
      evaluateWhatIfCapability(graph, enrichedSteps, receipt),
    ).toMatchObject({
      status: 'eligible',
      challenges: expect.arrayContaining([
        expect.objectContaining({
          category: 'overdue',
          isFallback: true,
          hypothesisDraft: {
            asOf: '2026-11-13T00:00:00.000Z',
            values: { confirmed_at: '2026-11-13T00:00:00.000Z' },
          },
        }),
        expect.objectContaining({
          category: 'deficit',
          targetedRuleId: 'rule.shortfall',
          isFallback: true,
          hypothesisDraft: {
            values: { received: { minorUnits: 9999, currency: 'CNY' } },
          },
        }),
      ]),
    });
    expect(receipt.values.received.minorUnits).toBe(12000);
  });

  it('skips incomplete examples, derived inputs and comparisons that cannot satisfy the whole rule', () => {
    const model = createDesktopFixture();
    const graph = createDomainGraph(model);
    const receipt = { ...steps[2]!, values: { count: 100, unit_price: 10000 } };
    const fields = graph.getEntity(receipt.entityId)!.attributes!;
    fields.push(
      {
        name: 'count',
        label: '实付数量',
        meaning: '实付数量',
        valueType: 'int',
      },
      { name: 'unit_price', label: '单价', meaning: '单价', valueType: 'int' },
    );
    const rule = model.rules[0]!;
    rule.kind = 'breach';
    rule.expression = 'confirmation.count < 100 && false';
    const capability = () =>
      evaluateWhatIfCapability(graph, [...steps.slice(0, 2), receipt], receipt);
    expect(capability()).toEqual({ status: 'eligible', challenges: [] });
    rule.expression = 'confirmation.count < 100';
    expect(capability()).toMatchObject({
      challenges: [
        { category: 'deficit', hypothesisDraft: { values: { count: 99 } } },
      ],
    });
    expect(evaluateWhatIfCapability(graph, [receipt], receipt)).toEqual({
      status: 'eligible',
      challenges: [],
    });
    model.rules.push({
      ...rule,
      kind: 'derivation',
      id: 'rule.derived',
      expression: '100',
      resultType: 'int',
      target: { entityRef: receipt.entityId, attribute: 'count' },
    });
    expect(capability()).toEqual({ status: 'eligible', challenges: [] });
  });
  it('offers only the breached request on a shared confirmation and never treats a completion as a breach', () => {
    const model = createDesktopFixture();
    const request = model.entities.find(({ id }) => id === 'evidence.request')!;
    model.entities.push({ ...request, id: 'request.second' });
    const completion = model.rules[0]!;
    model.rules.push({
      ...completion,
      id: 'rule.second-breach',
      kind: 'breach',
      bindings: { request: { ref: 'request.second' } },
    });
    const graph = createDomainGraph(model);
    const shared = [request, { ...request, id: 'request.second' }];
    const ruleOutcome = {
      ruleId: completion.id,
      label: completion.label,
      kind: 'completion' as const,
      result: true,
    };
    const result = {
      isSpeculative: false as const,
      hypothesis: {},
      ruleOutcome,
      ruleOutcomes: [ruleOutcome],
      businessImpactExplanation: '完成条件成立',
    };
    expect(promotableSceneRequests(graph, shared, result)).toEqual([]);
    expect(
      promotableSceneRequests(graph, shared, {
        ...result,
        ruleOutcomes: [
          ...result.ruleOutcomes,
          {
            ruleId: 'rule.second-breach',
            label: '第二项违约条件',
            kind: 'breach' as const,
            result: true,
          },
        ],
      }).map((r) => r.id),
    ).toEqual(['request.second']);
    expect(
      promotableSceneRequests(graph, shared, {
        isSpeculative: true,
        ruleOutcomes: [],
        businessImpactExplanation: '待业务确认',
      }),
    ).toEqual([]);
  });
  it('requires direct bindings or a modeled confirmation-to-request pair', () => {
    const model = createDesktopFixture();
    model.rules[0]!.bindings = { request: { ref: 'evidence.request' } };
    expect(
      evaluateWhatIfCapability(createDomainGraph(model), steps, steps[2]!)
        .status,
    ).toBe('eligible');
    model.relationships = [];
    expect(
      evaluateWhatIfCapability(createDomainGraph(model), steps, steps[2]!)
        .status,
    ).toBe('missing_rules');
  });

  it('offers the request and its concrete overdue challenge when only the receipt is bound', () => {
    const model = createDesktopFixture();
    const [contract, request, confirmation] = steps;
    const current = {
      ...request!,
      values: { expired_at: '2026-11-12T08:00:00+08:00' },
    };
    const flow = [contract!, current, confirmation!];
    model.entities.find(isFulfillmentRequest)!.fulfillmentAction =
      '验收交付成果';
    const rule = model.rules[0]!;
    rule.bindings = {
      receipts: { ref: confirmation!.entityId, cardinality: 'many' },
    };
    rule.expression = 'receipts.exists(r, has(r.confirmed_at))';
    const graph = createDomainGraph(model);
    expect(evaluateWhatIfCapability(graph, flow, contract!)).toEqual({
      status: 'non_fulfillment_stage',
      next: { sequence: 2, entityLabel: '交付请求', hasRules: true },
    });
    expect(evaluateWhatIfCapability(graph, flow, current)).toMatchObject({
      status: 'eligible',
      challenges: [
        {
          category: 'overdue',
          targetedRuleId: rule.id,
          question: expect.stringContaining(
            '采购方（Buyer）仍未完成「验收交付成果」且未出具《交付确认（Delivery Confirmation）》',
          ),
          hypothesisDraft: { asOf: '2026-11-13T00:00:00.000Z' },
        },
      ],
    });
  });

  it('blocks only the request named by a verified completion gap', () => {
    const request = steps[1]!;
    const ruleOutcome = {
      ruleId: 'rule.delivery-completion',
      kind: 'completion' as const,
      label: '交付完成',
      result: false,
    };
    const incomplete = {
      isSpeculative: false as const,
      ruleOutcomes: [ruleOutcome],
      ruleOutcome,
      hypothesis: { asOf: request.asOf },
      businessImpactExplanation: '尚缺验收凭据。',
    };
    expect(hasWhatIfBreach(request, incomplete)).toBe(false);
    const overdue = {
      ...incomplete,
      hypothesis: { asOf: '2026-11-12T08:00:00Z' },
      completionGap: {
        requestId: request.entityId,
        ruleId: ruleOutcome.ruleId,
        deadline: request.asOf,
      },
    };
    expect(hasWhatIfBreach(request, overdue)).toBe(true);
    expect(
      hasWhatIfBreach({ ...request, entityId: 'request.second' }, overdue),
    ).toBe(false);
    expect(hasWhatIfBreach(steps[2]!, overdue)).toBe(false);
    expect(
      hasWhatIfBreach(request, {
        isSpeculative: true,
        ruleOutcomes: [],
        businessImpactExplanation: '验收可能延迟。',
      }),
    ).toBe(false);
  });

  it('does not count rules on the contract or offer a dead jump without another step', () => {
    const model = createDesktopFixture();
    model.rules[0]!.bindings = { contract: { ref: 'evidence.contract' } };
    const graph = createDomainGraph(model);
    expect(evaluateWhatIfCapability(graph, steps, steps[0]!)).toEqual({
      status: 'non_fulfillment_stage',
      next: { sequence: 2, entityLabel: '交付请求', hasRules: false },
    });
    expect(evaluateWhatIfCapability(graph, [steps[0]!], steps[0]!)).toEqual({
      status: 'non_fulfillment_stage',
    });
    expect(evaluateWhatIfCapability(graph, steps, steps[1]!).status).toBe(
      'missing_rules',
    );
  });
});
