import { createClient } from '@hateoas-ts/resource';
import { zodActionSchemaPlugin } from '@hateoas-ts/resource/zod';

import type { RootResource } from './api-types.js';

type DiagramAgentRequest = {
  id: string;
  requirement: string;
  logicalEntitiesHref: string;
  logicalRelationshipsHref: string;
};

type DiagramAgentEvent = {
  id: string;
  event: string | null;
  data: string;
};

export type IntakeAgentEvent = {
  id: string;
  event: 'progress' | 'tool-start' | 'tool-end' | 'complete' | 'error';
  data: string;
};

export type InboxSourceCapture = {
  sourceKind: 'manual_text' | 'local_markdown' | 'github_issue';
  externalKey: string;
  title: string;
  body: string;
  contentType: 'text/plain' | 'text/markdown';
  uri: string | null;
  providerMetadata: Record<string, unknown>;
  sourceUpdatedAt: string | null;
};

export type StartIterationRequest = {
  id: string;
  workspaceId: string;
  candidateId: string;
};

export type IterationProvisioningSummary = {
  iterationId: string;
  reference: string;
  lifecycle: 'provisioning' | 'active' | 'provisioning_failed' | 'halted';
  branchName: string | null;
  baseCommitSha: string;
};

export type RepositorySelectionSummary = {
  id: string;
  name: string;
  headCommitSha: string;
};

type EvidenceDesktopBridge = {
  getApiBaseUrl(): Promise<string>;
  chooseRepository(): Promise<RepositorySelectionSummary | null>;
  bindWorkspace(workspaceId: string, selectionId: string): Promise<void>;
  readInboxMarkdown?(
    workspaceId: string,
    relativePath: string,
  ): Promise<InboxSourceCapture>;
  fetchInboxGitHubIssue?(
    owner: string,
    repository: string,
    issueNumber: number,
  ): Promise<InboxSourceCapture>;
  runInboxAnalyst?(
    request: { id: string; workspaceId: string; extractionId: string },
    onEvent: (event: IntakeAgentEvent) => void,
  ): Promise<void>;
  cancelInboxAnalyst?(id: string): Promise<void>;
  startIteration?(
    request: StartIterationRequest,
  ): Promise<IterationProvisioningSummary>;
  runKickoffAnalyst?(
    request: { id: string; workspaceId: string; iterationId: string },
    onEvent: (event: IntakeAgentEvent) => void,
  ): Promise<void>;
  cancelKickoffAnalyst?(id: string): Promise<void>;
  runUnderstandingAnalyst?(
    request: { id: string; workspaceId: string; iterationId: string },
    onEvent: (event: IntakeAgentEvent) => void,
  ): Promise<void>;
  cancelUnderstandingAnalyst?(id: string): Promise<void>;
  runTaskingAnalyst?(
    request: { id: string; workspaceId: string; iterationId: string },
    onEvent: (event: IntakeAgentEvent) => void,
  ): Promise<void>;
  cancelTaskingAnalyst?(id: string): Promise<void>;
  runDiagramAgent(
    request: DiagramAgentRequest,
    onEvent: (event: DiagramAgentEvent) => void,
  ): Promise<void>;
  cancelDiagramAgent(id: string): Promise<void>;
};

type EvidenceImportMeta = ImportMeta & {
  env?: {
    VITE_API_BASE_URL?: string;
    VITE_API_AUTHORIZATION?: string;
  };
};

declare global {
  interface Window {
    evidenceDesktop?: EvidenceDesktopBridge;
  }
}

function createEvidenceClient(apiRootUrl: string, authorization?: string) {
  const client = createClient({
    baseURL: apiRootUrl,
    schemaPlugin: zodActionSchemaPlugin,
    sendUserAgent: false,
  });
  const normalizedAuthorization = authorization?.trim();
  if (normalizedAuthorization) {
    client.use((request, next) => {
      const headers = new Headers(request.headers);
      headers.set('Authorization', normalizedAuthorization);
      return next(new Request(request, { headers }));
    }, apiOrigin(apiRootUrl));
  }
  return client;
}

export async function getApiBaseUrl(): Promise<string> {
  if (typeof window !== 'undefined') {
    const electronBaseUrl = window.evidenceDesktop?.getApiBaseUrl;
    if (electronBaseUrl) {
      return electronBaseUrl();
    }
  }

  return (import.meta as EvidenceImportMeta).env?.VITE_API_BASE_URL ?? '/api';
}

export let apiClient = createEvidenceClient('/api');

export let rootResource = apiClient.go<RootResource>();

export function getRootResource() {
  return apiClient.go<RootResource>();
}

export async function initializeApiClient(): Promise<void> {
  const apiRootUrl = await getApiBaseUrl();
  const authorization = (import.meta as EvidenceImportMeta).env
    ?.VITE_API_AUTHORIZATION;
  apiClient = createEvidenceClient(apiRootUrl, authorization);
  rootResource = getRootResource();
}

function apiOrigin(apiRootUrl: string): string {
  if (/^https?:\/\//.test(apiRootUrl)) {
    return new URL(apiRootUrl).origin;
  }
  return typeof window === 'undefined' ? '*' : window.location.origin;
}
