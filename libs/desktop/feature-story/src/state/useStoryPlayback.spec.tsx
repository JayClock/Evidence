import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDesktopFixture } from '@evidence-poc/desktop-testing';
import type {
  StoryEnrichStepInput,
  StoryEnrichStepResult,
  StoryInvalidatedEvent,
  StoryLoadInput,
  StorySnapshot,
} from '@evidence-poc/desktop-contracts/story';
import type { WhatIfResult } from '@evidence-poc/evidence-agent/browser';
import type { DomainModelDocument } from '@evidence-poc/evidence-schema';
import { installDesktopApi } from '@evidence-poc/desktop-testing/desktopApi';
import { storyFlow, storySnapshot } from '@evidence-poc/desktop-testing/story';
import {
  STORY_REFRESH_DELAY,
  STORY_STEP_DURATION,
  useStoryPlayback,
  type StoryPlaybackController,
} from './useStoryPlayback';

type Pending = {
  input: StoryEnrichStepInput;
  resolve: (result: StoryEnrichStepResult | null) => void;
  reject: (error: Error) => void;
};
const setup = (enabled = true) => {
  vi.useFakeTimers();
  const api = installDesktopApi();
  const flow = storyFlow();
  const load = vi.fn<(input: StoryLoadInput) => Promise<StorySnapshot>>(
    async () => storySnapshot([flow]),
  );
  const pending: Pending[] = [];
  const enrichStep = vi.fn(
    (input: StoryEnrichStepInput) =>
      new Promise<StoryEnrichStepResult | null>((resolve, reject) =>
        pending.push({ input, resolve, reject }),
      ),
  );
  const cancelStep = vi.fn(async () => undefined);
  const listeners = new Set<(event: StoryInvalidatedEvent) => void>();
  Object.assign(api.story, {
    load,
    enrichStep,
    cancelStep,
    onInvalidated: (listener: (event: StoryInvalidatedEvent) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    whatIf: vi.fn(),
  });
  const onInvalidated = vi.fn(async () => undefined);
  const invalidate = (rootPath = '/models/test', kind?: 'narration') =>
    act(() =>
      listeners.forEach((listener) =>
        listener({ rootPath, ...(kind ? { kind } : {}) }),
      ),
    );
  const hook = renderHook<
    StoryPlaybackController,
    {
      document: DomainModelDocument;
      enabled: boolean;
      aiConfigured?: boolean;
      refreshSavedSources?: boolean;
    }
  >(
    (props) =>
      useStoryPlayback({
        api: api.story,
        rootPath: '/models/test',
        onInvalidated,
        ...props,
      }),
    { initialProps: { document: createDesktopFixture(), enabled } },
  );
  const tick = async (ms = STORY_REFRESH_DELAY) =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  const finish = async (index: number, prose: string) =>
    act(async () => {
      const item = pending[index]!;
      item.resolve({
        stepIndex: item.input.stepIndex,
        stepHash: item.input.stepHash,
        narrative: { headline: '智能回放', prose },
        cached: false,
      });
      await Promise.resolve();
    });
  return {
    api,
    flow,
    load,
    pending,
    enrichStep,
    cancelStep,
    listeners,
    hook,
    tick,
    finish,
    onInvalidated,
    invalidate,
  };
};
afterEach(() => vi.useRealTimers());

describe('story playback', () => {
  it('renders deterministic facts immediately and requests only the cursor in offline mode', async () => {
    const { hook, pending, enrichStep, tick } = setup();
    hook.rerender({
      document: createDesktopFixture(),
      enabled: true,
      aiConfigured: false,
    });
    await tick();
    expect(hook.result.current.ready).toBe(true);
    expect(
      pending.map(({ input }) => [input.stepIndex, input.cacheOnly]),
    ).toEqual([[1, true]]);
    await act(async () => pending[0]!.resolve(null));
    expect(hook.result.current.scene?.narrative.status).toBe('baseline');
    expect(enrichStep).toHaveBeenCalledOnce();
  });

  it('does not enrich an authored scene', async () => {
    const { hook, load, flow, enrichStep, tick } = setup();
    load.mockResolvedValue(
      storySnapshot([
        {
          ...flow,
          steps: flow.steps.map((step) => ({
            ...step,
            description: '人工确认的业务说明。',
          })),
        },
      ]),
    );
    await tick();
    expect(hook.result.current.scene?.narrative).toMatchObject({
      prose: '人工确认的业务说明。',
      status: 'authored',
    });
    expect(enrichStep).not.toHaveBeenCalled();
  });

  it('prefetches exactly one next step with the confirmed current story as history', async () => {
    const { hook, pending, finish, tick, cancelStep } = setup();
    await tick();
    expect(pending.map(({ input }) => input.stepIndex)).toEqual([1]);
    expect(hook.result.current.scene?.narrative.status).toBe('enriching');
    await finish(0, '第一段业务故事');
    expect(pending.map(({ input }) => input.stepIndex)).toEqual([1, 2]);
    expect(pending[1]?.input.storyHistory).toEqual([
      { stepIndex: 1, headline: '智能回放', summary: '第一段业务故事' },
    ]);
    await finish(1, '第二段预取故事');
    act(() => hook.result.current.next());
    expect(hook.result.current.scene?.narrative).toMatchObject({
      prose: '第二段预取故事',
      status: 'ready',
    });
    expect(pending.map(({ input }) => input.stepIndex)).toEqual([1, 2, 3]);
    expect(cancelStep).not.toHaveBeenCalled();
  });

  it('reuses an in-flight prefetch rather than starting it again', async () => {
    const { hook, pending, finish, tick, cancelStep } = setup();
    await tick();
    await finish(0, '第一步');
    act(() => hook.result.current.next());
    expect(hook.result.current.scene?.narrative.status).toBe('enriching');
    expect(pending).toHaveLength(2);
    expect(cancelStep).not.toHaveBeenCalled();
    await finish(1, '预取中的第二步');
    expect(hook.result.current.scene?.narrative.prose).toBe('预取中的第二步');
  });

  it('clears narration on AI configuration changes without reloading the facts', async () => {
    const { hook, pending, tick, load, invalidate, cancelStep } = setup();
    await tick();
    invalidate('/models/test', 'narration');
    expect(load).toHaveBeenCalledOnce();
    expect(pending.map(({ input }) => input.stepIndex)).toEqual([1, 1]);
    expect(cancelStep).toHaveBeenCalledOnce();
    expect(hook.result.current.ready).toBe(true);
  });

  it('cancels the old step when navigation overtakes it and keeps the local clock stable', async () => {
    const { hook, pending, cancelStep, tick } = setup();
    await tick();
    const timeline = hook.result.current.timeline;
    act(() => hook.result.current.togglePlaying());
    await tick(STORY_STEP_DURATION);
    expect(hook.result.current.step?.sequence).toBe(2);
    expect(cancelStep).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: pending[0]!.input.requestId }),
    );
    expect(hook.result.current.timeline).toBe(timeline);
    expect(hook.result.current.scene?.narrative.status).toBe('enriching');
  });

  it('keeps facts on a failed step and retries only that step', async () => {
    const { hook, pending, cancelStep, tick } = setup();
    await tick();
    await act(async () => pending[0]!.reject(new Error('步骤超时')));
    expect(hook.result.current.narration.incomplete).toBe(true);
    act(() => hook.result.current.narration.retry());
    expect(pending).toHaveLength(2);
    expect(pending[1]!.input.stepIndex).toBe(1);
    expect(pending[1]!.input.requestId).not.toBe(pending[0]!.input.requestId);
    hook.unmount();
    expect(cancelStep).toHaveBeenCalled();
  });

  it('invalidates a prefetched draft when the previous explanation changes', async () => {
    const { hook, pending, finish, tick, load, flow, cancelStep } = setup();
    await tick();
    await finish(0, '旧解释');
    expect(pending[1]!.input.stepIndex).toBe(2);
    const revised = {
      ...flow,
      steps: [
        { ...flow.steps[0]!, description: '新的人工解释。' },
        ...flow.steps.slice(1),
      ],
    };
    load.mockResolvedValue(storySnapshot([revised]));
    act(() =>
      hook.rerender({ document: createDesktopFixture(), enabled: true }),
    );
    await tick();
    expect(cancelStep).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: pending[1]!.input.requestId }),
    );
    expect(pending[2]?.input).toMatchObject({
      stepIndex: 2,
      stepHash: pending[1]!.input.stepHash,
      storyHistory: [{ stepIndex: 1, summary: '新的人工解释。' }],
    });
    await finish(1, '过期预取');
    act(() => hook.result.current.next());
    expect(pending).toHaveLength(3);
    expect(hook.result.current.scene?.narrative.status).toBe('enriching');
    await finish(2, '使用新的人工解释。');
    expect(hook.result.current.scene?.narrative.prose).toBe(
      '使用新的人工解释。',
    );
  });

  it('uses the injected transport without a desktop global', async () => {
    const { load, hook, tick } = setup();
    Reflect.deleteProperty(window, 'evidenceAPI');
    await tick();
    expect(load).toHaveBeenCalledOnce();
    expect(hook.result.current.ready).toBe(true);
    hook.unmount();
  });

  it('does no work outside walkthrough mode, debounces snapshots and guards step boundaries', async () => {
    const { hook, load, tick } = setup(false);
    await tick();
    expect(load).not.toHaveBeenCalled();
    hook.rerender({ document: createDesktopFixture(), enabled: true });
    hook.rerender({ document: createDesktopFixture(), enabled: true });
    await tick();
    expect(load).toHaveBeenCalledOnce();
    expect(hook.result.current.currentStepSequence).toBe(1);
    expect(hook.result.current.canPrevious).toBe(false);
    act(() => hook.result.current.previous());
    act(() => hook.result.current.next());
    expect(hook.result.current.currentStepSequence).toBe(2);
    act(() => hook.result.current.next());
    act(() => hook.result.current.next());
    expect(hook.result.current.currentStepSequence).toBe(3);
    expect(hook.result.current.canNext).toBe(false);
  });

  it('targets the requested clock when that request has no example in any flow', async () => {
    const { hook, tick } = setup(false);
    const document = createDesktopFixture();
    document.entities.push({
      type: 'entity',
      category: 'evidence',
      kind: 'fulfillment_request',
      id: 'request.second',
      label: '第二项交付',
    });
    hook.rerender({ document, enabled: false });
    act(() => hook.result.current.openAtRequest('request.second'));
    hook.rerender({ document, enabled: true });
    await tick();
    expect(hook.result.current.rehearsal).toMatchObject({
      active: true,
      requestId: 'request.second',
    });
    expect(hook.result.current.flows).toHaveLength(1);
  });

  it('resolves canonical and alias-based document dependencies for canvas focus', async () => {
    const { hook, flow, load, tick } = setup();
    const steps = flow.steps.map((step, index) => ({
      ...step,
      actingRoleRef: 'role.buyer',
      values:
        index === 1
          ? {
              ...step.values,
              id: 'request-alias',
              ref: 'evidence.contract#example-0',
            }
          : step.values,
      basedOn:
        index === 2
          ? ['request-alias', 'evidence.contract#example-0']
          : step.basedOn,
    }));
    load.mockResolvedValue(storySnapshot([{ ...flow, steps }]));
    await tick();
    act(() => hook.result.current.next());
    act(() => hook.result.current.next());
    expect(hook.result.current.canvasFocus).toMatchObject({
      activeEntityId: 'evidence.confirmation',
      activeStep: 3,
      dependencyEntityIds: ['evidence.request', 'evidence.contract'],
      relatedEntityIds: ['role.buyer'],
    });
    expect(hook.result.current.canvasFocus?.completedSteps).toEqual(
      new Map([
        ['evidence.contract', 1],
        ['evidence.request', 2],
      ]),
    );
    act(() => hook.result.current.previous());
    expect(hook.result.current.canvasFocus?.completedSteps).toEqual(
      new Map([['evidence.contract', 1]]),
    );
  });

  it('automatically advances, stops at the end and cleans up timers on exit', async () => {
    const { hook, tick } = setup();
    await tick();
    act(() => hook.result.current.togglePlaying());
    await tick(STORY_STEP_DURATION);
    expect(hook.result.current.currentStepSequence).toBe(2);
    await tick(STORY_STEP_DURATION);
    expect(hook.result.current.currentStepSequence).toBe(3);
    expect(hook.result.current.isPlaying).toBe(false);
    act(() => hook.result.current.togglePlaying());
    expect(hook.result.current.currentStepSequence).toBe(1);
    hook.rerender({ document: createDesktopFixture(), enabled: false });
    await tick(STORY_STEP_DURATION * 3);
    expect(hook.result.current.currentStepSequence).toBe(1);
    expect(hook.result.current.isPlaying).toBe(false);
  });

  it('refreshes a notice received before entering playback and retries failed source reads', async () => {
    const { hook, onInvalidated, load, tick } = setup(false);
    onInvalidated.mockRejectedValueOnce(new Error('磁盘模型暂不可读'));
    hook.rerender({
      document: createDesktopFixture(),
      enabled: true,
      refreshSavedSources: true,
    });
    await tick();
    expect(hook.result.current.error).toBe('磁盘模型暂不可读');
    expect(hook.result.current.loading).toBe(false);
    expect(load).not.toHaveBeenCalled();
    act(() => hook.result.current.retry());
    await tick();
    await tick();
    expect(onInvalidated).toHaveBeenCalledTimes(2);
    expect(load).toHaveBeenCalledOnce();
    expect(hook.result.current.ready).toBe(true);
  });

  it('coalesces scoped invalidations, preserves the current example and unsubscribes', async () => {
    const { hook, load, flow, invalidate, onInvalidated, listeners, tick } =
      setup();
    await tick();
    act(() => hook.result.current.next());
    invalidate('/other');
    await tick();
    expect(load).toHaveBeenCalledOnce();
    invalidate();
    invalidate();
    invalidate();
    expect(hook.result.current.ready).toBe(false);
    await tick();
    expect(onInvalidated).toHaveBeenCalledOnce();
    // Insert a preceding step: sequence is presentation, example identity persists.
    load.mockResolvedValue(
      storySnapshot([
        {
          ...flow,
          steps: [flow.steps[0]!, ...flow.steps].map((step, index) => ({
            ...step,
            sequence: index + 1,
          })),
        },
      ]),
    );
    await tick();
    expect(load).toHaveBeenCalledTimes(2);
    expect(hook.result.current.step?.entityId).toBe('evidence.request');
    expect(hook.result.current.currentStepSequence).toBe(3);
    hook.unmount();
    expect(listeners.size).toBe(0);
  });

  it('ignores an obsolete projection even during the next debounce interval', async () => {
    const { hook, load, tick } = setup();
    const resolve: ((value: StorySnapshot) => void)[] = [];
    load.mockImplementation(() => new Promise((done) => resolve.push(done)));
    await tick();
    hook.rerender({ document: createDesktopFixture(), enabled: true });
    await act(async () => resolve[0]!(storySnapshot([storyFlow('旧版本')])));
    expect(hook.result.current.projection).toBeUndefined();
    await tick();
    await act(async () => resolve[1]!(storySnapshot([storyFlow('新版本')])));
    expect(hook.result.current.projection?.storyTitle).toBe('新版本');
  });

  it('keeps model read errors separate from narration and can retry to an empty model', async () => {
    const { hook, load, enrichStep, tick } = setup();
    load.mockRejectedValueOnce(new Error('模型暂不可读'));
    await tick();
    expect(hook.result.current.error).toBe('模型暂不可读');
    load.mockResolvedValueOnce(storySnapshot([]));
    act(() => hook.result.current.retry());
    await tick();
    expect(hook.result.current.loading).toBe(false);
    expect(hook.result.current.step).toBeUndefined();
    expect(enrichStep).not.toHaveBeenCalled();
  });

  it('resets a disappeared flow and rejects stale sandbox answers after navigation', async () => {
    const { hook, api, flow, load, tick } = setup();
    await tick();
    let answer: (result: WhatIfResult) => void = () => undefined;
    api.story.whatIf = vi.fn(
      () =>
        new Promise<WhatIfResult>((resolve) => {
          answer = resolve;
        }),
    );
    act(() => {
      void hook.result.current.askWhatIf('如果只付300？', {
        allowSpeculative: true,
      });
    });
    expect(api.story.whatIf).not.toHaveBeenCalled();
    act(() => hook.result.current.jumpToStep(2));
    act(() => {
      void hook.result.current.askWhatIf('如果只付300？');
    });
    expect(hook.result.current.sandbox?.loading).toBe(true);
    act(() => hook.result.current.next());
    await act(async () =>
      answer({
        isSpeculative: false,
        hypothesis: { values: { amount: 300 } },
        ruleOutcome: { ruleId: 'rule.payment', result: false },
        ruleOutcomes: [{ ruleId: 'rule.payment', result: false }],
        businessImpactExplanation: '旧答案',
      }),
    );
    expect(hook.result.current.sandbox).toBeUndefined();
    expect(api.story.whatIf).toHaveBeenCalledWith(
      expect.objectContaining({
        stepHash: 'step-1',
        document: expect.any(Object),
      }),
    );
    const fallback = { ...flow, flowId: '新业务流', flowTitle: '新业务流' };
    load.mockResolvedValue(storySnapshot([fallback]));
    act(() => hook.result.current.retry());
    await tick();
    expect(hook.result.current.activeFlowId).toBe('新业务流');
    expect(hook.result.current.currentStepSequence).toBe(1);
  });

  it('discards a pending speculative reply when opting out and starting again at the same step', async () => {
    const { hook, api, tick } = setup();
    const document = createDesktopFixture();
    document.rules = [];
    hook.rerender({ document, enabled: true });
    await tick();
    act(() => hook.result.current.jumpToStep(2));
    const resolve: ((result: WhatIfResult) => void)[] = [];
    api.story.whatIf = vi.fn(
      () => new Promise<WhatIfResult>((done) => resolve.push(done)),
    );
    act(() => {
      void hook.result.current.askWhatIf('如果迟到了？');
    });
    expect(api.story.whatIf).not.toHaveBeenCalled();
    act(() => {
      void hook.result.current.askWhatIf('如果迟到了？', {
        allowSpeculative: true,
      });
      hook.result.current.clearWhatIf();
      void hook.result.current.askWhatIf('如果拒收呢？', {
        allowSpeculative: true,
      });
    });
    const result = (businessImpactExplanation: string): WhatIfResult => ({
      isSpeculative: true,
      ruleOutcomes: [],
      businessImpactExplanation,
    });
    await act(async () => resolve[0]!(result('旧推想')));
    expect(hook.result.current.sandbox?.loading).toBe(true);
    await act(async () => resolve[1]!(result('新推想')));
    expect(hook.result.current.sandbox?.result).toEqual(result('新推想'));
  });
});
