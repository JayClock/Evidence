import { contextBridge, ipcRenderer } from 'electron';
import type { DiagramAgentEvent, DiagramAgentRequest } from './agent-protocol';
import {
  ACCEPT_CODING_RUN_CHANNEL,
  CANCEL_CODING_AGENT_CHANNEL,
  CODING_AGENT_EVENT_CHANNEL,
  GET_CODING_REVIEW_CHANNEL,
  parseCodingRunEvent,
  REJECT_CODING_RUN_CHANNEL,
  RUN_CODING_AGENT_CHANNEL,
  type CodingRunDecisionRequest,
  type CodingRunEvent,
  type CodingRunRejectionRequest,
  type StartCodingRequest,
} from './coding-ipc-protocol';
import {
  CANCEL_DIAGRAM_AGENT_CHANNEL,
  DIAGRAM_AGENT_EVENT_CHANNEL,
  parseDiagramAgentEvent,
  RUN_DIAGRAM_AGENT_CHANNEL,
} from './agent-protocol';

const bridge = {
  getApiBaseUrl: (): Promise<string> =>
    ipcRenderer.invoke('evidence:get-api-base-url'),
  chooseDirectory: (): Promise<string | null> =>
    ipcRenderer.invoke('evidence:choose-directory'),
  bindWorkspace: (workspaceId: string, repositoryRoot: string): Promise<void> =>
    ipcRenderer.invoke('evidence:bind-workspace', {
      workspaceId,
      repositoryRoot,
    }),
  runDiagramAgent: async (
    request: DiagramAgentRequest,
    onEvent: (event: DiagramAgentEvent) => void,
  ): Promise<void> => {
    const listener = (_event: Electron.IpcRendererEvent, event: unknown) => {
      const candidate = parseDiagramAgentEvent(event);
      if (candidate?.id === request.id) {
        onEvent(candidate);
      }
    };
    ipcRenderer.on(DIAGRAM_AGENT_EVENT_CHANNEL, listener);
    try {
      await ipcRenderer.invoke(RUN_DIAGRAM_AGENT_CHANNEL, request);
    } finally {
      ipcRenderer.removeListener(DIAGRAM_AGENT_EVENT_CHANNEL, listener);
    }
  },
  cancelDiagramAgent: (id: string): Promise<void> =>
    ipcRenderer.invoke(CANCEL_DIAGRAM_AGENT_CHANNEL, id),
  runCodingAgent: async (
    request: StartCodingRequest,
    onEvent: (event: CodingRunEvent) => void,
  ): Promise<void> => {
    const listener = (_event: Electron.IpcRendererEvent, value: unknown) => {
      const event = parseCodingRunEvent(value);
      if (event?.id === request.id) onEvent(event);
    };
    ipcRenderer.on(CODING_AGENT_EVENT_CHANNEL, listener);
    try {
      await ipcRenderer.invoke(RUN_CODING_AGENT_CHANNEL, request);
    } finally {
      ipcRenderer.removeListener(CODING_AGENT_EVENT_CHANNEL, listener);
    }
  },
  cancelCodingAgent: (id: string): Promise<void> =>
    ipcRenderer.invoke(CANCEL_CODING_AGENT_CHANNEL, id),
  getCodingReview: (runId: string): Promise<unknown> =>
    ipcRenderer.invoke(GET_CODING_REVIEW_CHANNEL, runId),
  acceptCodingRun: (input: CodingRunDecisionRequest): Promise<unknown> =>
    ipcRenderer.invoke(ACCEPT_CODING_RUN_CHANNEL, input),
  rejectCodingRun: (input: CodingRunRejectionRequest): Promise<unknown> =>
    ipcRenderer.invoke(REJECT_CODING_RUN_CHANNEL, input),
};

contextBridge.exposeInMainWorld('evidenceDesktop', bridge);
