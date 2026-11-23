import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDesktopFixture } from '@evidence-poc/desktop-testing';
import type {
  StoryInvalidatedEvent,
  StoryLoadInput,
  StoryNarrationEvent,
  StoryNarrationInput,
  StorySnapshot,
} from '@evidence-poc/desktop-contracts/story';
import type { DomainModelDocument } from '@evidence-poc/evidence-schema';
import type { WhatIfResult } from '@evidence-poc/evidence-agent/browser';
import { installDesktopApi } from '@evidence-poc/desktop-testing/desktopApi';
import { storyFlow, storySnapshot } from '@evidence-poc/desktop-testing/story';
import {
  STORY_REFRESH_DELAY,
  STORY_STEP_DURATION,
  useStoryPlayback,
} from './useStoryPlayback';

const setup = (enabled = true) => {
  vi.useFakeTimers();
  const api = installDesktopApi();
  const flow = storyFlow();
  const load = vi.fn<(input: StoryLoadInput) => Promise<StorySnapshot>>(
    async () => storySnapshot([flow]),
  );
  const startNarration = vi.fn<(input: StoryNarrationInput) => Promise<void>>(
    async () => undefined,
  );
  const cancelNarration = vi.fn(async () => undefined);
  const narrationListeners = new Set<(event: StoryNarrationEvent) => void>();
  const listeners = new Set<(event: StoryInvalidatedEvent) => void>();
  Object.assign(api.story, {
    load,
    startNarration,
    cancelNarration,
    onNarration: (listener: (event: StoryNarrationEvent) => void) => {
      narrationListeners.add(listener);
      return () => {
        narrationListeners.delete(listener);
      };
    },
    whatIf: vi.fn(),
    onInvalidated: (listener: (event: StoryInvalidatedEvent) => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  });
  const onInvalidated = vi.fn(async () => undefined);
  const hook = renderHook(
    (props: {
      document: DomainModelDocument;
      enabled: boolean;
      refreshSavedSources?: boolean;
      aiConfigured?: boolean;
    }) =>
      useStoryPlayback({
        api: api.story,
        rootPath: '/models/test',
        onInvalidated,
        ...props,
      }),
    {
      initialProps: { document: createDesktopFixture(), enabled } as {
        document: DomainModelDocument;
        enabled: boolean;
        refreshSavedSources?: boolean;
        aiConfigured?: boolean;
      },
    },
  );
  return {
    api,
    flow,
    load,
    startNarration,
    cancelNarration,
    narrationListeners,
    narrate: (event: StoryNarrationEvent) =>
      act(() => narrationListeners.forEach((listener) => listener(event))),
    hook,
    onInvalidated,
    listeners,
    invalidate: (rootPath = '/models/test', kind?: 'narration') =>
      act(() => {
        listeners.forEach((listener) =>
          listener({ rootPath, ...(kind ? { kind } : {}) }),
        );
      }),
  };
};
const tick = async (ms = STORY_REFRESH_DELAY) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};
afterEach(() => vi.useRealTimers());

describe('story playback', () => {
  it('reads only cached candidates without credentials and starts AI without reloading facts after configuration', async () => {
    const { hook, load, flow, startNarration, narrate } = setup();
    const document = createDesktopFixture();
    hook.rerender({ document, enabled: true, aiConfigured: false });
    await tick();
    expect(hook.result.current.ready).toBe(true);
    const job = startNarration.mock.calls[0]![0];
    expect(job.cacheOnly).toBe(true);
    narrate({
      ...job,
      kind: 'step',
      sequence: 1,
      stepHash: flow.steps[0]!.stepHash,
      narrative: '本地草稿',
      cached: true,
    });
    narrate({ ...job, kind: 'finished' });
    expect(hook.result.current.scene).toMatchObject({
      narrative: '本地草稿',
      narrativeSource: 'cache',
    });
    expect(hook.result.current.narration.incomplete).toBe(false);
    act(() => hook.result.current.setSkipAi(true));
    expect(hook.result.current.scene?.narrativeSource).toBe('facts');
    expect(startNarration).toHaveBeenCalledOnce();
    hook.rerender({ document, enabled: true, aiConfigured: true });
    act(() => hook.result.current.setSkipAi(false));
    expect(startNarration).toHaveBeenCalledTimes(2);
    expect(startNarration.mock.calls[1]![0].cacheOnly).toBeUndefined();
    expect(load).toHaveBeenCalledOnce();
    expect(hook.result.current.ready).toBe(true);
  });
  it('plays an entirely explained flow without starting a narration job', async () => {
    const { hook, load, flow, startNarration } = setup();
    load.mockResolvedValue(
      storySnapshot([
        {
          ...flow,
          steps: flow.steps.map((step) => ({
            ...step,
            description: '已确认的业务说明。',
          })),
        },
      ]),
    );
    await tick();
    expect(hook.result.current.scene).toMatchObject({
      narrativeSource: 'model',
      narrative: '已确认的业务说明。',
    });
    expect(hook.result.current.ready).toBe(true);
    expect(startNarration).not.toHaveBeenCalled();
  });

  it('advances before any provider result and merges only matching narration without resetting the clock', async () => {
    const { hook, flow, narrate, load, startNarration } = setup();
    await tick();
    const job = startNarration.mock.calls[0]![0];
    const timeline = hook.result.current.timeline;
    expect(hook.result.current).toMatchObject({
      ready: true,
      loading: false,
      narration: { running: true, completed: 0 },
    });
    act(() => hook.result.current.togglePlaying());
    await tick(STORY_STEP_DURATION);
    expect(hook.result.current.step?.sequence).toBe(2);
    const step = {
      ...job,
      kind: 'step' as const,
      sequence: 2,
      stepHash: flow.steps[1]!.stepHash,
    };
    const fact = hook.result.current.scene;
    narrate({ ...step, snapshotId: 'old', narrative: '过时快照' });
    narrate({ ...step, jobId: 'old', narrative: '过时任务' });
    narrate({ ...step, stepHash: 'old', narrative: '过时步骤' });
    expect(hook.result.current.scene).toEqual(fact);
    narrate({ ...step, narrative: '当前旁白' });
    expect(hook.result.current.scene).toEqual({
      ...fact,
      narrative: '当前旁白',
      narrativeSource: 'ai',
    });
    expect(hook.result.current.timeline).toBe(timeline);
    expect(hook.result.current.isPlaying).toBe(true);
    expect(load).toHaveBeenCalledOnce();
  });

  it('keeps facts on partial failure, retries prose only and cancels on exit', async () => {
    const {
      hook,
      flow,
      narrate,
      load,
      startNarration,
      cancelNarration,
      narrationListeners,
    } = setup();
    await tick();
    const job = startNarration.mock.calls[0]![0];
    narrate({
      ...job,
      kind: 'step',
      sequence: 1,
      stepHash: flow.steps[0]!.stepHash,
      narrative: '保留这段旁白',
    });
    narrate({
      ...job,
      kind: 'step',
      sequence: 2,
      stepHash: flow.steps[1]!.stepHash,
    });
    narrate({ ...job, kind: 'finished', reason: 'timeout' });
    expect(hook.result.current).toMatchObject({
      ready: true,
      canNext: true,
      narration: { running: false, incomplete: true },
    });
    act(() => hook.result.current.narration.retry());
    expect(hook.result.current.scene?.narrative).toBe('保留这段旁白');
    const retry = startNarration.mock.calls[1]![0];
    expect(retry.snapshotId).toBe(job.snapshotId);
    expect(retry.jobId).not.toBe(job.jobId);
    narrate({
      ...job,
      kind: 'step',
      sequence: 1,
      stepHash: flow.steps[0]!.stepHash,
      narrative: '忽略旧事件',
    });
    expect(hook.result.current.scene?.narrative).toBe('保留这段旁白');
    expect(load).toHaveBeenCalledOnce();
    hook.unmount();
    expect(cancelNarration).toHaveBeenLastCalledWith({
      jobId: retry.jobId,
      snapshotId: retry.snapshotId,
    });
    expect(narrationListeners.size).toBe(0);
  });

  it('replaces narration on AI configuration changes without refreshing facts or pausing playback', async () => {
    const {
      hook,
      flow,
      narrate,
      load,
      startNarration,
      invalidate,
      onInvalidated,
    } = setup();
    await tick();
    const job = startNarration.mock.calls[0]![0];
    narrate({
      ...job,
      kind: 'step',
      sequence: 1,
      stepHash: flow.steps[0]!.stepHash,
      narrative: '上一模型旁白',
    });
    act(() => hook.result.current.togglePlaying());
    invalidate('/models/test', 'narration');
    expect(hook.result.current.scene?.narrativeSource).toBe('facts');
    expect(hook.result.current.isPlaying).toBe(true);
    expect(hook.result.current.ready).toBe(true);
    expect(startNarration).toHaveBeenCalledTimes(2);
    expect(load).toHaveBeenCalledOnce();
    expect(onInvalidated).not.toHaveBeenCalled();
  });

  it('times out a silent narration transport without blocking playback', async () => {
    const { hook, cancelNarration } = setup();
    await tick();
    await tick(65_000);
    expect(hook.result.current).toMatchObject({
      ready: true,
      loading: false,
      narration: { running: false, incomplete: true },
    });
    expect(cancelNarration).toHaveBeenCalledOnce();
  });

  it('uses the injected transport without a desktop global', async () => {
    const { load, hook } = setup();
    Reflect.deleteProperty(window, 'evidenceAPI');
    await tick();
    expect(load).toHaveBeenCalledOnce();
    expect(hook.result.current.ready).toBe(true);
    hook.unmount();
  });

  it('does no work outside walkthrough mode, debounces snapshots and guards step boundaries', async () => {
    const { hook, load } = setup(false);
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

  it('resolves canonical and alias-based document dependencies for canvas focus', async () => {
    const { hook, flow, load } = setup();
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
    const { hook } = setup();
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
    const { hook, onInvalidated, load } = setup(false);
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
    const { hook, load, flow, invalidate, onInvalidated, listeners } = setup();
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
    const { hook, load } = setup();
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
    const { hook, load, startNarration } = setup();
    load.mockRejectedValueOnce(new Error('模型暂不可读'));
    await tick();
    expect(hook.result.current.error).toBe('模型暂不可读');
    load.mockResolvedValueOnce(storySnapshot([]));
    act(() => hook.result.current.retry());
    await tick();
    expect(hook.result.current.loading).toBe(false);
    expect(hook.result.current.step).toBeUndefined();
    expect(startNarration).not.toHaveBeenCalled();
  });

  it('resets a disappeared flow and rejects stale sandbox answers after navigation', async () => {
    const { hook, api, flow, load } = setup();
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
    const { hook, api } = setup();
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
