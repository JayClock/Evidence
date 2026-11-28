import { expect, it, vi } from 'vitest';
import {
  createFlowStoryProjector,
  projectStoryFacts,
} from './flowStoryProjector.js';
import { createStoryNarrator } from './storyNarrator.js';
import { createDomainGraph } from '@evidence-poc/evidence-model-core';
import { WHAT_IF_CHALLENGE_SUGGESTION_PROMPT } from './prompts.js';
import type { StoryAgent } from './types.js';
import { isFulfillmentRequest } from '@evidence-poc/evidence-schema';
import {
  flowFixture,
  modelFixture as baseModelFixture,
  stepFixture,
} from './testing/fixtures.js';

const draft = { headline: '提交付款申请', prose: '供应商提交了付款申请。' };
const contract = stepFixture({
  entityId: 'contract.purchase',
  entityKind: 'contract',
  entityLabel: '采购合同',
  stepId: 'sign',
  activity: '签署',
  values: { id: 'CT-088' },
});
const request = stepFixture({
  sequence: 2,
  basedOn: ['purchase#sign'],
  values: {
    id: 'PAY-1',
    amount: { currency: 'CNY', minorUnits: 10000025 },
    agreement: 'purchase#sign',
    deadline: '2026-04-06T16:00:00+08:00',
  },
});
const confirmation = stepFixture({
  sequence: 3,
  entityId: 'confirmation.payment',
  entityKind: 'fulfillment_confirmation',
  entityLabel: '支付确认单',
  basedOn: ['purchase#request'],
  stepId: 'confirm',
  activity: '记录',
  targetActorRef: 'role.seller',
  actorRef: 'role.buyer',
});

const modelFixture = () => {
  const model = baseModelFixture();
  const context = model.entities.find(({ id }) => id === 'context.purchase');
  if (context?.category !== 'context') throw new Error('Missing context');
  context.rootRefs = [contract.entityId];
  const payment = model.entities.find(isFulfillmentRequest)!;
  payment.responsibleRoleRef = 'role.seller';
  payment.fulfillmentAction = '支付采购货款';
  model.entities.push(
    {
      type: 'entity',
      category: 'evidence',
      kind: 'contract',
      id: contract.entityId,
      label: contract.entityLabel,
      contextRef: context.id,
      roleRefs: ['role.buyer', 'role.seller'],
    },
    {
      type: 'entity',
      category: 'evidence',
      kind: 'fulfillment_confirmation',
      id: confirmation.entityId,
      label: confirmation.entityLabel,
      contextRef: context.id,
      responsibleRoleRef: 'role.buyer',
    },
  );
  model.relationships.push({
    type: 'relationship',
    id: 'relation.payment',
    kind: 'references',
    label: '确认请求',
    sourceRef: confirmation.entityId,
    targetRef: request.entityId,
  });
  return model;
};

it('projects a deterministic DST handoff from both dependency forms, with localized business data', () => {
  const model = modelFixture();
  const payment = model.entities.find(({ id }) => id === 'request.payment')!;
  payment.attributes![0]!.valueType = 'money';
  payment.attributes!.push({
    name: 'deadline',
    label: '截止',
    meaning: '截止时间',
    valueType: 'timestamp',
    timeRole: 'deadline',
  });
  const trace = flowFixture([confirmation, request, contract]);
  const facts = projectStoryFacts(trace, model);
  expect(projectStoryFacts(trace, model)).toEqual(facts);
  expect(facts.scenes.map(({ stepIndex }) => stepIndex)).toEqual([1, 2, 3]);
  expect(
    facts.scenes.map(({ activity }) => activity.fulfillment?.phase),
  ).toEqual([undefined, 'request', 'confirmation']);
  expect(facts.scenes[1]).toMatchObject({
    timing: { displayDate: '2026年4月1日 10:00 UTC' },
    activity: {
      recipient: { roleLabel: '买方财务部' },
      workObject: { referenceCode: 'PAY-1' },
    },
    prerequisites: [
      {
        previousStepIndex: 1,
        fromActorLabel: '供应商销售部',
        workObjectLabel: '采购合同',
      },
    ],
    expectation: {
      assignedToRoleLabel: '买方财务部',
      expectedWorkObject: '支付确认单',
      deadlineNotice: '于2026年4月6日 16:00 UTC+08:00前',
      isControlGap: false,
    },
    documentCard: {
      keyAttributes: [{ name: 'amount', label: '金额', value: '¥100,000.25' }],
      generalAttributes: expect.arrayContaining([
        {
          name: 'agreement',
          label: 'agreement',
          value: '《采购合同》（CT-088）',
        },
      ]),
    },
    narrative: {
      headline: '供应商销售部向买方财务部提交《付款申请单》',
      prose: expect.stringContaining(
        '承接第 1 步中供应商销售部经手的《采购合同》',
      ),
      status: 'baseline',
    },
  });
  expect(facts.scenes[2]?.activity.recipient?.roleLabel).toBe('供应商销售部');
  expect(facts.scenes[2]?.narrative.headline).toBe(
    '买方财务部向供应商销售部记录《支付确认单》',
  );
  expect(facts.scenes[1]?.narrative.prose).not.toMatch(
    /办理|规则判定|contract\.purchase/u,
  );
  expect(() => projectStoryFacts(flowFixture([request, request]))).toThrow(
    'unique positive',
  );
});

it('surfaces a missing confirmation without assigning an unmodeled party or deadline', () => {
  const scene = projectStoryFacts(
    flowFixture([stepFixture({ gaps: ['unpaired_request'] })]),
    { ...modelFixture(), relationships: [] },
  ).scenes[0]!;
  expect(scene.activity.recipient?.roleId).toBe('role.buyer');
  expect(scene.expectation).toEqual({
    assignedToRoleLabel: '责任方待明确',
    expectedWorkObject: '配套确认单据',
    isControlGap: true,
  });
});

it('keeps the obligation on the contract even when a different actor records the confirmation', () => {
  const scene = projectStoryFacts(
    flowFixture([
      contract,
      request,
      { ...confirmation, actorRef: 'role.seller' },
    ]),
    modelFixture(),
  ).scenes[2]!;
  expect(scene.activity.fulfillment?.requests).toMatchObject([
    {
      stepIndex: 2,
      action: '支付采购货款',
      obligor: { roleId: 'role.buyer' },
    },
  ]);
  expect(scene.narrative.headline).toContain('记录《支付确认单》');
  expect(scene.narrative.headline).not.toContain('已支付');
});

it('does not guess an obligation from a document name or an ambiguous request instance', () => {
  const missing = projectStoryFacts(flowFixture([request])).scenes[0]!;
  expect(missing.narrative.headline).toContain('提交《付款申请单》');
  const second = {
    ...request,
    sequence: 3,
    stepId: 'second',
    values: { id: 'PAY-2' },
  };
  const scene = projectStoryFacts(
    flowFixture([
      contract,
      request,
      second,
      {
        ...confirmation,
        sequence: 4,
        basedOn: ['purchase#request', 'purchase#second'],
      },
    ]),
    modelFixture(),
  ).scenes[3]!;
  expect(scene.narrative.headline).toContain('记录《支付确认单》');
  expect(scene.activity.fulfillment?.requests).toEqual([]);
});

it('keeps a rejected confirmation as an attempt, not a result', () => {
  const scene = projectStoryFacts(
    flowFixture([
      contract,
      request,
      { ...confirmation, stepId: 'rejected', expectedStatus: 422 },
    ]),
    modelFixture(),
  ).scenes[2]!;
  expect(scene.activity.rejectedExample).toBe(true);
  expect(scene.narrative.headline).toContain('尝试向供应商销售部记录');
  expect(scene.narrative.prose).toContain('预期不予受理');
});

it('accumulates authored explanations and generated drafts in strict order', async () => {
  const authored = { ...contract, description: '合同约定分两次支付。' };
  const flow = flowFixture([authored, request, confirmation]);
  const calls: { prompt: string; finish: (value: unknown) => void }[] = [];
  const generate = vi.fn(
    ({ userPrompt }: { userPrompt: string }) =>
      new Promise((finish) => calls.push({ prompt: userPrompt, finish })),
  );
  const offline = await createFlowStoryProjector({
    skipAi: true,
    agent: { generate },
  }).project(flow);
  expect(offline.scenes[0]?.narrative).toMatchObject({
    status: 'authored',
    prose: authored.description,
  });
  expect(generate).not.toHaveBeenCalled();
  const pending = createFlowStoryProjector({ agent: { generate } }).project(
    flow,
    modelFixture(),
  );
  await vi.waitFor(() => expect(calls).toHaveLength(1));
  expect(JSON.parse(calls[0]!.prompt)).toMatchObject({
    storyHistory: [{ stepIndex: 1, summary: authored.description }],
    currentActivity: { stepIndex: 2, recipient: '买方财务部' },
  });
  calls[0]!.finish(draft);
  await vi.waitFor(() => expect(calls).toHaveLength(2));
  expect(JSON.parse(calls[1]!.prompt)).toMatchObject({
    storyHistory: [
      { stepIndex: 1, summary: authored.description },
      {
        stepIndex: 2,
        headline: '供应商销售部向买方财务部提交《付款申请单》',
        summary: draft.prose,
      },
    ],
  });
  calls[1]!.finish(draft);
  expect(
    (await pending).scenes.map(({ narrative }) => narrative.status),
  ).toEqual(['authored', 'ready', 'ready']);
});

it('keys drafts by story history and local facts, and validates model output', async () => {
  const scene = projectStoryFacts(flowFixture([contract, request])).scenes[0]!;
  const history = [
    { stepIndex: 1, headline: '签署采购合同', summary: '账期为十天' },
  ];
  const generate = vi
    .fn()
    .mockResolvedValueOnce({ ...draft, documentCard: {} })
    .mockResolvedValue(draft);
  const narrator = createStoryNarrator({ agent: { generate } });
  await expect(
    narrator.enrichStep(scene, history, { flowId: 'purchase' }),
  ).rejects.toThrow();
  await expect(
    narrator.enrichStep(scene, history, { flowId: 'purchase' }),
  ).resolves.toEqual({
    narrative: { ...draft, headline: scene.narrative.headline },
    cached: false,
  });
  await expect(
    narrator.enrichStep(scene, history, {
      flowId: 'purchase',
      cacheOnly: true,
    }),
  ).resolves.toEqual({
    narrative: { ...draft, headline: scene.narrative.headline },
    cached: true,
  });
  const revised = [{ ...history[0]!, summary: '账期为五天' }];
  await expect(
    narrator.enrichStep(scene, revised, {
      flowId: 'purchase',
      cacheOnly: true,
    }),
  ).resolves.toBeUndefined();
  await expect(
    narrator.enrichStep(scene, revised, { flowId: 'purchase' }),
  ).resolves.toMatchObject({
    cached: false,
  });
  expect(generate).toHaveBeenCalledTimes(3);
});

it('retries a malformed challenge list without regenerating prose and keeps authored scenes intact', async () => {
  const model = baseModelFixture();
  model.rules.push({
    type: 'rule',
    id: 'rule.deficit',
    kind: 'breach',
    contextRef: 'context.purchase',
    label: '交付不足',
    description: '低于约定金额',
    expression: 'self.amount < 100',
    bindings: { self: { ref: 'request.payment' } },
    resultType: 'bool',
  });
  const flow = flowFixture();
  const scene = projectStoryFacts(flow, model).scenes[0]!;
  const options = {
    flowId: flow.flowId,
    challengeSource: {
      graph: createDomainGraph(model),
      steps: flow.steps,
      current: flow.steps[0]!,
    },
  };
  const card = {
    id: 'deficit',
    label: '短付一元',
    category: 'deficit',
    question: '如果只付 99 元，会怎样？',
    hypothesisDraft: { values: { amount: 99 } },
  };
  const generate = vi.fn<StoryAgent['generate']>(async ({ systemPrompt }) =>
    systemPrompt === WHAT_IF_CHALLENGE_SUGGESTION_PROMPT
      ? { challenges: [{ ...card, category: 'unknown' }] }
      : draft,
  );
  const narrator = createStoryNarrator({ agent: { generate } });
  const first = await narrator.enrichStep(scene, [], options);
  expect(first?.narrative.prose).toBe(draft.prose);
  expect(first?.challenges).toBeUndefined();
  generate.mockClear().mockResolvedValue({
    challenges: [
      {
        ...card,
        id: 'raw-date',
        question: '如果到 2026-04-01T10:00:00Z 才付款呢？',
      },
      { ...card, id: 'raw-unit', label: '少付一个最小货币单位' },
      card,
    ],
  });
  const retry = await narrator.enrichStep(scene, [], options);
  expect(retry?.challenges).toEqual([
    { ...card, targetedRuleId: 'rule.deficit' },
  ]);
  expect(generate).toHaveBeenCalledOnce();
  for (const [otherScene, otherOptions] of [
    [scene, { ...options, flowId: 'other' }],
    [{ ...scene, stepIndex: 2 }, options],
    [{ ...scene, stepHash: 'edited' }, options],
  ] as const) {
    await expect(
      narrator.enrichStep(otherScene, [], { ...otherOptions, cacheOnly: true }),
    ).resolves.toBeUndefined();
  }
  const authored = {
    ...scene,
    narrative: {
      ...scene.narrative,
      status: 'authored' as const,
      prose: '双方核准的业务说明。',
    },
  };
  const reply = await narrator.enrichStep(authored, [], options);
  expect(reply?.narrative.prose).toBe(authored.narrative.prose);
  expect(reply?.challenges).toEqual(retry?.challenges);
  expect(generate).toHaveBeenCalledTimes(2);
});

it.each(['cancel', 'timeout'])(
  'drops the response if the transport ignores %s',
  async (mode) => {
    const controller = new AbortController();
    const timeout = new AbortController();
    const clock = vi
      .spyOn(AbortSignal, 'timeout')
      .mockReturnValueOnce(timeout.signal);
    try {
      let finish!: (value: unknown) => void;
      const generate = vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              finish = resolve;
            }),
        )
        .mockResolvedValue(draft);
      const write = vi.fn(async () => undefined);
      const narrator = createStoryNarrator({
        agent: { generate },
        store: { read: async () => new Map(), write },
      });
      const scene = projectStoryFacts(flowFixture()).scenes[0]!;
      const pending = narrator.enrichStep(scene, [], {
        flowId: 'purchase',
        signal: controller.signal,
      });
      await vi.waitFor(() => expect(generate).toHaveBeenCalledOnce());
      const stop = mode === 'timeout' ? timeout : controller;
      const error = new Error(mode);
      stop.abort(error);
      await expect(pending).rejects.toBe(error);
      finish(draft);
      await expect(
        narrator.enrichStep(scene, [], { flowId: 'purchase', cacheOnly: true }),
      ).resolves.toBeUndefined();
      expect(write).not.toHaveBeenCalled();
    } finally {
      clock.mockRestore();
    }
  },
);
