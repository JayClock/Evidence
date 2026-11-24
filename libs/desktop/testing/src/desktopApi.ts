import { prepareModelPatchBatch } from '@evidence-poc/evidence-model-core';
import { liveDeliveryPreview } from './liveDelivery';
import type {
  AgentEventPayload,
  AgentPromptInput,
  AgentSteerInput,
  LiveModelInput,
  ModelPatchRequest,
  PatchCommittedPayload,
  CanvasContextRegistration,
  SensorReport,
  SensorReportPayload,
} from '@evidence-poc/desktop-contracts/agentIpc';
import type {
  CompileDraftInput,
  CompileDraftOutcome,
  IngestDraftInput,
  IngestDraftResult,
} from '@evidence-poc/desktop-contracts/ingestion';
import type { ArtifactStatus } from '@evidence-poc/desktop-contracts/delivery';
import type { EvidenceDesktopApi } from '@evidence-poc/desktop-contracts/ipc';
import type {
  McpRendererRequest,
  McpRendererResponse,
  McpStatus,
} from '@evidence-poc/desktop-contracts/mcpIpc';
import type {
  CreateProjectDialogResult,
  CreateProjectInput,
  CreateProjectResult,
  DeliveryPreview,
  EvidenceProjectSummary,
  LivePersistenceInput,
  OpenProjectResult,
  PersistenceStatus,
  ProjectTemplateMeta,
} from '@evidence-poc/desktop-contracts/projects';

export const projectSummary = (
  overrides: Partial<EvidenceProjectSummary> = {},
): EvidenceProjectSummary => ({
  rootPath: '/models/procurement',
  modelDirectory: '/models/procurement/.evidence/model',
  name: '商品采购（Product Procurement）',
  modelId: 'product-procurement',
  modelVersion: '1.1.0',
  entityCount: 12,
  relationshipCount: 8,
  ruleCount: 3,
  lastOpenedAt: '2026-11-11T08:00:00.000Z',
  ...overrides,
});

/** Starter cards the dashboard fetches; the counts mirror the main process. */
export const defaultTemplates = (): readonly ProjectTemplateMeta[] => [
  {
    id: 'blank',
    name: '空白模型',
    description:
      '只有 model.json 的空源树，适合已经想清楚业务边界的建模者从零开始。',
    source: '履约建模法元模型',
    entityCount: 0,
    relationshipCount: 0,
    ruleCount: 0,
  },
  {
    id: 'procurement',
    name: '公对公商品采购履约',
    description:
      '询价与报价、采购协议，加上发货、支付、开票三组履约项与对应凭证。',
    source: '直播案例：商品采购协议履约',
    entityCount: 22,
    relationshipCount: 15,
    ruleCount: 3,
  },
];

export const healthyReport = (
  overrides: Partial<SensorReport> = {},
): SensorReport => ({
  timestamp: '2026-11-11T08:00:00.000Z',
  passed: true,
  blockCount: 0,
  warnCount: 0,
  infoCount: 0,
  issues: [],
  keyDataSummary: {
    totalItems: 12,
    resolvedCount: 12,
    decisionOwedCount: 0,
    unresolvedItems: [],
  },
  isStageGateReady: false,
  unavailableSensors: [],
  ...overrides,
});

/** Test hooks for the agent surface; nothing here touches real IPC. */
export interface AgentMockController {
  /** Streams one agent event to every renderer subscriber. */
  emitEvent: (event: AgentEventPayload['event']) => void;
  /** Streams one sensor verdict to every renderer subscriber. */
  emitReport: (report: SensorReport) => void;
  /** Commits to the mocked main-process model, then streams the transaction. */
  commitPatch: (
    patch: ModelPatchRequest,
    focusNodeId?: string,
  ) => PatchCommittedPayload;
  emitPatch: (payload: PatchCommittedPayload) => void;
  liveModel: () => LiveModelInput | undefined;
  /** Canvas selections the renderer published. */
  canvasContexts: CanvasContextRegistration[];
}

/** Test hooks for the MCP bridge; nothing here touches a real socket. */
export interface McpMockController {
  /** Main asks the renderer to answer one tool call. */
  request: (request: McpRendererRequest) => void;
  /** Answers the renderer sent back, in order. */
  responses: McpRendererResponse[];
  /** Broadcasts a bridge status to the renderer. */
  emitStatus: (status: McpStatus) => void;
  /** Toggles screenshot mode the way the main process does. */
  setCaptureMode: (active: boolean) => void;
  captureModes: boolean[];
  setStatus: (status: McpStatus) => void;
}

export interface DesktopApiMock extends EvidenceDesktopApi {
  calls: {
    open: string[];
    persistence: LivePersistenceInput[];
    flushPersistence: string[];
    openEditorWindow: string[];
    showOpenDialog: number;
    showCreateDialog: number;
    create: CreateProjectInput[];
    prompt: AgentPromptInput[];
    steer: AgentSteerInput[];
    abort: string[];
    triggerSensors: string[];
    modelChanged: string[];
    deliveryLivePreview: string[];
    ingestDraft: IngestDraftInput[];
    compileDraft: CompileDraftInput[];
  };
  emitArtifactStatus: (event: ArtifactStatus) => void;
  emitPersistenceStatus: (event: PersistenceStatus) => void;
  agentMock: AgentMockController;
  mcpMock: McpMockController;
}

/**
 * Installs a scripted `window.evidenceAPI` for renderer tests and returns the
 * call log, so component tests never touch Electron IPC.
 */
export const installDesktopApi = ({
  projects = [],
  openResult = {
    success: true,
    project: projectSummary(),
    document: { manifest: {} } as never,
    issues: [],
  },
  dialogResult = { success: false, canceled: true } as const,
  createDialogResult = { success: false, canceled: true } as const,
  createResult = {
    success: true,
    project: projectSummary(),
    document: { manifest: {} } as never,
  },
  templates = defaultTemplates(),
  sensorReport = healthyReport(),
  deliveryPreviewResult = {
    success: false,
    error: '测试没有配置交付预览。',
  } as const,
  ingestResult = {
    success: false,
    error: '测试没有配置导入结果。',
    issues: [],
  } as IngestDraftResult,
  compileResult = {
    success: false,
    error: '测试没有配置编译结果。',
    issues: [],
  } as CompileDraftOutcome,
}: {
  projects?: readonly EvidenceProjectSummary[];
  openResult?: OpenProjectResult;
  dialogResult?: Awaited<
    ReturnType<EvidenceDesktopApi['projects']['showOpenDialog']>
  >;
  createDialogResult?: CreateProjectDialogResult;
  createResult?: CreateProjectResult;
  templates?: readonly ProjectTemplateMeta[];
  sensorReport?: SensorReport;
  deliveryPreviewResult?:
    | { success: true; preview: DeliveryPreview }
    | { success: false; error: string };
  ingestResult?: IngestDraftResult;
  compileResult?: CompileDraftOutcome;
} = {}): DesktopApiMock => {
  const calls: DesktopApiMock['calls'] = {
    open: [],
    persistence: [],
    flushPersistence: [],
    openEditorWindow: [],
    showOpenDialog: 0,
    showCreateDialog: 0,
    create: [],
    prompt: [],
    steer: [],
    abort: [],
    triggerSensors: [],
    modelChanged: [],
    deliveryLivePreview: [],
    ingestDraft: [],
    compileDraft: [],
  };

  const rootPath =
    openResult.success === true
      ? openResult.project.rootPath
      : '/models/procurement';

  const eventListeners = new Set<(payload: AgentEventPayload) => void>();
  const reportListeners = new Set<(payload: SensorReportPayload) => void>();
  const artifactListeners = new Set<(status: ArtifactStatus) => void>();
  const persistenceListeners = new Set<(status: PersistenceStatus) => void>();
  const emitPersistenceStatus = (status: PersistenceStatus) => {
    for (const listener of persistenceListeners) listener(status);
  };
  const patchListeners = new Set<(payload: PatchCommittedPayload) => void>();
  let live: LiveModelInput | undefined;
  let nextPatchId = 0;
  const canvasContexts: CanvasContextRegistration[] = [];
  let latest: SensorReport | null = null;

  const mcpRequestListeners = new Set<(request: McpRendererRequest) => void>();
  const mcpStatusListeners = new Set<(status: McpStatus) => void>();
  const mcpCaptureListeners = new Set<(active: boolean) => void>();
  const mcpResponses: McpRendererResponse[] = [];
  const captureModes: boolean[] = [];
  let mcpStatus: McpStatus = {
    listening: true,
    endpoint: '/tmp/evidence-mcp-test.sock',
    connections: 0,
    calls: 0,
    registeredClients: [],
    error: null,
  };

  const mcpMock: McpMockController = {
    request: (request) => {
      for (const listener of mcpRequestListeners) {
        listener(request);
      }
    },
    responses: mcpResponses,
    emitStatus: (next) => {
      mcpStatus = next;

      for (const listener of mcpStatusListeners) {
        listener(next);
      }
    },
    setCaptureMode: (active) => {
      captureModes.push(active);

      for (const listener of mcpCaptureListeners) {
        listener(active);
      }
    },
    captureModes,
    setStatus: (next) => {
      mcpStatus = next;
    },
  };

  const agentMock: AgentMockController = {
    emitEvent: (event) => {
      for (const listener of eventListeners) {
        listener({ rootPath, event });
      }
    },
    emitReport: (report) => {
      latest = report;

      for (const listener of reportListeners) {
        listener({ rootPath, report });
      }
    },
    liveModel: () => live,
    emitPatch: (payload) => {
      for (const listener of patchListeners) listener(payload);
    },
    commitPatch: ({ rationale, patches }, focusNodeId) => {
      if (!live) throw new Error('No live model');
      const prepared = prepareModelPatchBatch(live.document, patches);
      const transaction = {
        id: `tx-${++nextPatchId}`,
        baseRevision: live.revision,
        revision: live.revision + 1,
        rationale,
        commands: patches.map(({ op }) => op),
        patches: prepared.patches,
        inversePatches: prepared.inversePatches,
        ...(focusNodeId === undefined ? {} : { focusNodeId }),
      };
      live = {
        ...live,
        revision: transaction.revision,
        document: prepared.document,
      };
      const payload = {
        rootPath: live.rootPath,
        editorId: live.editorId,
        transaction,
      };
      agentMock.emitPatch(payload);
      return payload;
    },
    canvasContexts,
  };

  const api: DesktopApiMock = {
    calls,
    agentMock,
    mcpMock,
    emitPersistenceStatus,
    emitArtifactStatus: (event) => {
      for (const listener of artifactListeners) listener(event);
    },
    aiConfig: {
      getStatus: async () => ({
        isConfigured: true,
        activeProviderId: 'deepseek',
        activeModelId: 'deepseek-chat',
        activeModelName: 'DeepSeek Chat',
        agentDir: '/test/pi',
        thinkingLevel: 'off',
        availableModels: [],
      }),
      reload: async () => api.aiConfig.getStatus(),
      openConfigDirectory: async () => undefined,
      selectModel: async () => api.aiConfig.getStatus(),
      testConnection: async () => ({ success: true, latencyMs: 1 }),
      onChanged: () => () => undefined,
    },
    projects: {
      showOpenDialog: async () => {
        calls.showOpenDialog += 1;

        return dialogResult;
      },
      showCreateDialog: async () => {
        calls.showCreateDialog += 1;

        return createDialogResult;
      },
      create: async (input) => {
        calls.create.push(input);

        return createResult;
      },
      listTemplates: async () => ({ success: true, templates }),
      open: async (rootPath) => {
        calls.open.push(rootPath);
        return openResult.success
          ? { persistenceId: 'editor', ...openResult }
          : openResult;
      },
      enqueuePersistence: async (input) => {
        calls.persistence.push(input);
        emitPersistenceStatus({
          persistenceId: input.persistenceId,
          revision: input.revision,
          kind: 'persisted',
        });
        return { success: true };
      },
      flushPersistence: async (id) => {
        calls.flushPersistence.push(id);
        return { success: true };
      },
      readPersistenceStatus: async () => null,
      onPersistenceStatus: (listener) => {
        persistenceListeners.add(listener);
        return () => {
          persistenceListeners.delete(listener);
        };
      },
      listRecent: async () => ({ success: true, projects }),
      openEditorWindow: async (rootPath) => {
        calls.openEditorWindow.push(rootPath);
      },
      deliveryLivePreview: async (input) => {
        calls.deliveryLivePreview.push(input.rootPath);
        return deliveryPreviewResult.success
          ? {
              success: true,
              analysis: liveDeliveryPreview(
                input.revision,
                deliveryPreviewResult.preview,
              ),
            }
          : {
              success: false,
              revision: input.revision,
              error: deliveryPreviewResult.error,
            };
      },
      readArtifactStatus: async () => null,
      onArtifactStatus: (listener) => {
        artifactListeners.add(listener);
        return () => {
          artifactListeners.delete(listener);
        };
      },
    },
    agent: {
      prompt: async (input) => {
        calls.prompt.push(input);

        return { success: true };
      },
      steer: async (input) => {
        calls.steer.push(input);

        return { success: true, disposition: 'queued' };
      },
      abort: async ({ rootPath }) => {
        calls.abort.push(rootPath);

        return { success: true };
      },
      triggerSensors: async ({ rootPath }) => {
        calls.triggerSensors.push(rootPath);
        latest = sensorReport;

        return sensorReport;
      },
      notifyModelChanged: async (input) => {
        calls.modelChanged.push(input.rootPath);
        live = input;
      },
      latestReport: async () => latest,
      publishCanvasContext: async (input) => {
        canvasContexts.push(input);
      },
      onEvent: (listener) => {
        eventListeners.add(listener);

        return () => eventListeners.delete(listener);
      },
      onReport: (listener) => {
        reportListeners.add(listener);

        return () => reportListeners.delete(listener);
      },
      onPatchCommitted: (listener) => {
        patchListeners.add(listener);
        return () => patchListeners.delete(listener);
      },
    },
    mcp: {
      getStatus: async () => mcpStatus,
      onStatus: (listener) => {
        mcpStatusListeners.add(listener);

        return () => mcpStatusListeners.delete(listener);
      },
      onRequest: (listener) => {
        mcpRequestListeners.add(listener);

        return () => mcpRequestListeners.delete(listener);
      },
      respond: (response) => {
        mcpResponses.push(response);
      },
      onCaptureMode: (listener) => {
        mcpCaptureListeners.add(listener);

        return () => mcpCaptureListeners.delete(listener);
      },
    },
    story: {
      load: async () => ({ snapshotId: 'empty', flows: [] }),
      startNarration: async () => undefined,
      cancelNarration: async () => undefined,
      onNarration: () => () => undefined,
      whatIf: async () => {
        throw new Error('测试没有配置沙盘。');
      },
      onInvalidated: () => () => undefined,
    },
    ingestion: {
      draft: async (input) => {
        calls.ingestDraft.push(input);

        return ingestResult;
      },
      compile: async (input) => {
        calls.compileDraft.push(input);

        return compileResult;
      },
    },
    system: { platform: 'darwin' },
  };

  Object.defineProperty(window, 'evidenceAPI', {
    value: api,
    configurable: true,
    writable: true,
  });

  return api;
};

declare global {
  interface Window {
    evidenceAPI: EvidenceDesktopApi;
  }
}
