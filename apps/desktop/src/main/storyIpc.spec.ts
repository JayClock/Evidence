import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { collectFlowScenarios } from '@evidence-poc/evidence-model-core';
import {
  WHAT_IF_CHALLENGE_SUGGESTION_PROMPT,
  type StoryAgent,
} from '@evidence-poc/evidence-agent';
import {
  initializeWorkspace,
  readModelDirectory,
} from '@evidence-poc/evidence-model-io';

import {
  STORY_IPC_CHANNELS,
  type StorySnapshot,
  type StoryEnrichStepInput,
  type StoryEnrichStepResult,
} from '@evidence-poc/desktop-contracts/story';
import { registerStoryIpc, type StoryIpcOptions } from './storyIpc';
import { createStoryNarrationCache } from './storyNarrationCache';

const electron = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => Promise<unknown>>(),
}));
vi.mock('electron', () => ({
  ipcMain: {
    handle: (
      channel: string,
      handler: (...args: unknown[]) => Promise<unknown>,
    ) => electron.handlers.set(channel, handler),
    removeHandler: (channel: string) => electron.handlers.delete(channel),
  },
}));

const fixture = await readModelDirectory(
  path.resolve(
    import.meta.dirname,
    '../../../../libs/evidence-model-core/tests/fixtures/acceptance/procurement/.evidence/model',
  ),
);
expect(fixture.issues).toEqual([]);
const model = () => structuredClone(fixture.document);
const sender = () => ({
  isDestroyed: () => false,
  once: vi.fn(),
  send: vi.fn(),
});
const invoke = <T = unknown>(
  channel: string,
  input: unknown,
  window = sender(),
) => electron.handlers.get(channel)!({ sender: window }, input) as Promise<T>;
const draft = { headline: '核对付款', prose: '根据采购协议核对付款。' };
const request = (
  snapshot: StorySnapshot,
  index = 0,
  rootPath = '/models/p',
): StoryEnrichStepInput => {
  const { stepIndex, stepHash } = snapshot.selected!.projection.scenes[index]!;
  return {
    rootPath,
    snapshotId: snapshot.snapshotId,
    stepIndex,
    stepHash,
    requestId: crypto.randomUUID(),
    storyHistory: [],
  };
};
const enrich = (
  input: StoryEnrichStepInput,
  window: ReturnType<typeof sender>,
) =>
  invoke<StoryEnrichStepResult | null>(
    STORY_IPC_CHANNELS.ENRICH_STEP,
    input,
    window,
  );
const register = (options: StoryIpcOptions = {}) =>
  registerStoryIpc({ readModel: async () => model(), ...options });

afterEach(() => {
  electron.handlers.clear();
});

describe('story IPC', () => {
  it('enriches an eligible scene in parallel, verifies its draft, and restores it offline until the rules change', async () => {
    const rootPath = await mkdtemp(path.join(os.tmpdir(), 'story-challenges-'));
    const document = model();
    const rule = {
      ...document.rules[0]!,
      id: 'rule.late',
      kind: 'breach' as const,
      label: '付款逾期',
      expression: 'asOf > request.expired_at',
      resultType: 'bool' as const,
      bindings: {
        request: { ref: 'request.payment' },
        asOf: { type: 'timestamp' as const },
      },
    };
    delete rule.target;
    document.rules.push(rule);
    await initializeWorkspace(rootPath, document);
    const card = {
      id: 'late',
      label: '逾期三天未付款',
      category: 'overdue',
      question: '如果超过付款期限三天仍未付款，会怎样？',
      targetedRuleId: rule.id,
      hypothesisDraft: { asOf: '2026-04-04T10:00:00Z' },
    };
    const jobs = new Map<string, (response: unknown) => void>();
    const generate = vi.fn<StoryAgent['generate']>(
      ({ systemPrompt }) =>
        new Promise((resolve) => jobs.set(systemPrompt, resolve)),
    );
    const createAgent = vi.fn(() => ({ generate }));
    let ipc = register({ createAgent });
    const window = sender();
    const load = () =>
      invoke<StorySnapshot>(
        STORY_IPC_CHANNELS.LOAD,
        { rootPath, document },
        window,
      );
    try {
      const scene = request(await load(), 1, rootPath);
      const pending = enrich(scene, window);
      await vi.waitFor(() => expect(jobs.size).toBe(2));
      const prompt = generate.mock.calls.find(
        ([job]) => job.systemPrompt === WHAT_IF_CHALLENGE_SUGGESTION_PROMPT,
      )![0];
      expect(JSON.parse(prompt.userPrompt)).toMatchObject({
        currentActivity: {
          workObject: 'payment request',
          fulfillment: { phase: 'request' },
        },
        inputAttributes: expect.arrayContaining([
          expect.objectContaining({ name: 'quantity' }),
        ]),
        commitments: [
          expect.objectContaining({ entityId: 'contract.agreement' }),
        ],
        decisionRules: [expect.objectContaining({ id: rule.id })],
        expectation: expect.any(Object),
      });
      for (const [purpose, finish] of jobs)
        finish(
          purpose === WHAT_IF_CHALLENGE_SUGGESTION_PROMPT
            ? {
                challenges: [
                  card,
                  {
                    ...card,
                    id: 'bad',
                    question: '未建模的字段',
                    hypothesisDraft: { values: { invented: 5 } },
                  },
                  {
                    ...card,
                    id: 'early',
                    question: '按时付款',
                    hypothesisDraft: { asOf: '2026-04-01T10:00:00Z' },
                  },
                ],
              }
            : draft,
        );
      await expect(pending).resolves.toMatchObject({
        cached: false,
        challenges: [card],
      });
      await expect(enrich(scene, window)).resolves.toMatchObject({
        cached: true,
        challenges: [card],
      });
      await vi.waitFor(async () =>
        expect(
          (
            await createStoryNarrationCache()(rootPath).read(
              new AbortController().signal,
            )
          ).size,
        ).toBe(1),
      );
      ipc.dispose();
      createAgent.mockClear();
      ipc = register({ createAgent });
      const restored = await load();
      await expect(
        enrich({ ...request(restored, 1, rootPath), cacheOnly: true }, window),
      ).resolves.toMatchObject({ cached: true, challenges: [card] });
      await expect(
        invoke(
          STORY_IPC_CHANNELS.WHAT_IF,
          {
            rootPath,
            document,
            flowId: restored.selected!.flow.flowId,
            currentStepSequence: scene.stepIndex,
            stepHash: scene.stepHash,
            question: card.question,
            hypothesisDraft: card.hypothesisDraft,
            targetedRuleId: rule.id,
            localOnly: true,
          },
          window,
        ),
      ).resolves.toMatchObject({
        isSpeculative: false,
        ruleOutcome: { ruleId: rule.id, result: true },
      });
      rule.expression = 'false';
      const edited = request(await load(), 1, rootPath);
      expect(edited.stepHash).toBe(scene.stepHash);
      await expect(
        enrich({ ...edited, cacheOnly: true }, window),
      ).resolves.toBeNull();
      expect(createAgent).not.toHaveBeenCalled();
    } finally {
      ipc.dispose();
      await rm(rootPath, { recursive: true, force: true });
    }
  });
  it('returns flow inventory and factual cards without accessing AI or reading disk for a live snapshot', async () => {
    const getModelOptions = vi.fn(async () => {
      throw new Error('AI_NOT_CONFIGURED');
    });
    const readModel = vi.fn();
    register({ getModelOptions, readModel });
    const window = sender();
    const document = model();
    const input = {
      rootPath: '/models/p',
      document,
      preferredFlowId: 'disappeared',
    };
    const first = await invoke<StorySnapshot>(
      STORY_IPC_CHANNELS.LOAD,
      input,
      window,
    );
    expect(first.flows.map(({ flowId }) => flowId)).toEqual(
      collectFlowScenarios(document).map(({ flowId }) => flowId),
    );
    expect(first.selected?.flow.flowId).toBe(first.flows[0]?.flowId);
    document.entities.find(
      ({ id }) => id === 'request.payment',
    )!.examples![0]!.value.quantity = 12;
    const second = await invoke<StorySnapshot>(
      STORY_IPC_CHANNELS.LOAD,
      input,
      window,
    );
    expect(second.snapshotId).not.toBe(first.snapshotId);
    expect(second.selected?.flow.traceDigest).not.toBe(
      first.selected?.flow.traceDigest,
    );
    expect(
      second.selected?.projection.scenes.flatMap(({ documentCard }) => [
        ...documentCard.keyAttributes,
        ...documentCard.generalAttributes,
      ]),
    ).toContainEqual(
      expect.objectContaining({ name: 'quantity', value: '12' }),
    );
    expect(
      second.selected?.projection.scenes.some(
        (scene) => scene.expectation?.isControlGap,
      ),
    ).toBe(true);
    expect(readModel).not.toHaveBeenCalled();
    expect(getModelOptions).not.toHaveBeenCalled();
  });

  it('reads a saved workspace through the real adapters', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'story-ipc-'));
    const ipc = registerStoryIpc();
    try {
      const rootPath = root;
      await initializeWorkspace(rootPath, model());
      const result = await invoke<StorySnapshot>(STORY_IPC_CHANNELS.LOAD, {
        rootPath,
      });
      expect(result.flows).toHaveLength(collectFlowScenarios(model()).length);
      expect(result.selected?.projection.scenes).toHaveLength(
        result.selected!.flow.steps.length,
      );
    } finally {
      ipc.dispose();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('enriches exactly the requested step with its verified history', async () => {
    const generate = vi.fn(async (_request: { userPrompt: string }) => draft);
    const ipc = register({ createAgent: () => ({ generate }) });
    const window = sender();
    const document = model();
    document.entities.find(
      ({ id }) => id === 'contract.agreement',
    )!.examples![0]!.description = '新合同账期为五天。';
    const baseline = await invoke<StorySnapshot>(
      STORY_IPC_CHANNELS.LOAD,
      { rootPath: '/models/p', document },
      window,
    );
    expect(generate).not.toHaveBeenCalled();
    const input = request(baseline, 2);
    await expect(
      enrich(
        {
          ...input,
          storyHistory: [
            {
              stepIndex: input.stepIndex,
              headline: '错误',
              summary: '不是前情',
            },
          ],
        },
        window,
      ),
    ).rejects.toThrow('前情');
    await expect(
      enrich({ ...input, rootPath: '/other/project' }, window),
    ).rejects.toThrow('快照已过期');
    await expect(
      enrich({ ...input, stepHash: 'wrong' }, window),
    ).rejects.toThrow('步骤已变化');
    await expect(enrich(input, sender())).rejects.toThrow('快照已过期');
    await expect(enrich(request(baseline), window)).resolves.toBeNull();
    await expect(
      enrich(
        {
          ...input,
          storyHistory: [
            { stepIndex: 1, headline: '旧合同', summary: '原账期' },
            { stepIndex: 2, headline: '付款申请', summary: '前序草稿' },
          ],
        },
        window,
      ),
    ).resolves.toEqual({
      stepIndex: input.stepIndex,
      stepHash: input.stepHash,
      narrative: {
        headline: baseline.selected?.projection.scenes[2]?.narrative.headline,
        prose: draft.prose,
      },
      cached: false,
    });
    expect(generate).toHaveBeenCalledOnce();
    expect(JSON.parse(generate.mock.calls[0]![0].userPrompt)).toMatchObject({
      storyHistory: [
        { stepIndex: 1, summary: '新合同账期为五天。' },
        { stepIndex: 2, summary: '前序草稿' },
      ],
      currentActivity: { stepIndex: input.stepIndex },
    });
    expect(window.send).not.toHaveBeenCalled();
    ipc.dispose();
    expect(electron.handlers.size).toBe(0);
  });

  it('reads causally keyed cached drafts after restarting without a provider', async () => {
    const rootPath = await mkdtemp(path.join(os.tmpdir(), 'story-ipc-drafts-'));
    const document = model();
    const contract = document.entities.find(
      ({ id }) => id === 'contract.agreement',
    )!.examples![0]!;
    contract.description = '旧的账期。';
    await initializeWorkspace(rootPath, document);
    const cache = createStoryNarrationCache()(rootPath);
    const signal = new AbortController().signal;
    const waitForEntries = (size: number) =>
      vi.waitFor(async () =>
        expect((await cache.read(signal)).size).toBe(size),
      );
    const generate = vi.fn(async () => draft);
    const getModelOptions = vi.fn(async () => ({}));
    const load = (window: ReturnType<typeof sender>) =>
      invoke<StorySnapshot>(
        STORY_IPC_CHANNELS.LOAD,
        { rootPath, document },
        window,
      );
    let ipc = register({ getModelOptions, createAgent: () => ({ generate }) });
    try {
      const before = sender();
      const initial = await load(before);
      const first = request(initial, 1, rootPath);
      await expect(enrich(first, before)).resolves.toMatchObject({
        cached: false,
      });
      await waitForEntries(1);
      ipc.dispose();
      generate.mockClear();
      getModelOptions.mockClear();
      ipc = register({ getModelOptions, createAgent: () => ({ generate }) });
      const after = sender();
      const restored = await load(after);
      await expect(
        enrich({ ...request(restored, 1, rootPath), cacheOnly: true }, after),
      ).resolves.toMatchObject({ cached: true });
      contract.description = '新的账期。';
      const changed = request(await load(after), 1, rootPath);
      expect(changed.stepHash).toBe(first.stepHash);
      await expect(
        enrich({ ...changed, cacheOnly: true }, after),
      ).resolves.toBeNull();
      expect(getModelOptions).not.toHaveBeenCalled();
      expect(generate).not.toHaveBeenCalled();
      await expect(enrich(changed, after)).resolves.toMatchObject({
        cached: false,
      });
      expect(generate).toHaveBeenCalledOnce();
      // The original cache file already exists. Wait for the new history key
      // to be persisted before removing the workspace.
      await waitForEntries(2);
    } finally {
      ipc.dispose();
      await rm(rootPath, { recursive: true, force: true });
    }
  });

  it('rejects late load responses and outdated snapshots', async () => {
    let readOld!: (value: ReturnType<typeof model>) => void;
    const ipc = register({
      readModel: () =>
        new Promise((resolve) => {
          readOld = resolve;
        }),
    });
    const window = sender();
    const rootPath = '/models/p';
    const obsolete = invoke(STORY_IPC_CHANNELS.LOAD, { rootPath }, window);
    const expected = expect(obsolete).rejects.toThrow('快照已过期');
    const active = await invoke<StorySnapshot>(
      STORY_IPC_CHANNELS.LOAD,
      { rootPath, document: model() },
      window,
    );
    readOld(model());
    await expected;
    await expect(
      enrich({ ...request(active), snapshotId: 'stale' }, window),
    ).rejects.toThrow('快照已过期');
    ipc.dispose();
  });

  it('cancels only the active request and drops late results after reset, load, or destruction', async () => {
    const started: { signal: AbortSignal; finish: (value: unknown) => void }[] =
      [];
    const createAgent = vi.fn(() => ({
      generate: ({ signal }: { signal?: AbortSignal }) => {
        if (!signal) throw new Error('Expected abort propagation');
        return new Promise((finish) => started.push({ signal, finish }));
      },
    }));
    const ipc = register({ createAgent });
    const window = sender();
    const rootPath = '/models/p';
    const load = () =>
      invoke<StorySnapshot>(STORY_IPC_CHANNELS.LOAD, { rootPath }, window);
    const snapshot = await load();
    const first = request(snapshot);
    const a = enrich(first, window);
    await vi.waitFor(() => expect(started).toHaveLength(1));
    const second = request(snapshot, 1);
    const b = enrich(second, window);
    await expect(a).resolves.toBeNull();
    expect(started[0]?.signal.aborted).toBe(true);
    await vi.waitFor(() => expect(started).toHaveLength(2));
    await invoke(STORY_IPC_CHANNELS.CANCEL_STEP, first, window);
    expect(started[1]?.signal.aborted).toBe(false);
    await invoke(STORY_IPC_CHANNELS.CANCEL_STEP, second, window);
    await expect(b).resolves.toBeNull();
    const c = enrich(request(snapshot), window);
    await vi.waitFor(() => expect(started).toHaveLength(3));
    ipc.resetModels();
    await expect(c).resolves.toBeNull();
    expect(window.send).toHaveBeenCalledWith(STORY_IPC_CHANNELS.INVALIDATED, {
      rootPath,
      kind: 'narration',
    });
    const d = enrich(request(snapshot), window);
    await vi.waitFor(() => expect(started).toHaveLength(4));
    const next = await load();
    await expect(d).resolves.toBeNull();
    const e = enrich(request(next), window);
    await vi.waitFor(() => expect(started).toHaveLength(5));
    window.once.mock.calls[0]![1]();
    await expect(e).resolves.toBeNull();
    expect(started.every(({ signal }) => signal.aborted)).toBe(true);
    started.forEach(({ finish }) => finish(draft));
    expect(createAgent).toHaveBeenCalledTimes(2);
    ipc.dispose();
  });

  it.each([undefined, false, true])(
    'forwards a read-only question with AI opt-in %s',
    async (allowSpeculative) => {
      const simulated = { businessImpactExplanation: '可能影响后续交货' };
      const simulate = vi.fn().mockResolvedValue(simulated);
      register({ simulate });
      const document = model();
      const flow = collectFlowScenarios(document)[0]!;
      const step = flow.steps[0]!;
      const before = structuredClone(document);
      const result = await invoke<{ businessImpactExplanation: string }>(
        STORY_IPC_CHANNELS.WHAT_IF,
        {
          rootPath: '/models/p',
          document,
          flowId: flow.flowId,
          currentStepSequence: step.sequence,
          stepHash: step.stepHash,
          question: '  如果只付300？  ',
          allowSpeculative,
        },
      );
      expect(result).toEqual(simulated);
      expect(simulate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: document,
          currentStepSequence: step.sequence,
          hypothesisQuestion: '如果只付300？',
        }),
        expect.objectContaining({ agent: expect.any(Object) }),
      );
      expect(simulate.mock.calls[0]![0].allowSpeculative).toBe(
        allowSpeculative === true ? true : undefined,
      );
      expect(document).toEqual(before);
    },
  );

  it('rejects invalid envelopes, unknown flows, empty questions and stale steps', async () => {
    const simulate = vi.fn();
    register({ simulate });
    await expect(
      invoke(STORY_IPC_CHANNELS.LOAD, { rootPath: 'relative' }),
    ).rejects.toThrow('路径');
    await expect(
      invoke(STORY_IPC_CHANNELS.ENRICH_STEP, { stepIndex: 0 }),
    ).rejects.toThrow('无效的业务故事步骤请求');
    await expect(
      invoke(STORY_IPC_CHANNELS.WHAT_IF, { question: ' ' }),
    ).rejects.toThrow('假设问题');
    await expect(
      invoke(STORY_IPC_CHANNELS.WHAT_IF, {
        question: '付款300？',
        allowSpeculative: 'true',
      }),
    ).rejects.toThrow('业务沙盘模式');
    await expect(
      invoke(STORY_IPC_CHANNELS.WHAT_IF, {
        rootPath: '/p',
        flowId: collectFlowScenarios(model())[0]!.flowId,
        currentStepSequence: 1,
        stepHash: 'obsolete',
        question: '付款300？',
      }),
    ).rejects.toThrow('已变化');
    expect(simulate).not.toHaveBeenCalled();
  });
});
