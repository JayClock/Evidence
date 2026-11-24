import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { ipcMain, type WebContents } from 'electron';
import {
  createNarrationScheduler,
  createStoryAgent,
  createStoryNarrator,
  projectStoryFacts,
  simulateWhatIf,
  type StoryAgent,
  type EvidenceModelOptions,
} from '@evidence-poc/evidence-agent';
import {
  buildFmCheckReport,
  collectFlowScenarios,
  type FlowScenarioTrace,
} from '@evidence-poc/evidence-model-core';
import {
  openWorkspace,
  readModelDirectory,
} from '@evidence-poc/evidence-model-io';
import {
  DomainModelDocumentSchema,
  type DomainModelDocument,
} from '@evidence-poc/evidence-schema';

import {
  STORY_IPC_CHANNELS,
  type StoryModelInput,
  type StoryLoadInput,
  type StoryNarrationEvent,
  type StoryNarrationInput,
  type StoryNarrationJob,
  type StorySnapshot,
  type StoryWhatIfInput,
} from '@evidence-poc/desktop-contracts/story';
import { createStoryNarrationCache } from './storyNarrationCache';

export interface StoryIpcOptions {
  readModel?: (rootPath: string) => Promise<DomainModelDocument>;
  createAgent?: typeof createStoryAgent;
  simulate?: typeof simulateWhatIf;
  getModelOptions?: () => Promise<EvidenceModelOptions>;
  ownsProject?: (sender: WebContents, rootPath: string) => boolean;
}

const readSavedModel = async (
  rootPath: string,
): Promise<DomainModelDocument> => {
  const parsed = await readModelDirectory(openWorkspace(rootPath).model);
  // Structural failures cannot be narrated as a legitimate empty story.
  if (parsed.issues.length > 0)
    throw new Error(parsed.issues.map((issue) => issue.message).join('\n'));
  return parsed.document;
};

type WindowStory = {
  rootPath: string;
  loadId?: string;
  selected?: { model: DomainModelDocument; flow: FlowScenarioTrace };
  narrator?: ReturnType<typeof createStoryNarrator>;
  job?: { id: string; controller: AbortController };
};

const NARRATION_TIMEOUT_MS = 60_000;
const validId = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 128;

export const registerStoryIpc = ({
  readModel = readSavedModel,
  createAgent = createStoryAgent,
  simulate = simulateWhatIf,
  getModelOptions,
  ownsProject = () => true,
}: StoryIpcOptions = {}) => {
  const windows = new Map<WebContents, WindowStory>();
  const schedule = createNarrationScheduler();
  const storeFor = createStoryNarrationCache();
  const stop = (state: WindowStory) => {
    const job = state.job;
    delete state.job;
    job?.controller.abort();
  };

  const newNarrator = (rootPath: string) => {
    let agent: Promise<StoryAgent> | undefined;
    return createStoryNarrator({
      schedule,
      store: storeFor(rootPath),
      agent: {
        async generate(request) {
          agent ??= Promise.resolve()
            .then(async () => createAgent(await getModelOptions?.()))
            .catch((error: unknown) => {
              agent = undefined;
              throw error;
            });
          const active = await agent;
          request.signal?.throwIfAborted();
          return active.generate(request);
        },
      },
    });
  };

  const load = async (input: StoryModelInput) => {
    if (
      !input ||
      typeof input.rootPath !== 'string' ||
      !path.isAbsolute(input.rootPath)
    )
      throw new Error('无效的业务流项目路径。');
    const model = DomainModelDocumentSchema.parse(
      input.document ?? (await readModel(input.rootPath)),
    );
    const { report } = buildFmCheckReport({ model });
    return { model, flows: collectFlowScenarios(model, report) };
  };

  const loadFlow = async (input: StoryWhatIfInput) => {
    if (typeof input?.flowId !== 'string' || !input.flowId.trim())
      throw new Error('请选择业务流。');
    const { model, flows } = await load(input);
    const flow = flows.find(({ flowId }) => flowId === input.flowId);
    if (!flow) throw new Error(`未找到业务流：${input.flowId}`);
    return { model, flow };
  };

  ipcMain.handle(
    STORY_IPC_CHANNELS.LOAD,
    async ({ sender }, input: StoryLoadInput): Promise<StorySnapshot> => {
      if (
        !input ||
        typeof input.rootPath !== 'string' ||
        !path.isAbsolute(input.rootPath)
      )
        throw new Error('无效的业务流项目路径。');
      if (
        input.preferredFlowId !== undefined &&
        (typeof input.preferredFlowId !== 'string' ||
          !input.preferredFlowId.trim())
      )
        throw new Error('无效的业务流 ID。');
      if (sender.isDestroyed() || !ownsProject(sender, input.rootPath))
        throw new Error('业务流窗口未打开此项目。');
      const previous = windows.get(sender);
      if (!previous) {
        sender.once('destroyed', () => {
          const current = windows.get(sender);
          if (current) stop(current);
          windows.delete(sender);
        });
      } else stop(previous);
      const state: WindowStory =
        previous?.rootPath === input.rootPath
          ? previous
          : { rootPath: input.rootPath };
      const snapshotId = randomUUID();
      state.loadId = snapshotId;
      delete state.selected;
      windows.set(sender, state);
      const { model, flows } = await load(input);
      if (
        windows.get(sender) !== state ||
        state.loadId !== snapshotId ||
        sender.isDestroyed()
      )
        throw new Error('业务流快照已过期。');
      const flow =
        flows.find(({ flowId }) => flowId === input.preferredFlowId) ??
        flows[0];
      if (!flow) return { snapshotId, flows };
      const projection = projectStoryFacts(flow, model);
      state.selected = { model, flow };
      return { snapshotId, flows, selected: { flow, projection } };
    },
  );

  ipcMain.handle(
    STORY_IPC_CHANNELS.START_NARRATION,
    async ({ sender }, input: StoryNarrationInput) => {
      if (
        !validId(input?.snapshotId) ||
        !validId(input.jobId) ||
        (input.cacheOnly !== undefined && input.cacheOnly !== true) ||
        (input.prioritySequence !== undefined &&
          (!Number.isSafeInteger(input.prioritySequence) ||
            input.prioritySequence < 1))
      )
        throw new Error('无效的 AI 旁白任务。');
      const state = windows.get(sender);
      if (
        !state?.selected ||
        state.loadId !== input.snapshotId ||
        sender.isDestroyed()
      )
        throw new Error('业务流快照已过期。');
      if (state.job?.id === input.jobId) return;
      stop(state);
      const job = { id: input.jobId, controller: new AbortController() };
      state.job = job;
      const narrator = (state.narrator ??= newNarrator(state.rootPath));
      const { model, flow } = state.selected;
      const identity = { snapshotId: input.snapshotId, jobId: job.id };
      const send = (event: StoryNarrationEvent) => {
        if (
          windows.get(sender) === state &&
          state.job === job &&
          !sender.isDestroyed()
        ) {
          try {
            sender.send(STORY_IPC_CHANNELS.NARRATION, event);
          } catch {
            // Closing/reloading the frame can race with delivery.
            stop(state);
          }
        }
      };
      const deadline = AbortSignal.timeout(NARRATION_TIMEOUT_MS);
      const signal = AbortSignal.any([deadline, job.controller.signal]);
      void (async () => {
        try {
          await narrator.enrich(flow, model, {
            signal,
            cacheOnly: input.cacheOnly === true,
            ...(input.prioritySequence === undefined
              ? {}
              : { prioritySequence: input.prioritySequence }),
            onStep: (result) =>
              send({
                ...identity,
                kind: 'step',
                sequence: result.sequence,
                stepHash: result.stepHash,
                ...(result.kind === 'ready'
                  ? {
                      narrative: result.narrative,
                      ...(result.source === 'cache'
                        ? { cached: true as const }
                        : {}),
                    }
                  : {}),
              }),
          });
          send({
            ...identity,
            kind: 'finished',
            ...(deadline.aborted ? { reason: 'timeout' as const } : {}),
          });
        } catch {
          send({ ...identity, kind: 'finished', reason: 'unavailable' });
        } finally {
          if (state.job === job) stop(state);
        }
      })();
    },
  );

  ipcMain.handle(
    STORY_IPC_CHANNELS.CANCEL_NARRATION,
    async ({ sender }, input: StoryNarrationJob) => {
      const state = windows.get(sender);
      if (
        state?.job &&
        state.loadId === input?.snapshotId &&
        state.job.id === input?.jobId
      )
        stop(state);
    },
  );

  ipcMain.handle(
    STORY_IPC_CHANNELS.WHAT_IF,
    async (_event, input: StoryWhatIfInput) => {
      if (
        typeof input?.question !== 'string' ||
        !input.question.trim() ||
        input.question.length > 4000
      )
        throw new Error('请输入 1–4000 字的假设问题。');
      if (
        input.allowSpeculative !== undefined &&
        typeof input.allowSpeculative !== 'boolean'
      )
        throw new Error('无效的业务沙盘模式。');
      if (
        !Number.isSafeInteger(input.currentStepSequence) ||
        input.currentStepSequence < 1
      )
        throw new Error('无效的业务流步骤。');
      const { model, flow } = await loadFlow(input);
      const step = flow.steps.find(
        ({ sequence }) => sequence === input.currentStepSequence,
      );
      if (!step || step.stepHash !== input.stepHash)
        throw new Error('业务步骤已变化，请刷新放映后重试。');
      return simulate(
        {
          model,
          flow,
          currentStepSequence: input.currentStepSequence,
          hypothesisQuestion: input.question.trim(),
          ...(input.allowSpeculative === true
            ? { allowSpeculative: true }
            : {}),
        },
        {
          agent: createAgent(await getModelOptions?.()),
        },
      );
    },
  );

  return {
    resetModels: () => {
      for (const [sender, state] of windows) {
        stop(state);
        delete state.narrator;
        if (!sender.isDestroyed())
          sender.send(STORY_IPC_CHANNELS.INVALIDATED, {
            rootPath: state.rootPath,
            kind: 'narration',
          });
      }
    },
    dispose: () => {
      for (const state of windows.values()) stop(state);
      windows.clear();
      for (const channel of [
        STORY_IPC_CHANNELS.LOAD,
        STORY_IPC_CHANNELS.START_NARRATION,
        STORY_IPC_CHANNELS.CANCEL_NARRATION,
        STORY_IPC_CHANNELS.WHAT_IF,
      ])
        ipcMain.removeHandler(channel);
    },
  };
};
