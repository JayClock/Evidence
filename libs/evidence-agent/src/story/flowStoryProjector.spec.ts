import { describe, expect, it, vi } from 'vitest';
import {
  createFlowStoryProjector,
  projectStoryFacts,
} from './flowStoryProjector.js';
import {
  createNarrationScheduler,
  createStoryNarrator,
} from './storyNarrator.js';
import { flowFixture, modelFixture, stepFixture } from './testing/fixtures.js';

const text = { narrative: '按合同办理付款。' };
const trace = (size: number) =>
  flowFixture(
    Array.from({ length: size }, (_, i) =>
      stepFixture({ sequence: i + 1, values: { amount: i + 1 } }),
    ),
  );

it('projects sorted factual cards and gaps without resolving the model', async () => {
  const flow = flowFixture([
    stepFixture({ sequence: 2 }),
    stepFixture({ gaps: ['unpaired_request'] }),
  ]);
  const model = modelFixture();
  const generate = vi.fn();
  const facts = projectStoryFacts(flow, model);
  expect(facts.scenes.map(({ stepIndex }) => stepIndex)).toEqual([1, 2]);
  expect(facts.scenes[0]).toMatchObject({
    actingRoleLabel: '供应商销售部',
    ruleEvaluations: [],
    pendingSuspense: expect.stringContaining('确认单据'),
  });
  expect(facts.scenes[0]?.documentCard.fields).toEqual([
    { name: 'amount', label: '金额', value: '100', keyData: true },
  ]);
  expect(projectStoryFacts(flow, model)).toEqual(facts);
  expect(
    await createFlowStoryProjector({
      skipAi: true,
      agent: { generate },
    }).project(flow, model),
  ).toEqual(facts);
  expect(generate).not.toHaveBeenCalled();
  expect(() =>
    projectStoryFacts(flowFixture([stepFixture(), stepFixture()])),
  ).toThrow('unique positive');
});

it('uses declared explanations offline, preserves gaps and generates only missing explanations', async () => {
  const authored = stepFixture({
    description: '按约核对单据。',
    gaps: ['unpaired_request'],
  });
  const flow = flowFixture([
    authored,
    stepFixture({ sequence: 2, description: '  ' }),
  ]);
  const generate = vi.fn().mockResolvedValue(text);
  const offline = await createFlowStoryProjector({
    skipAi: true,
    agent: { generate },
  }).project(flow);
  expect(offline.scenes[0]).toMatchObject({
    narrative: authored.description,
    narrativeSource: 'model',
    pendingSuspense: expect.any(String),
    ruleEvaluations: [],
  });
  expect(offline.scenes[1]?.narrativeSource).toBe('facts');
  expect(generate).not.toHaveBeenCalled();
  const enhanced = await createFlowStoryProjector({
    agent: { generate },
  }).project(flow);
  expect(generate).toHaveBeenCalledOnce();
  expect(enhanced.scenes[0]).toEqual(offline.scenes[0]);
  expect(enhanced.scenes[1]?.narrativeSource).toBe('ai');
});

it('only overlays validated prose in batch exports', async () => {
  const flow = trace(1);
  const projector = createFlowStoryProjector({
    agent: {
      generate: vi
        .fn()
        .mockResolvedValueOnce({ ...text, documentCard: {} })
        .mockResolvedValueOnce(text),
    },
  });
  await expect(projector.project(flow)).rejects.toThrow();
  const baseline = projectStoryFacts(flow);
  expect(await projector.project(flow)).toEqual({
    ...baseline,
    scenes: [{ ...baseline.scenes[0], ...text, narrativeSource: 'ai' }],
  });
});

it('reuses local prose across revisions and reordering but invalidates edited facts and metadata', async () => {
  const generate = vi.fn().mockResolvedValue(text);
  const projector = createFlowStoryProjector({ agent: { generate } });
  const model = modelFixture();
  await projector.project(trace(1), model);
  const reordered = flowFixture([
    stepFixture({ sequence: 4, values: { amount: 1 } }),
  ]);
  expect((await projector.project(reordered, model)).scenes[0]?.stepIndex).toBe(
    4,
  );
  expect(generate).toHaveBeenCalledTimes(1);
  model.entities.find(({ id }) => id === 'role.seller')!.label = '卖方';
  await projector.project(reordered, model);
  await projector.project(trace(2), model);
  expect(generate).toHaveBeenCalledTimes(3);
  expect(generate.mock.calls[0]?.[0]).toMatchObject({
    purpose: 'narration',
    signal: expect.any(AbortSignal),
  });
});

describe('narration scheduler', () => {
  it('emits partial results out of order and continues after an invalid step', async () => {
    const calls = new Map<number, (value: unknown) => void>();
    const narrator = createStoryNarrator({
      agent: {
        generate: ({ userPrompt }) =>
          new Promise((resolve) => {
            calls.set(JSON.parse(userPrompt).step.values.amount, resolve);
          }),
      },
    });
    const onStep = vi.fn();
    const job = narrator.enrich(trace(4), undefined, {
      onStep,
      signal: new AbortController().signal,
      prioritySequence: 4,
    });
    expect([...calls.keys()]).toEqual([4, 1, 2]);
    calls.get(1)!({ invalid: true });
    await vi.waitFor(() => expect(calls.has(3)).toBe(true));
    calls.get(3)!(text);
    await vi.waitFor(() =>
      expect(
        onStep.mock.calls.map(([result]) => [result.sequence, result.kind]),
      ).toEqual([
        [1, 'failed'],
        [3, 'ready'],
      ]),
    );
    calls.get(2)!(text);
    calls.get(4)!(text);
    await job;
    expect(onStep).toHaveBeenCalledTimes(4);
  });

  it('settles a timed-out step even if its provider does not return and does not cache late prose', async () => {
    const timeout = new AbortController();
    const timer = vi
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
        .mockResolvedValue(text);
      const narrator = createStoryNarrator({ agent: { generate } });
      const onStep = vi.fn();
      const options = { signal: new AbortController().signal, onStep };
      const first = narrator.enrich(trace(1), undefined, options);
      timeout.abort(new DOMException('Provider deadline', 'TimeoutError'));
      await first;
      expect(onStep).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'failed',
          error: expect.objectContaining({ name: 'TimeoutError' }),
        }),
      );
      finish({ narrative: '不要缓存这个过期结果' });
      await narrator.enrich(trace(1), undefined, options);
      expect(generate).toHaveBeenCalledTimes(2);
      expect(onStep).toHaveBeenLastCalledWith(
        expect.objectContaining({ kind: 'ready', ...text }),
      );
    } finally {
      timer.mockRestore();
    }
  });

  it('shares a hard cap across jobs, aborts the provider and drops stale queued work', async () => {
    const schedule = createNarrationScheduler();
    const requests: {
      signal: AbortSignal;
      finish: (value: unknown) => void;
    }[] = [];
    const generate = vi.fn(({ signal }: { signal?: AbortSignal }) => {
      if (!signal) throw new Error('Narration must be cancellable');
      return new Promise((finish) => requests.push({ signal, finish }));
    });
    const first = createStoryNarrator({ schedule, agent: { generate } });
    const second = createStoryNarrator({ schedule, agent: { generate } });
    const a = new AbortController();
    const b = new AbortController();
    const onStep = vi.fn();
    const old = first.enrich(trace(4), undefined, { signal: a.signal, onStep });
    const next = second.enrich(trace(1), undefined, {
      signal: b.signal,
      onStep,
    });
    expect(requests).toHaveLength(3);
    a.abort();
    await old;
    expect(requests.every(({ signal }) => signal.aborted)).toBe(true);
    expect(requests).toHaveLength(3);
    requests[0]!.finish(text); // Provider ignored cancellation until now.
    await vi.waitFor(() => expect(requests).toHaveLength(4));
    requests.slice(1).forEach(({ finish }) => finish(text));
    await next;
    expect(onStep).toHaveBeenCalledTimes(1);
    expect(onStep).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'ready', sequence: 1 }),
    );
  });
});
