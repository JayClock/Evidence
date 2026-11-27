import { fileURLToPath } from 'node:url';

import {
  buildFmCheckReport,
  collectFlowScenarios,
  buildDeterministicFallbackChallenges,
  createDomainGraph,
  whatIfDecisionRules,
} from '@evidence-poc/evidence-model-core';
import { readModelDirectory } from '@evidence-poc/evidence-model-io';
import { describe, expect, it, vi } from 'vitest';

import {
  createFlowStoryProjector,
  createStoryNarrator,
  projectStoryFacts,
  simulateWhatIf,
  WHAT_IF_CHALLENGE_SUGGESTION_PROMPT,
} from '../index.js';

const acceptanceModel = async (name: string) => {
  const { document, issues } = await readModelDirectory(
    fileURLToPath(
      new URL(
        `../../../evidence-model-core/tests/fixtures/acceptance/${name}/.evidence/model`,
        import.meta.url,
      ),
    ),
  );
  expect(issues).toEqual([]);
  return document;
};

describe('M1 trace to M2 story integration', () => {
  it('keeps the annual target fixed and tests the actual receipt and derived deadline using CEL', async () => {
    const { document: model } = await readModelDirectory(
      fileURLToPath(
        new URL(
          '../../../../examples/shared-settlement/.evidence/model',
          import.meta.url,
        ),
      ),
    );
    const annual = model.rules.find(
      ({ id }) => id === 'rule.request.annual-target-completed',
    )!;
    model.rules.push({
      ...annual,
      id: 'rule.annual-shortfall',
      kind: 'breach',
      expression:
        'results.exists(c, request.target_amount_minor > c.amount_minor)',
    });
    const graph = createDomainGraph(model);
    const flow = collectFlowScenarios(model)[0]!;
    const cardsFor = (entityId: string) => {
      const step = flow.steps.find((step) => step.entityId === entityId)!;
      return buildDeterministicFallbackChallenges(
        graph,
        flow.steps,
        step,
        whatIfDecisionRules(graph, entityId),
      );
    };
    const requestCards = cardsFor('request.annual-target');
    expect(requestCards).toMatchObject([
      {
        category: 'overdue',
        hypothesisDraft: { asOf: '2027-01-03T09:00:00.000Z' },
      },
    ]);
    expect(requestCards[0]?.hypothesisDraft?.values).toBeUndefined();
    const request = flow.steps.find(
      (step) => step.entityId === 'request.annual-target',
    )!;
    const scene = projectStoryFacts(flow, model).scenes.find(
      (scene) => scene.stepIndex === request.sequence,
    )!;
    const suggestion = {
      id: 'lower',
      category: 'deficit',
      label: '下调指标',
      question: '如果年度指标降到 2500 万，会怎样？',
      targetedRuleId: annual.id,
      hypothesisDraft: { values: { target_amount_minor: 25_000_000 } },
    };
    const overdue = {
      id: 'overdue',
      category: 'overdue',
      label: '逾期三天',
      question: '如果年度指标到期三天后仍未入账，会怎样？',
      targetedRuleId: annual.id,
      hypothesisDraft: { asOf: '2027-01-05T09:00:00Z' },
    };
    const narrator = createStoryNarrator({
      agent: {
        generate: async ({ systemPrompt }) =>
          systemPrompt === WHAT_IF_CHALLENGE_SUGGESTION_PROMPT
            ? {
                challenges: [
                  suggestion,
                  {
                    ...overdue,
                    id: 'early',
                    question: '如果明天仍未入账？',
                    hypothesisDraft: { asOf: '2026-01-03T09:00:00Z' },
                  },
                  overdue,
                ],
              }
            : { headline: '年度收入考核', prose: '约定年度收入指标。' },
      },
    });
    expect(
      (
        await narrator.enrichStep(scene, [], {
          flowId: flow.flowId,
          challengeSource: { graph, steps: flow.steps, current: request },
        })
      )?.challenges,
    ).toEqual([overdue]);
    const receipt = flow.steps.find(
      (step) => step.entityId === 'confirmation.revenue',
    )!;
    const cards = cardsFor(receipt.entityId);
    const deficit = cards.find((card) => card.category === 'deficit')!;
    expect(deficit).toMatchObject({
      targetedRuleId: 'rule.annual-shortfall',
      isFallback: true,
      hypothesisDraft: { values: { amount_minor: 49_999_999 } },
    });
    expect(
      cards.find((card) => card.category === 'overdue')?.hypothesisDraft
        ?.values,
    ).toEqual({ confirmed_at: '2027-01-03T09:00:00.000Z' });
    const result = await simulateWhatIf(
      {
        model,
        flow,
        currentStepSequence: receipt.sequence,
        hypothesisQuestion: deficit.question,
        hypothesis: deficit.hypothesisDraft,
        ruleId: deficit.targetedRuleId,
      },
      {
        agent: {
          generate: async () => ({
            businessImpactExplanation: '年度入账金额未达标。',
          }),
        },
      },
    );
    expect(result.ruleOutcome).toEqual({
      ruleId: 'rule.annual-shortfall',
      result: true,
    });
  });
  it.each(['procurement', 'procurement-deposit'])(
    'projects %s and regenerates the edited request against its history',
    async (name) => {
      const model = await acceptanceModel(name);
      const { report } = buildFmCheckReport({ model });
      const flows = collectFlowScenarios(model, report);
      const generate = vi.fn().mockResolvedValue({
        headline: '核对业务凭证',
        prose: '核对业务凭证。',
      });
      const projector = createFlowStoryProjector({ agent: { generate } });
      for (const flow of flows) {
        const projection = await projector.project(flow, model);
        expect(projection.scenes).toHaveLength(flow.steps.length);
        expect(projection.scenes.map(({ stepHash }) => stepHash)).toEqual(
          flow.steps.map(({ stepHash }) => stepHash),
        );
        for (const [index, scene] of projection.scenes.entries()) {
          expect(
            [
              ...scene.documentCard.keyAttributes,
              ...scene.documentCard.generalAttributes,
            ]
              .map(({ name }) => name)
              .sort(),
          ).toEqual(Object.keys(flow.steps[index]!.values).sort());
          expect(scene.expectation?.isControlGap ?? false).toBe(
            flow.steps[index]!.gaps.length > 0 &&
              !scene.activity.rejectedExample,
          );
        }
      }
      const initialCalls = generate.mock.calls.length;
      expect(initialCalls).toBe(
        flows.reduce((count, flow) => count + flow.steps.length, 0),
      );
      model.entities.find(
        ({ id }) => id === 'request.payment',
      )!.examples![0]!.value.quantity = 12;
      const nextReport = buildFmCheckReport({ model }).report;
      for (const flow of collectFlowScenarios(model, nextReport))
        await projector.project(flow, model);
      expect(generate).toHaveBeenCalledTimes(initialCalls + 1);
    },
  );

  it('runs native derivations and a deadline decision on a real declared payment trace', async () => {
    const model = await acceptanceModel('procurement');
    model.rules.push({
      type: 'rule',
      id: 'rule.late-payment',
      kind: 'breach',
      label: '付款逾期',
      description: '晚于付款请求约定时间付款',
      contextRef: 'context.procurement',
      bindings: {
        payment: { ref: 'confirmation.payment' },
        request: { ref: 'request.payment' },
      },
      expression:
        'payment.confirmed_at > request.expired_at && payment.total_amount > 0.0',
      resultType: 'bool',
    });
    const flow = collectFlowScenarios(model)[0]!;
    const current = flow.steps.find(
      ({ exampleLabel }) => exampleLabel === 'confirmed',
    )!;
    const generate = vi.fn().mockResolvedValue({
      businessImpactExplanation:
        '本次付款超过合同约定的付款期限，触发逾期判定。',
    });
    const result = await simulateWhatIf(
      {
        model,
        flow,
        currentStepSequence: current.sequence,
        hypothesisQuestion: '如果4月2日才付款会怎样？',
        hypothesis: {
          asOf: '2026-04-02T10:00:00Z',
          values: { confirmed_at: '2026-04-02T10:00:00Z' },
        },
      },
      { agent: { generate } },
    );
    expect(result.ruleOutcome).toEqual({
      ruleId: 'rule.late-payment',
      result: true,
    });
    expect(
      JSON.parse(generate.mock.calls[0]![0].userPrompt).currentValues
        .total_amount,
    ).toBe(500);
  });
});
