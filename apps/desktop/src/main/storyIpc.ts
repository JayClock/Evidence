import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { ipcMain, type WebContents } from 'electron';
import {
  createStoryAgent,
  createStoryNarrator,
  projectStoryFacts,
  simulateWhatIf,
  storyHistoryItem,
  type StoryAgent,
  type StoryStepHistoryItem,
  type EvidenceModelOptions,
} from '@evidence-poc/evidence-agent';
import {
  buildFmCheckReport,
  resolveStoryTraces,
  createDomainGraph,
  type DomainGraph,
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
  type StoryEnrichStepInput,
  type StoryEnrichStepResult,
  type StoryStepRequest,
  type StorySnapshot,
  type StoryProjectResult,
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
  selected?: StoryProjectResult & { graph: DomainGraph };
  narrator?: ReturnType<typeof createStoryNarrator>;
  pending?: { identity: StoryStepRequest; controller: AbortController };
};

const validId = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 128;

const historyFor = (
  input: StoryEnrichStepInput,
  projection: StoryProjectResult['projection'],
): StoryStepHistoryItem[] => {
  const prior = projection.scenes.filter(
    ({ stepIndex }) => stepIndex < input.stepIndex,
  );
  if (
    !Array.isArray(input.storyHistory) ||
    input.storyHistory.length > prior.length
  )
    throw new Error('无效的业务故事前情。');
  const byIndex = new Map(prior.map((scene) => [scene.stepIndex, scene]));
  const ready = new Map<number, StoryStepHistoryItem>();
  let previous = 0;
  for (const item of input.storyHistory) {
    const scene = byIndex.get(item?.stepIndex);
    if (!scene || scene.stepIndex <= previous)
      throw new Error('无效的业务故事前情。');
    previous = scene.stepIndex;
    // Explanations always come from the current model revision, never from an old draft.
    if (scene.narrative.status === 'authored') continue;
    if (
      typeof item.headline !== 'string' ||
      !item.headline.trim() ||
      item.headline.length > 180 ||
      typeof item.summary !== 'string' ||
      !item.summary.trim() ||
      item.summary.length > 600
    )
      throw new Error('无效的业务故事前情。');
    ready.set(item.stepIndex, {
      stepIndex: item.stepIndex,
      headline: item.headline,
      summary: item.summary,
    });
  }
  return prior.flatMap(
    (scene) => storyHistoryItem(scene) ?? ready.get(scene.stepIndex) ?? [],
  );
};

export const registerStoryIpc = ({
  readModel = readSavedModel,
  createAgent = createStoryAgent,
  simulate = simulateWhatIf,
  getModelOptions,
  ownsProject = () => true,
}: StoryIpcOptions = {}) => {
  const windows = new Map<WebContents, WindowStory>();
  const storeFor = createStoryNarrationCache();
  const stop = (state: WindowStory) => {
    const pending = state.pending;
    delete state.pending;
    pending?.controller.abort();
  };

  const lazyAgent = (): StoryAgent => {
    let agent: Promise<StoryAgent> | undefined;
    return {
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
    };
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
    return { model, flows: resolveStoryTraces(model, report) };
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
        flows.find((story) => story.kind === 'primary' && !story.forkedFrom) ??
        flows[0];
      if (!flow) return { snapshotId, flows };
      const projection = projectStoryFacts(flow, model);
      state.selected = { projection, flow, graph: createDomainGraph(model) };
      return { snapshotId, flows, selected: { flow, projection } };
    },
  );

  ipcMain.handle(
    STORY_IPC_CHANNELS.ENRICH_STEP,
    async (
      { sender },
      input: StoryEnrichStepInput,
    ): Promise<StoryEnrichStepResult | null> => {
      if (
        typeof input?.rootPath !== 'string' ||
        !path.isAbsolute(input.rootPath) ||
        !validId(input.snapshotId) ||
        !validId(input.requestId) ||
        !validId(input.stepHash) ||
        !Number.isSafeInteger(input.stepIndex) ||
        input.stepIndex < 1 ||
        (input.cacheOnly !== undefined && typeof input.cacheOnly !== 'boolean')
      )
        throw new Error('无效的业务故事步骤请求。');
      const state = windows.get(sender);
      if (
        !state?.selected ||
        state.loadId !== input.snapshotId ||
        state.rootPath !== input.rootPath ||
        sender.isDestroyed() ||
        !ownsProject(sender, input.rootPath)
      )
        throw new Error('业务流快照已过期。');
      const { projection, flow, graph } = state.selected;
      const current = flow.steps.find(
        ({ sequence }) => sequence === input.stepIndex,
      );
      const scene = projection.scenes.find(
        ({ stepIndex }) => stepIndex === input.stepIndex,
      );
      if (!current || !scene || scene.stepHash !== input.stepHash)
        throw new Error('业务步骤已变化，请刷新放映后重试。');
      const history = historyFor(input, projection);
      if (state.pending?.identity.requestId === input.requestId)
        throw new Error('业务故事步骤已在生成中。');
      stop(state);
      const { rootPath, snapshotId, requestId, stepIndex, stepHash } = input;
      const pending = {
        identity: { rootPath, snapshotId, requestId, stepIndex, stepHash },
        controller: new AbortController(),
      };
      state.pending = pending;
      const signal = pending.controller.signal;
      try {
        const narrator = (state.narrator ??= createStoryNarrator({
          store: storeFor(state.rootPath),
          agent: lazyAgent(),
        }));
        const result = await narrator.enrichStep(scene, history, {
          flowId: flow.flowId,
          challengeSource: { steps: flow.steps, current, graph },
          signal,
          cacheOnly: input.cacheOnly === true,
        });
        return result && !signal.aborted
          ? { stepIndex, stepHash, ...result }
          : null;
      } catch (error) {
        if (signal.aborted) return null;
        throw error;
      } finally {
        if (state.pending === pending) delete state.pending;
      }
    },
  );

  ipcMain.handle(
    STORY_IPC_CHANNELS.CANCEL_STEP,
    async ({ sender }, input: StoryStepRequest) => {
      const state = windows.get(sender);
      const active = state?.pending?.identity;
      if (
        state &&
        active &&
        input &&
        active.rootPath === input.rootPath &&
        active.snapshotId === input.snapshotId &&
        active.requestId === input.requestId &&
        active.stepIndex === input.stepIndex &&
        active.stepHash === input.stepHash
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
        (input.localOnly !== undefined &&
          typeof input.localOnly !== 'boolean') ||
        (input.localOnly && !input.hypothesisDraft) ||
        (input.targetedRuleId !== undefined &&
          (typeof input.targetedRuleId !== 'string' ||
            !input.targetedRuleId.trim()))
      )
        throw new Error('无效的推演挑战。');
      if (
        typeof input.currentStep?.storyId !== 'string' ||
        typeof input.currentStep?.stepId !== 'string'
      )
        throw new Error('无效的业务流步骤。');
      const { model, flow } = await loadFlow(input);
      const step = flow.steps.find(
        (step) =>
          step.storyId === input.currentStep.storyId &&
          step.stepId === input.currentStep.stepId,
      );
      if (!step || step.stepHash !== input.stepHash)
        throw new Error('业务步骤已变化，请刷新放映后重试。');
      return simulate(
        {
          model,
          flow,
          currentStep: input.currentStep,
          hypothesisQuestion: input.question.trim(),
          hypothesis: input.hypothesisDraft,
          ruleId: input.targetedRuleId,
          ...(input.allowSpeculative === true
            ? { allowSpeculative: true }
            : {}),
        },
        input.localOnly
          ? { explanation: 'local' }
          : {
              agent: lazyAgent(),
              explanation: input.hypothesisDraft ? 'optional' : 'required',
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
        STORY_IPC_CHANNELS.ENRICH_STEP,
        STORY_IPC_CHANNELS.CANCEL_STEP,
        STORY_IPC_CHANNELS.WHAT_IF,
      ])
        ipcMain.removeHandler(channel);
    },
  };
};
