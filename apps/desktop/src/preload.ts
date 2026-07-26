import { contextBridge, ipcRenderer } from 'electron';
import type { DiagramAgentEvent, DiagramAgentRequest } from './agent-protocol';
import type { InboxSourceCapture } from './inbox-source-adapters';
import {
  parseIntakeAgentEvent,
  type InboxAnalystRequest,
  type IntakeAgentEvent,
  type KickoffAnalystRequest,
  type UnderstandingAnalystRequest,
} from './intake-agent-protocol';
import {
  CANCEL_INBOX_ANALYST_CHANNEL,
  CANCEL_KICKOFF_ANALYST_CHANNEL,
  CANCEL_UNDERSTANDING_ANALYST_CHANNEL,
  FETCH_INBOX_GITHUB_ISSUE_CHANNEL,
  INTAKE_AGENT_EVENT_CHANNEL,
  READ_INBOX_MARKDOWN_CHANNEL,
  RUN_INBOX_ANALYST_CHANNEL,
  RUN_KICKOFF_ANALYST_CHANNEL,
  RUN_UNDERSTANDING_ANALYST_CHANNEL,
  START_ITERATION_CHANNEL,
} from './intake-ipc-protocol';
import type {
  IterationProvisioningSummary,
  StartIterationRequest,
} from './iteration-controller';
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
import type { RepositorySelectionSummary } from './workspace-binding-store';

async function runIntakeAgent(
  channel:
    | typeof RUN_INBOX_ANALYST_CHANNEL
    | typeof RUN_KICKOFF_ANALYST_CHANNEL
    | typeof RUN_UNDERSTANDING_ANALYST_CHANNEL,
  request:
    | InboxAnalystRequest
    | KickoffAnalystRequest
    | UnderstandingAnalystRequest,
  onEvent: (event: IntakeAgentEvent) => void,
): Promise<void> {
  const listener = (_event: Electron.IpcRendererEvent, value: unknown) => {
    const event = parseIntakeAgentEvent(value);
    if (event?.id === request.id) onEvent(event);
  };
  ipcRenderer.on(INTAKE_AGENT_EVENT_CHANNEL, listener);
  try {
    await ipcRenderer.invoke(channel, request);
  } finally {
    ipcRenderer.removeListener(INTAKE_AGENT_EVENT_CHANNEL, listener);
  }
}

const bridge = {
  getApiBaseUrl: (): Promise<string> =>
    ipcRenderer.invoke('evidence:get-api-base-url'),
  chooseRepository: (): Promise<RepositorySelectionSummary | null> =>
    ipcRenderer.invoke('evidence:choose-repository'),
  bindWorkspace: (workspaceId: string, selectionId: string): Promise<void> =>
    ipcRenderer.invoke('evidence:bind-workspace', {
      workspaceId,
      selectionId,
    }),
  readInboxMarkdown: (
    workspaceId: string,
    relativePath: string,
  ): Promise<InboxSourceCapture> =>
    ipcRenderer.invoke(READ_INBOX_MARKDOWN_CHANNEL, {
      workspaceId,
      relativePath,
    }),
  fetchInboxGitHubIssue: (
    owner: string,
    repository: string,
    issueNumber: number,
  ): Promise<InboxSourceCapture> =>
    ipcRenderer.invoke(FETCH_INBOX_GITHUB_ISSUE_CHANNEL, {
      owner,
      repository,
      issueNumber,
    }),
  runInboxAnalyst: (
    request: InboxAnalystRequest,
    onEvent: (event: IntakeAgentEvent) => void,
  ): Promise<void> =>
    runIntakeAgent(RUN_INBOX_ANALYST_CHANNEL, request, onEvent),
  cancelInboxAnalyst: (id: string): Promise<void> =>
    ipcRenderer.invoke(CANCEL_INBOX_ANALYST_CHANNEL, id),
  startIteration: (
    request: StartIterationRequest,
  ): Promise<IterationProvisioningSummary> =>
    ipcRenderer.invoke(START_ITERATION_CHANNEL, request),
  runKickoffAnalyst: (
    request: KickoffAnalystRequest,
    onEvent: (event: IntakeAgentEvent) => void,
  ): Promise<void> =>
    runIntakeAgent(RUN_KICKOFF_ANALYST_CHANNEL, request, onEvent),
  cancelKickoffAnalyst: (id: string): Promise<void> =>
    ipcRenderer.invoke(CANCEL_KICKOFF_ANALYST_CHANNEL, id),
  runUnderstandingAnalyst: (
    request: UnderstandingAnalystRequest,
    onEvent: (event: IntakeAgentEvent) => void,
  ): Promise<void> =>
    runIntakeAgent(RUN_UNDERSTANDING_ANALYST_CHANNEL, request, onEvent),
  cancelUnderstandingAnalyst: (id: string): Promise<void> =>
    ipcRenderer.invoke(CANCEL_UNDERSTANDING_ANALYST_CHANNEL, id),
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
