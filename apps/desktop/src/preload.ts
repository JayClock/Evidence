import { contextBridge, ipcRenderer } from 'electron';
import type { DiagramAgentEvent, DiagramAgentRequest } from './agent-protocol';
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
};

contextBridge.exposeInMainWorld('evidenceDesktop', bridge);
