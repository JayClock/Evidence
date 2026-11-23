import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { collectFlowScenarios } from '@evidence-poc/evidence-model-core';
import {
  writeModelBundle,
  writeModelDirectory,
} from '@evidence-poc/evidence-model-io';
import { DomainModelDocumentSchema } from '@evidence-poc/evidence-schema';

import {
  STORY_IPC_CHANNELS,
  type StorySnapshot,
} from '@evidence-poc/desktop-contracts/story';
import { registerStoryIpc, type StoryIpcOptions } from './storyIpc';

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

const model = () =>
  DomainModelDocumentSchema.parse(
    JSON.parse(
      readFileSync(
        path.resolve(
          import.meta.dirname,
          '../../../../libs/evidence-model-core/tests/fixtures/acceptance/procurement.evidence.json',
        ),
        'utf8',
      ),
    ),
  );
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
const register = (options: StoryIpcOptions = {}) =>
  registerStoryIpc({ readModel: async () => model(), ...options });

afterEach(() => {
  electron.handlers.clear();
});

describe('story IPC', () => {
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
      second.selected?.projection.scenes.flatMap(
        (scene) => scene.documentCard.fields,
      ),
    ).toContainEqual(
      expect.objectContaining({ name: 'quantity', value: '12' }),
    );
    expect(
      second.selected?.projection.scenes.some((scene) => scene.pendingSuspense),
    ).toBe(true);
    expect(readModel).not.toHaveBeenCalled();
    expect(getModelOptions).not.toHaveBeenCalled();
  });

  it.each(['directory', 'bundle'])(
    'reads saved %s projects through the real adapters',
    async (kind) => {
      const root = await mkdtemp(path.join(os.tmpdir(), 'story-ipc-'));
      const ipc = registerStoryIpc();
      try {
        const rootPath =
          kind === 'bundle' ? path.join(root, 'model.evidence.json') : root;
        if (kind === 'bundle') await writeModelBundle(rootPath, model());
        else
          await writeModelDirectory(path.join(root, '.evidence/fm'), model());
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
    },
  );

  it('streams narration only after an explicit start and releases handlers on disposal', async () => {
    const generate = vi.fn(async () => ({
      narrative: '根据采购协议核对付款。',
    }));
    const ipc = register({ createAgent: () => ({ generate }) });
    const window = sender();
    const baseline = await invoke<StorySnapshot>(
      STORY_IPC_CHANNELS.LOAD,
      { rootPath: '/models/p' },
      window,
    );
    expect(generate).not.toHaveBeenCalled();
    const job = { snapshotId: baseline.snapshotId, jobId: 'job' };
    await invoke(STORY_IPC_CHANNELS.START_NARRATION, job, window);
    await vi.waitFor(() =>
      expect(window.send).toHaveBeenCalledWith(STORY_IPC_CHANNELS.NARRATION, {
        ...job,
        kind: 'finished',
      }),
    );
    expect(window.send).toHaveBeenCalledWith(STORY_IPC_CHANNELS.NARRATION, {
      ...job,
      kind: 'step',
      sequence: 1,
      stepHash: baseline.selected!.flow.steps[0]!.stepHash,
      narrative: '根据采购协议核对付款。',
    });
    ipc.dispose();
    expect(electron.handlers.size).toBe(0);
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
      invoke(STORY_IPC_CHANNELS.START_NARRATION, {
        snapshotId: 'missing',
        jobId: 'job',
      }),
    ).rejects.toThrow('快照已过期');
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
