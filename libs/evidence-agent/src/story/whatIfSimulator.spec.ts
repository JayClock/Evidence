import { describe, expect, it, vi } from 'vitest';

import {
  WHAT_IF_EXPLANATION_PROMPT,
  WHAT_IF_EXTRACTION_PROMPT,
  WHAT_IF_SPECULATIVE_PROMPT,
} from './prompts.js';
import { flowFixture, modelFixture, stepFixture } from './testing/fixtures.js';
import type { WhatIfInput } from './types.js';
import { simulateWhatIf } from './whatIfSimulator.js';

type StrictInput = Omit<WhatIfInput, 'allowSpeculative'>;
const fixture = (): { -readonly [K in keyof StrictInput]: StrictInput[K] } => {
  const model = modelFixture();
  Object.assign(model.entities.find(({ id }) => id === 'context.purchase')!, {
    rootRefs: ['contract.purchase'],
  });
  model.entities.push({
    type: 'entity',
    id: 'contract.purchase',
    category: 'evidence',
    kind: 'contract',
    label: '采购合同',
    roleRefs: ['role.seller', 'role.buyer'],
  });
  Object.assign(model.entities.find(({ id }) => id === 'request.payment')!, {
    responsibleRoleRef: 'role.seller',
    fulfillmentAction: '支付采购货款',
  });
  model.entities
    .find(({ id }) => id === 'request.payment')!
    .attributes!.push({
      name: 'expired_at',
      timeRole: 'deadline',
      label: '付款期限',
      meaning: '约定的最迟付款时间',
      valueType: 'timestamp',
    });
  model.entities.push({
    type: 'entity',
    id: 'confirmation.payment',
    category: 'evidence',
    kind: 'fulfillment_confirmation',
    label: '付款确认单',
    contextRef: 'context.purchase',
    attributes: [
      {
        name: 'confirmed_at',
        timeRole: 'occurrence',
        label: '付款时间',
        meaning: '实际支付时间',
        valueType: 'timestamp',
      },
      {
        name: 'paid_amount',
        label: '已付金额',
        meaning: '本次实付金额',
        valueType: 'int',
      },
    ],
  });
  model.relationships.push({
    type: 'relationship',
    id: 'relation.payment',
    kind: 'references',
    label: '确认付款请求',
    sourceRef: 'confirmation.payment',
    targetRef: 'request.payment',
  });
  const bindings = {
    request: { ref: 'request.payment' },
    payment: { ref: 'confirmation.payment' },
  };
  model.rules.push(
    {
      type: 'rule',
      id: 'rule.payment-breach',
      kind: 'breach',
      label: '付款逾期',
      description: '实际付款时间晚于约定期限时构成逾期',
      contextRef: 'context.purchase',
      bindings,
      expression: 'payment.confirmed_at > request.expired_at',
      resultType: 'bool',
    },
    {
      type: 'rule',
      id: 'rule.payment-completion',
      kind: 'completion',
      label: '付款金额足额',
      description: '实付金额达到请求金额',
      contextRef: 'context.purchase',
      bindings,
      expression: 'payment.paid_amount >= request.amount',
      resultType: 'bool',
    },
  );
  const request = stepFixture({
    exampleLabel: '付款申请',
    values: { amount: 100, expired_at: '2026-04-01T23:59:59Z' },
  });
  const payment = stepFixture({
    sequence: 2,
    entityId: 'confirmation.payment',
    entityKind: 'fulfillment_confirmation',
    entityLabel: '付款确认单',
    exampleLabel: '付款确认',
    actingRoleRef: 'role.buyer',
    basedOn: ['request.payment#付款申请'],
    values: {
      ref: 'PAY-2',
      confirmed_at: '2026-04-01T12:00:00Z',
      paid_amount: 100,
    },
    asOf: '2026-04-01T12:00:00Z',
  });
  return {
    model,
    flow: flowFixture([request, payment]),
    currentStepSequence: 2,
    hypothesisQuestion: '如果买方在4月2号才付款会怎样？',
  };
};

const explanation = {
  businessImpactExplanation:
    '若买方财务部在4月2日才按《付款申请单》支付采购货款，即使实付金额已经足额，付款时间仍超过了双方约定的期限，触发付款逾期。供应商销售部收到《付款确认单》后，需要与买方逐笔核对实际付款时间和收款凭据，再协商逾期事项如何处理。',
};

describe('native CEL What-If sandbox', () => {
  it('uses the selected clock for a value-only question and honors an explicit hypothetical date', async () => {
    const input = { ...fixture(), asOf: '2026-04-02T12:00:00Z' };
    const values = { paid_amount: 80 };
    const generate = vi
      .fn()
      .mockResolvedValueOnce({ values })
      .mockResolvedValueOnce(explanation);
    const result = await simulateWhatIf(input, { agent: { generate } });
    expect(JSON.parse(generate.mock.calls[0]![0].userPrompt).step.asOf).toBe(
      input.asOf,
    );
    expect(result.hypothesis).toEqual({ asOf: input.asOf, values });
    const earlier = { asOf: '2026-04-01T18:00:00Z', values };
    expect(
      (
        await simulateWhatIf(
          { ...input, hypothesis: earlier },
          { explanation: 'local' },
        )
      ).hypothesis,
    ).toEqual(earlier);
  });
  it('extracts a late-payment hypothesis, computes CEL decisions and only then explains', async () => {
    const input = fixture();
    const original = structuredClone(input);
    const generate = vi
      .fn()
      .mockResolvedValueOnce({
        asOf: '2026-04-02T12:00:00Z',
        values: { confirmed_at: '2026-04-02T12:00:00Z' },
      })
      .mockResolvedValueOnce(explanation);
    const result = await simulateWhatIf(input, { agent: { generate } });
    expect(result.ruleOutcome).toEqual({
      ruleId: 'rule.payment-breach',
      label: '付款逾期',
      kind: 'breach',
      description: '实际付款时间晚于约定期限时构成逾期',
      result: true,
    });
    expect(result.ruleOutcomes).toEqual([
      result.ruleOutcome,
      {
        ruleId: 'rule.payment-completion',
        label: '付款金额足额',
        kind: 'completion',
        description: '实付金额达到请求金额',
        result: true,
      },
    ]);
    expect(result.businessImpactExplanation).toBe(
      explanation.businessImpactExplanation,
    );
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[0]![0].systemPrompt).toBe(
      WHAT_IF_EXTRACTION_PROMPT,
    );
    const request = generate.mock.calls[1]![0];
    expect(request.systemPrompt).toBe(WHAT_IF_EXPLANATION_PROMPT);
    expect(JSON.parse(request.userPrompt)).toMatchObject({
      storyContext: {
        actorLabel: '买方财务部',
        counterpartyLabel: '供应商销售部',
        workObjectTitle: '付款确认单',
        referenceCode: 'PAY-2',
        displayDate: '2026年4月2日 12:00 UTC',
      },
      changes: [{ label: '付款时间', value: '2026年4月2日 12:00 UTC' }],
      obligations: [
        {
          workObjectTitle: '付款申请单',
          action: '支付采购货款',
          obligor: '买方财务部',
          rightHolder: '供应商销售部',
        },
      ],
      upstream: [
        {
          workObjectTitle: '付款申请单',
          facts: expect.arrayContaining([{ label: '金额', value: '100' }]),
        },
      ],
      ruleOutcomes: [
        { label: '付款逾期', kind: '违约约定', result: '触发违约' },
        { label: '付款金额足额', kind: '完成条件', result: '完成条件已达成' },
      ],
    });
    expect(request.userPrompt).not.toMatch(
      /rule\.payment|paid_amount|confirmed_at|"expression"|"bindings"|T12:00:00|\btrue\b|\bfalse\b/u,
    );
    expect(input).toEqual(original);
  });

  it('supports deterministic structured overrides and explicit single-rule selection', async () => {
    const input = fixture();
    input.ruleId = 'rule.payment-completion';
    input.hypothesis = { values: { paid_amount: 50 } };
    const generate = vi.fn().mockResolvedValue({
      businessImpactExplanation: '实付不足，付款尚未完成。',
    });
    const result = await simulateWhatIf(input, { agent: { generate } });
    expect(result.ruleOutcome).toEqual({
      ruleId: 'rule.payment-completion',
      label: '付款金额足额',
      kind: 'completion',
      description: '实付金额达到请求金额',
      result: false,
    });
    expect(result.ruleOutcomes).toHaveLength(1);
    expect(generate).toHaveBeenCalledOnce();
    expect(generate.mock.calls[0]![0].systemPrompt).toBe(
      WHAT_IF_EXPLANATION_PROMPT,
    );
  });

  it('does not confuse a later evaluation clock with a late actual payment', async () => {
    const input = fixture();
    input.hypothesis = { asOf: '2026-04-02T12:00:00Z' };
    const generate = vi.fn().mockResolvedValue(explanation);
    expect(
      (await simulateWhatIf(input, { agent: { generate } })).ruleOutcome.result,
    ).toBe(false);
  });

  it.each([
    [50, '2026-04-01T12:00:00Z', false, false],
    [100, '2026-04-02T12:00:00Z', true, true],
    [100, '2026-04-01T12:00:00Z', false, true],
  ] as const)(
    'explains payment of %s at %s offline, preserving both decisions',
    async (amount, time, breach, complete) => {
      const input = fixture();
      input.hypothesis = {
        asOf: time,
        values: { confirmed_at: time, paid_amount: amount },
      };
      const generate = vi.fn();
      const result = await simulateWhatIf(input, {
        explanation: 'local',
        agent: { generate },
      });
      expect(generate).not.toHaveBeenCalled();
      expect(result.ruleOutcomes.map(({ result }) => result)).toEqual([
        breach,
        complete,
      ]);
      const prose = result.businessImpactExplanation;
      expect(prose.length).toBeGreaterThanOrEqual(100);
      expect(prose.length).toBeLessThanOrEqual(150);
      expect(prose).toContain('买方财务部复核《付款确认单》');
      expect(prose).toContain(`「已付金额」为${amount}`);
      expect(prose).toContain(breach ? '已触发「付款逾期」' : '未触发违约');
      expect(prose).toContain(
        complete ? '满足约定的完成条件' : '不足以确认履约完成',
      );
      expect(prose).toContain(
        breach || !complete ? '商定补正办法' : '整理本次核对的履约凭据',
      );
    },
  );

  it('keeps the same grounded local story when an optional provider is offline or a required explanation repeats instructions', async () => {
    const input = fixture();
    input.currentStepSequence = 1;
    input.ruleId = 'rule.payment-completion';
    input.model.rules[1]!.bindings = { request: { ref: 'request.payment' } };
    input.model.rules[1]!.expression = 'request.amount >= 100';
    input.hypothesis = { values: { amount: 75 } };
    const generate = vi.fn().mockRejectedValueOnce(new Error('offline'));
    const local = await simulateWhatIf(input, {
      explanation: 'local',
      agent: { generate },
    });
    expect(local.businessImpactExplanation).toMatch(
      /供应商销售部.*付款申请单.*75.*不足以确认履约完成.*买方财务部办理《付款确认单》/u,
    );
    await expect(
      simulateWhatIf(input, { explanation: 'optional', agent: { generate } }),
    ).resolves.toEqual(local);
    const leaked = explanation.businessImpactExplanation.replace(
      '供应商销售部',
      '在当前模型假设推演下的供应商销售部',
    );
    generate.mockResolvedValueOnce({ businessImpactExplanation: leaked });
    await expect(
      simulateWhatIf(input, { agent: { generate } }),
    ).resolves.toEqual(local);
    expect(
      JSON.parse(generate.mock.calls[1]![0].userPrompt).storyContext
        .nextExpectation,
    ).toBe('买方财务部办理《付款确认单》');
  });

  it('injects only the explicit asOf into a request deadline rule, with no wall clock', async () => {
    const input = fixture();
    input.currentStepSequence = 1;
    input.ruleId = 'rule.deadline';
    input.model.rules.push({
      type: 'rule',
      id: 'rule.deadline',
      kind: 'breach',
      label: '付款期限已过',
      description: '推演时点已过付款期限',
      contextRef: 'context.purchase',
      bindings: {
        request: { ref: 'request.payment' },
        now: { type: 'timestamp' },
      },
      expression: 'now > request.expired_at',
      resultType: 'bool',
    });
    input.hypothesis = { asOf: '2026-04-02T00:00:00Z' };
    const generate = vi.fn().mockResolvedValue(explanation);
    expect(
      (await simulateWhatIf(input, { agent: { generate } })).ruleOutcome,
    ).toMatchObject({ ruleId: 'rule.deadline', kind: 'breach', result: true });
  });

  it('retains exact int64 comparisons instead of rounding to JavaScript numbers', async () => {
    const input = fixture();
    Object.assign(input.flow.steps[0]!.values, { amount: '9007199254740993' });
    input.hypothesis = { values: { paid_amount: '9007199254740992' } };
    input.ruleId = 'rule.payment-completion';
    const generate = vi.fn().mockResolvedValue(explanation);
    expect(
      (await simulateWhatIf(input, { agent: { generate } })).ruleOutcome.result,
    ).toBe(false);
  });

  it('recomputes derivations from overridden input, ignoring asserted derived facts', async () => {
    const input = fixture();
    const payment = input.model.entities.find(
      ({ id }) => id === 'confirmation.payment',
    )!;
    payment.attributes!.find(
      ({ name }) => name === 'paid_amount',
    )!.derivedByRuleRef = 'rule.net-payment';
    payment.attributes!.push({
      name: 'gross',
      label: '总付款额',
      meaning: '未扣手续费的总金额',
      valueType: 'int',
    });
    input.model.rules.push({
      type: 'rule',
      id: 'rule.net-payment',
      kind: 'derivation',
      label: '净付款额',
      description: '扣除十元手续费',
      contextRef: 'context.purchase',
      bindings: { payment: { ref: 'confirmation.payment' } },
      expression: 'payment.gross - 10',
      resultType: 'int',
      target: { entityRef: 'confirmation.payment', attribute: 'paid_amount' },
    });
    Object.assign(input.flow.steps[1]!.values, {
      gross: 110,
      paid_amount: 999,
    });
    Object.assign(input.flow.steps[1]!, {
      derivedAssertions: { paid_amount: 999 },
    });
    input.hypothesis = { values: { gross: 80 } };
    input.ruleId = 'rule.payment-completion';
    const generate = vi.fn().mockResolvedValue(explanation);
    expect(
      (await simulateWhatIf(input, { agent: { generate } })).ruleOutcome.result,
    ).toBe(false);
    expect(
      JSON.parse(generate.mock.calls[0]![0].userPrompt).currentFacts,
    ).toContainEqual({ label: '已付金额', value: '70' });
    input.hypothesis = { values: { paid_amount: 200 } };
    await expect(
      simulateWhatIf(input, { agent: { generate } }),
    ).rejects.toThrow('derived field');
  });

  it('resolves transitive dependencies and native many-binding macros', async () => {
    const input = fixture();
    const first = input.flow.steps[0]!;
    const second = stepFixture({
      ...first,
      sequence: 2,
      exampleLabel: '第二笔',
      values: { ...first.values, amount: 50 },
      basedOn: ['request.payment#付款申请'],
    });
    const payment = {
      ...input.flow.steps[1]!,
      sequence: 3,
      basedOn: ['request.payment#第二笔'],
    };
    input.flow = flowFixture([first, second, payment]);
    input.currentStepSequence = 3;
    input.model.rules = [
      {
        type: 'rule',
        id: 'rule.all-requests',
        kind: 'completion',
        label: '覆盖所有请求',
        description: '单笔付款覆盖每份请求',
        contextRef: 'context.purchase',
        bindings: {
          requests: { ref: 'request.payment', cardinality: 'many' },
          payment: { ref: 'confirmation.payment' },
        },
        expression: 'requests.all(r, payment.paid_amount >= r.amount)',
        resultType: 'bool',
      },
    ];
    input.hypothesis = { values: { paid_amount: 75 } };
    const generate = vi.fn().mockResolvedValue(explanation);
    expect(
      (await simulateWhatIf(input, { agent: { generate } })).ruleOutcome.result,
    ).toBe(false);
  });

  it('includes request-only breach rules when inspecting a referencing confirmation', async () => {
    const input = fixture();
    input.model.rules = [
      {
        type: 'rule',
        id: 'rule.request-deadline',
        kind: 'breach',
        label: '付款期限已过',
        description: '判断付款时限',
        contextRef: 'context.purchase',
        bindings: {
          request: { ref: 'request.payment' },
          asOf: { type: 'timestamp' },
        },
        expression: 'asOf > request.expired_at',
        resultType: 'bool',
      },
    ];
    input.hypothesis = { asOf: '2026-04-02T00:00:00Z' };
    const generate = vi.fn().mockResolvedValue(explanation);
    expect(
      (await simulateWhatIf(input, { agent: { generate } })).ruleOutcome.result,
    ).toBe(true);
  });

  it.each([
    { values: { invented: 50 } },
    { values: { paid_amount: 1.2 } },
    { values: { confirmed_at: 'April 2' } },
    { asOf: '2026-04-02' },
    {},
    { ruleOutcome: { result: true } },
  ])(
    'rejects unsupported hypotheses without asking for an impact explanation: %j',
    async (hypothesis) => {
      const generate = vi.fn().mockResolvedValueOnce(hypothesis);
      await expect(
        simulateWhatIf(fixture(), { agent: { generate } }),
      ).rejects.toThrow();
      expect(generate).toHaveBeenCalledOnce();
    },
  );

  it('refuses missing, future and unrelated dependency facts instead of selecting arbitrary examples', async () => {
    const input = fixture();
    input.hypothesis = { values: { paid_amount: 50 } };
    input.flow = flowFixture([
      { ...input.flow.steps[1]!, basedOn: ['request.payment#missing'] },
    ]);
    const generate = vi.fn().mockResolvedValue(explanation);
    await expect(
      simulateWhatIf(input, { agent: { generate } }),
    ).rejects.toThrow('Missing dependency');
    input.flow = flowFixture(
      fixture().flow.steps.map((step) => ({ ...step, basedOn: [] })),
    );
    await expect(
      simulateWhatIf(input, { agent: { generate } }),
    ).rejects.toThrow('found 0');
    input.flow = flowFixture([
      fixture().flow.steps[1]!,
      { ...fixture().flow.steps[0]!, sequence: 3 },
    ]);
    await expect(
      simulateWhatIf(input, { agent: { generate } }),
    ).rejects.toThrow('must precede');
    expect(generate).not.toHaveBeenCalled();
  });

  it('rejects ambiguous one-bindings, never taking the first of multiple upstream requests', async () => {
    const input = fixture();
    const request = input.flow.steps[0]!;
    input.flow = flowFixture([
      request,
      { ...request, sequence: 2, exampleLabel: 'another' },
      {
        ...input.flow.steps[1]!,
        sequence: 3,
        basedOn: ['request.payment#付款申请', 'request.payment#another'],
      },
    ]);
    input.currentStepSequence = 3;
    input.hypothesis = { values: { paid_amount: 50 } };
    const generate = vi.fn().mockResolvedValue(explanation);
    await expect(
      simulateWhatIf(input, { agent: { generate } }),
    ).rejects.toThrow('found 2');
    expect(generate).not.toHaveBeenCalled();
  });

  it('propagates CEL errors and refuses to fabricate outcomes for unavailable scalar bindings', async () => {
    const input = fixture();
    input.hypothesis = { values: { paid_amount: 50 } };
    input.model.rules[0]!.expression = 'payment.missing > 0';
    const generate = vi.fn().mockResolvedValue(explanation);
    await expect(
      simulateWhatIf(input, { agent: { generate } }),
    ).rejects.toThrow('rule.payment-breach');
    input.model.rules[0]!.bindings.penalty = { type: 'int' };
    input.model.rules[0]!.expression = 'penalty > 0';
    await expect(
      simulateWhatIf(input, { agent: { generate } }),
    ).rejects.toThrow("missing binding 'penalty'");
    expect(generate).not.toHaveBeenCalled();
  });

  it('rejects a missing step, unrelated rule, and malformed explanation', async () => {
    const input = fixture();
    input.hypothesis = { values: { paid_amount: 50 } };
    const generate = vi
      .fn()
      .mockResolvedValue({ ruleOutcome: { result: false } });
    await expect(
      simulateWhatIf(
        { ...input, currentStepSequence: 99 },
        { agent: { generate } },
      ),
    ).rejects.toThrow('current step');
    await expect(
      simulateWhatIf(
        { ...input, ruleId: 'unrelated' },
        { agent: { generate } },
      ),
    ).rejects.toThrow('No relevant');
    await expect(
      simulateWhatIf(input, { agent: { generate } }),
    ).rejects.toThrow();
    expect(generate).toHaveBeenCalledOnce();
  });

  it('resolves M1 id/ref dependency aliases and deduplicates an alias plus exact reference', async () => {
    const input = fixture();
    const request = input.flow.steps[0]!;
    Object.assign(request.values, { id: 'request-001', ref: 'payment-claim' });
    input.flow = flowFixture([
      request,
      {
        ...input.flow.steps[1]!,
        basedOn: ['request-001', 'request.payment#付款申请', 'payment-claim'],
      },
    ]);
    input.hypothesis = { values: { paid_amount: 50 } };
    const generate = vi.fn().mockResolvedValue(explanation);
    expect(
      (await simulateWhatIf(input, { agent: { generate } })).ruleOutcomes[1]!
        .result,
    ).toBe(false);
    input.flow = flowFixture([
      request,
      { ...request, sequence: 2, exampleLabel: 'another' },
      { ...input.flow.steps[1]!, sequence: 3, basedOn: ['request-001'] },
    ]);
    input.currentStepSequence = 3;
    await expect(
      simulateWhatIf(input, { agent: { generate } }),
    ).rejects.toThrow('Ambiguous dependency');
    expect(generate).toHaveBeenCalledOnce();
  });

  it('fails explicitly when a modeled derivation is missing or cannot make progress', async () => {
    const input = fixture();
    input.hypothesis = { values: { confirmed_at: '2026-04-02T10:00:00Z' } };
    const amount = input.model.entities
      .find(({ id }) => id === 'confirmation.payment')!
      .attributes!.find(({ name }) => name === 'paid_amount')!;
    amount.derivedByRuleRef = 'rule.missing';
    const generate = vi.fn().mockResolvedValue(explanation);
    await expect(
      simulateWhatIf(input, { agent: { generate } }),
    ).rejects.toThrow('Missing derivation');
    input.model.rules.push({
      type: 'rule',
      id: 'rule.missing',
      kind: 'derivation',
      label: '循环推导',
      description: '无输入的循环推导',
      contextRef: 'context.purchase',
      bindings: { payment: { ref: 'confirmation.payment' } },
      expression: 'payment.paid_amount + 1',
      resultType: 'int',
      target: { entityRef: 'confirmation.payment', attribute: 'paid_amount' },
    });
    await expect(
      simulateWhatIf(input, { agent: { generate } }),
    ).rejects.toThrow('Cannot compute');
    expect(generate).not.toHaveBeenCalled();
  });

  it('snapshots the input before awaiting extraction so editor changes cannot mix revisions', async () => {
    const input = fixture();
    const generate = vi
      .fn()
      .mockImplementationOnce(async () => {
        input.model.rules[0]!.expression = 'false';
        Object.assign(input.flow.steps[0]!.values, {
          expired_at: '2026-04-03T23:59:59Z',
        });
        return { values: { confirmed_at: '2026-04-02T12:00:00Z' } };
      })
      .mockResolvedValueOnce(explanation);
    expect(
      (await simulateWhatIf(input, { agent: { generate } })).ruleOutcome.result,
    ).toBe(true);
  });

  it('rejects when no completion/breach rules exist and allowSpeculative is false', async () => {
    const input = fixture();
    input.model.rules = [];
    const generate = vi.fn().mockResolvedValue(explanation);
    await expect(
      simulateWhatIf(input, { agent: { generate } }),
    ).rejects.toThrow('No relevant completion/breach rule is modeled');
    expect(generate).not.toHaveBeenCalled();
  });

  it('explores a freeform question without extracting fields or running CEL', async () => {
    const input = fixture();
    input.hypothesisQuestion = '如果买方拒绝付款呢？';
    input.model.rules = [
      {
        type: 'rule',
        id: 'rule.unusable-derivation',
        kind: 'derivation',
        label: '不应执行的派生规则',
        description: 'AI 临时推想不重新求值。',
        contextRef: 'context.purchase',
        bindings: {},
        expression: 'missing_value',
        resultType: 'int',
        target: { entityRef: 'confirmation.payment', attribute: 'paid_amount' },
      },
    ];
    const before = structuredClone(input);
    const speculativeExplanation = {
      businessImpactExplanation:
        '若买方财务部拒绝付款，供应商销售部可能无法凭《付款确认单》核销《付款申请单》上的货款。双方需要先查明拒付涉及的款项，核对申请与实际到账记录，再确认是否需要补交凭据，以及后续交付是否需要等到双方核对一致后才能继续。',
    };
    const generate = vi.fn().mockResolvedValueOnce(speculativeExplanation);

    const result = await simulateWhatIf(
      { ...input, allowSpeculative: true },
      { agent: { generate } },
    );
    expect(result).toEqual({
      isSpeculative: true,
      ruleOutcomes: [],
      ...speculativeExplanation,
    });
    expect(generate).toHaveBeenCalledOnce();
    const request = generate.mock.calls[0]![0];
    expect(request.systemPrompt).toBe(WHAT_IF_SPECULATIVE_PROMPT);
    expect(JSON.parse(request.userPrompt)).toMatchObject({
      hypothesisQuestion: input.hypothesisQuestion,
      storyContext: { actorLabel: '买方财务部', workObjectTitle: '付款确认单' },
      currentFacts: expect.arrayContaining([
        { label: '已付金额', value: '100' },
      ]),
      upstream: [
        {
          workObjectTitle: '付款申请单',
          facts: expect.arrayContaining([{ label: '金额', value: '100' }]),
        },
      ],
      ruleOutcomes: [],
    });
    expect(input).toEqual(before);
  });

  it('keeps even an unruled structured question in business terms and rejects technical speculative prose', async () => {
    const input = fixture();
    input.model.rules = [];
    input.hypothesis = {
      asOf: '2026-04-03T13:00:00+08:00',
      values: { paid_amount: 40 },
    };
    const generate = vi.fn().mockResolvedValue({
      businessImpactExplanation: explanation.businessImpactExplanation.replace(
        '《付款确认单》',
        'rule.payment-breach',
      ),
    });
    await expect(
      simulateWhatIf(
        { ...input, allowSpeculative: true },
        { agent: { generate } },
      ),
    ).rejects.toThrow('业务语言');
    expect(generate).toHaveBeenCalledOnce();
    const prompt = JSON.parse(generate.mock.calls[0]![0].userPrompt);
    expect(prompt.storyContext.displayDate).toBe(
      '2026年4月3日 13:00 UTC+08:00',
    );
    expect(prompt.changes).toEqual([{ label: '已付金额', value: '40' }]);
    expect(prompt.currentFacts).toContainEqual(prompt.changes[0]);
    expect(prompt.ruleOutcomes).toEqual([]);
  });

  it('rejects contract steps even with speculative opt-in and a direct rule binding', async () => {
    const input = fixture();
    const contract = {
      type: 'entity',
      id: 'contract.purchase',
      category: 'evidence',
      kind: 'contract',
      label: '采购协议',
    } as const;
    input.model.entities.push(contract);
    input.model.rules[0]!.bindings = { contract: { ref: contract.id } };
    input.flow = flowFixture([
      stepFixture({ entityId: contract.id, entityKind: 'contract' }),
    ]);
    const generate = vi.fn();
    await expect(
      simulateWhatIf(
        { ...input, currentStepSequence: 1, allowSpeculative: true },
        { agent: { generate } },
      ),
    ).rejects.toThrow('only available for fulfillment steps');
    expect(generate).not.toHaveBeenCalled();
  });

  it('never changes a strict decision or downgrades errors when rules exist', async () => {
    const input = fixture();
    input.hypothesis = { values: { paid_amount: 50 } };
    const generate = vi.fn().mockResolvedValue(explanation);
    const options = { agent: { generate } };
    await expect(
      simulateWhatIf({ ...input, allowSpeculative: true }, options),
    ).resolves.toMatchObject({
      isSpeculative: false,
      ruleOutcomes: expect.arrayContaining([
        expect.objectContaining({
          ruleId: 'rule.payment-completion',
          kind: 'completion',
          result: false,
        }),
      ]),
    });
    generate.mockClear();
    await expect(
      simulateWhatIf(
        { ...input, allowSpeculative: true, ruleId: 'rule.unknown' },
        options,
      ),
    ).rejects.toThrow('No relevant completion/breach rule is modeled');
    input.model.rules[0]!.expression = 'missing_value';
    await expect(
      simulateWhatIf({ ...input, allowSpeculative: true }, options),
    ).rejects.toThrow();
    expect(generate).not.toHaveBeenCalled();
  });
});
