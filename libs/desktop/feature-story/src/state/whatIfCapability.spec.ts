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
      }).map((r) => r.id),
    ).toEqual([request.id, 'request.second']);
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
