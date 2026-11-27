import { describe, expect, it } from 'vitest';
import { createDomainGraph } from '@evidence-poc/evidence-model-core';
import { createDesktopFixture } from '@evidence-poc/desktop-testing';
import { storyFlow } from '@evidence-poc/desktop-testing/story';
import {
  evaluateWhatIfCapability,
  promotableSceneRequests,
} from './whatIfCapability';

const steps = storyFlow().steps;

describe('What-If capability', () => {
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
    const ruleOutcome = { ruleId: completion.id, result: true };
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
          { ruleId: 'rule.second-breach', result: true },
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

  it('recommends the next step with matching rules before steps without rules', () => {
    const model = createDesktopFixture();
    model.rules[0]!.bindings = {
      confirmation: { ref: 'evidence.confirmation' },
    };
    expect(
      evaluateWhatIfCapability(createDomainGraph(model), steps, steps[0]!),
    ).toEqual({
      status: 'non_fulfillment_stage',
      next: { sequence: 3, entityLabel: '交付确认', hasRules: true },
    });
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
