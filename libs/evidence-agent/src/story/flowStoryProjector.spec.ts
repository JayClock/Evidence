import { expect, it, vi } from 'vitest';
import {
  createFlowStoryProjector,
  projectStoryFacts,
} from './flowStoryProjector.js';
import { createStoryNarrator } from './storyNarrator.js';
import { flowFixture, modelFixture, stepFixture } from './testing/fixtures.js';

const draft = { headline: '提交付款申请', prose: '供应商提交了付款申请。' };
const contract = stepFixture({
  entityId: 'contract.purchase',
  entityKind: 'contract',
  entityLabel: '采购合同',
  exampleLabel: '首单',
  values: { id: 'CT-088' },
});
const request = stepFixture({
  sequence: 2,
  basedOn: ['CT-088', 'contract.purchase#首单'],
  values: {
    id: 'PAY-1',
    amount: { currency: 'CNY', minorUnits: 10000025 },
    agreement: 'contract.purchase#首单',
    deadline: '2026-04-06T16:00:00+08:00',
  },
});
const confirmation = stepFixture({
  sequence: 3,
  entityId: 'confirmation.payment',
  entityKind: 'fulfillment_confirmation',
  entityLabel: '支付确认单',
  basedOn: ['PAY-1'],
  actingRoleRef: 'role.buyer',
});

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
  model.relationships.push({
    type: 'relationship',
    id: 'relation.payment',
    kind: 'references',
    label: '确认请求',
    sourceRef: confirmation.entityId,
    targetRef: request.entityId,
  });
  const trace = flowFixture([confirmation, request, contract]);
  const facts = projectStoryFacts(trace, model);
  expect(projectStoryFacts(trace, model)).toEqual(facts);
  expect(facts.scenes.map(({ stepIndex }) => stepIndex)).toEqual([1, 2, 3]);
  expect(facts.scenes.map(({ activity }) => activity.actionVerb)).toEqual([
    'sign',
    'submit',
    'confirm',
  ]);
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
    ruleEvaluations: [],
  });
  expect(facts.scenes[2]?.activity.recipient?.roleLabel).toBe('供应商销售部');
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
    modelFixture(),
  ).scenes[0]!;
  expect(scene.activity.recipient).toBeUndefined();
  expect(scene.expectation).toEqual({
    assignedToRoleLabel: '责任方待明确',
    expectedWorkObject: '配套确认单据',
    isControlGap: true,
  });
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
      { stepIndex: 2, headline: draft.headline, summary: draft.prose },
    ],
  });
  calls[1]!.finish(draft);
  expect(
    (await pending).scenes.map(({ narrative }) => narrative.status),
  ).toEqual(['authored', 'ready', 'ready']);
});

it('keys drafts by story history and local facts, and validates model output', async () => {
  const scene = projectStoryFacts(flowFixture([contract, request])).scenes[1]!;
  const history = [
    { stepIndex: 1, headline: '签署采购合同', summary: '账期为十天' },
  ];
  const generate = vi
    .fn()
    .mockResolvedValueOnce({ ...draft, documentCard: {} })
    .mockResolvedValue(draft);
  const narrator = createStoryNarrator({ agent: { generate } });
  await expect(narrator.enrichStep(scene, history)).rejects.toThrow();
  await expect(narrator.enrichStep(scene, history)).resolves.toEqual({
    narrative: draft,
    cached: false,
  });
  await expect(
    narrator.enrichStep(scene, history, { cacheOnly: true }),
  ).resolves.toEqual({ narrative: draft, cached: true });
  const revised = [{ ...history[0]!, summary: '账期为五天' }];
  await expect(
    narrator.enrichStep(scene, revised, { cacheOnly: true }),
  ).resolves.toBeUndefined();
  await expect(narrator.enrichStep(scene, revised)).resolves.toMatchObject({
    cached: false,
  });
  expect(generate).toHaveBeenCalledTimes(3);
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
        signal: controller.signal,
      });
      await vi.waitFor(() => expect(generate).toHaveBeenCalledOnce());
      const stop = mode === 'timeout' ? timeout : controller;
      const error = new Error(mode);
      stop.abort(error);
      await expect(pending).rejects.toBe(error);
      finish(draft);
      await expect(
        narrator.enrichStep(scene, [], { cacheOnly: true }),
      ).resolves.toBeUndefined();
      expect(write).not.toHaveBeenCalled();
    } finally {
      clock.mockRestore();
    }
  },
);
