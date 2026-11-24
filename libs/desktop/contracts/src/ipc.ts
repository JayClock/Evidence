import type { EvidenceAiConfigApi } from './aiConfig.js';
import type {
  LiveDeliveryInput,
  LiveDeliveryResult,
  ArtifactStatus,
} from './delivery.js';
import type { EvidenceAgentApi } from './agentIpc.js';
import type {
  CompileDraftInput,
  CompileDraftOutcome,
  IngestDraftInput,
  IngestDraftResult,
} from './ingestion.js';
import type { EvidenceMcpApi } from './mcpIpc.js';
import type { EvidenceStoryApi } from './story.js';
import type {
  CreateProjectDialogResult,
  CreateProjectInput,
  CreateProjectResult,
  EvidenceProjectSummary,
  OpenProjectDialogResult,
  OpenProjectResult,
  ProjectTemplateId,
  ProjectTemplateMeta,
  ProjectTemplatesResult,
  RecentProjectsResult,
  LivePersistenceInput,
  PersistenceResult,
  PersistenceStatus,
} from './projects.js';

/** IPC channels shared by the main process and the preload bridge. */
export const EVIDENCE_IPC_CHANNELS = {
  showOpenDialog: 'evidence:project:show-open-dialog',
  open: 'evidence:project:open',
  create: 'evidence:project:create',
  showCreateDialog: 'evidence:project:show-create-dialog',
  templates: 'evidence:project:templates',
  enqueuePersistence: 'evidence:project:enqueue-persistence',
  flushPersistence: 'evidence:project:flush-persistence',
  persistenceStatus: 'evidence:project:persistence-status',
  readPersistenceStatus: 'evidence:project:read-persistence-status',
  recent: 'evidence:project:recent',
  openEditorWindow: 'evidence:project:open-editor-window',
  deliveryLivePreview: 'evidence:project:delivery-live-preview',
  artifactStatus: 'evidence:project:artifact-status',
  readArtifactStatus: 'evidence:project:read-artifact-status',
} as const;

export type EvidenceIpcChannel =
  (typeof EVIDENCE_IPC_CHANNELS)[keyof typeof EVIDENCE_IPC_CHANNELS];

/** Channels that read business prose into a draft, and compile that draft. */
export const EVIDENCE_INGESTION_IPC_CHANNELS = {
  draft: 'evidence:ingestion:draft',
  compile: 'evidence:ingestion:compile',
} as const;

export type EvidenceIngestionIpcChannel =
  (typeof EVIDENCE_INGESTION_IPC_CHANNELS)[keyof typeof EVIDENCE_INGESTION_IPC_CHANNELS];

/** The only surface the renderer can reach: no `ipcRenderer`, no `fs`. */
export interface EvidenceDesktopApi {
  aiConfig: EvidenceAiConfigApi;
  projects: {
    showOpenDialog: () => Promise<OpenProjectDialogResult>;
    /** Picks the workspace root directory for a new project. */
    showCreateDialog: () => Promise<CreateProjectDialogResult>;
    /** Writes a starter model to `targetPath` and remembers the project. */
    create: (input: CreateProjectInput) => Promise<CreateProjectResult>;
    /** Starter templates the dashboard offers, with their real counts. */
    listTemplates: () => Promise<ProjectTemplatesResult>;
    open: (
      rootPath: string,
      reload?: 'discard-pending',
    ) => Promise<OpenProjectResult>;
    enqueuePersistence: (
      input: LivePersistenceInput,
    ) => Promise<PersistenceResult>;
    flushPersistence: (persistenceId: string) => Promise<PersistenceResult>;
    readPersistenceStatus: (
      persistenceId: string,
    ) => Promise<PersistenceStatus | null>;
    onPersistenceStatus: (
      listener: (status: PersistenceStatus) => void,
    ) => () => void;
    listRecent: () => Promise<RecentProjectsResult>;
    /** Opens (or focuses) the model workspace window for a project root. */
    openEditorWindow: (rootPath: string) => Promise<void>;
    /** Read-only authoring preview; it never triggers disk sync. */
    deliveryLivePreview: (
      input: LiveDeliveryInput,
    ) => Promise<LiveDeliveryResult>;
    readArtifactStatus: (
      persistenceId: string,
    ) => Promise<ArtifactStatus | null>;
    onArtifactStatus: (
      listener: (status: ArtifactStatus) => void,
    ) => () => void;
  };
  /** Incremental business walkthrough and isolated What-If sandbox. */
  story: EvidenceStoryApi;
  /** Pi agent, sensors and patch application (phase 3). */
  agent: EvidenceAgentApi;
  /** MCP bridge status and the renderer side of external tool calls. */
  mcp: EvidenceMcpApi;
  /**
   * Business text and blueprint tables in, a model out.
   *
   * Both calls run in the main process: reading uses the project's model
   * configuration, and compiling writes a source tree, so neither belongs in a
   * renderer that has no filesystem.
   */
  ingestion: {
    /** Reads business text or a blueprint table into a draft. */
    draft: (input: IngestDraftInput) => Promise<IngestDraftResult>;
    /** Compiles a reviewed draft into a saved project. */
    compile: (input: CompileDraftInput) => Promise<CompileDraftOutcome>;
  };
  system: {
    platform: NodeJS.Platform;
  };
}

export type {
  CompileDraftInput,
  CompileDraftOutcome,
  CompileDraftResult,
  IngestDraftInput,
  IngestDraftResult,
  IngestionInputKind,
  IngestionReader,
} from './ingestion.js';

export type {
  DeliveryPreview,
  DeliveryPreviewLink,
  DeliveryPreviewRoute,
  DeliveryPreviewService,
} from './projects.js';

export type {
  CreateProjectDialogResult,
  CreateProjectInput,
  CreateProjectResult,
  EvidenceProjectSummary,
  OpenProjectDialogResult,
  OpenProjectResult,
  ProjectTemplateId,
  ProjectTemplateMeta,
  ProjectTemplatesResult,
  RecentProjectsResult,
  LivePersistenceInput,
  PersistenceResult,
  PersistenceStatus,
};
