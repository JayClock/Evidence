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

export type AnalystEvent = {
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

export type PairRunRequest = {
  id: string;
  workspaceId: string;
  iterationId: string;
};

export type PairControllerEvent = {
  requestId: string;
  event: 'progress' | 'checkpoint' | 'human-required';
  message: string;
  checkpoint: string | null;
};

export type PairControllerSummary = {
  iterationId: string;
  pairRunId: string;
  status:
    | 'running'
    | 'approval_required'
    | 'approved'
    | 'exception'
    | 'cancelled';
  checkpoint: string;
  version: number;
  nextAction: string | null;
  manifestSha256: string | null;
  diffSha256: string | null;
  commitSha: string | null;
  exception: {
    kind: string;
    summary: string;
    allowedRoutes: string[];
  } | null;
};

export type ShowcaseRunRequest = {
  id: string;
  workspaceId: string;
  iterationId: string;
};

export type ShowcaseControllerEvent = {
  requestId: string;
  event: 'progress' | 'checkpoint' | 'human-required';
  message: string;
  stage:
    | 'setup'
    | 'reviewing'
    | 'decision'
    | 'accepted'
    | 'revised'
    | 'rejected'
    | null;
};

export type ShowcaseControllerSummary = {
  iterationId: string;
  showcaseRunId: string;
  stage: Exclude<ShowcaseControllerEvent['stage'], null>;
  version: number;
  nextAction: string | null;
  evidenceBundleSha256: string | null;
  q2Passed: number;
  q2Total: number;
};

export type RespondRunRequest = ShowcaseRunRequest;

export type RespondControllerEvent = {
  requestId: string;
  event: 'progress' | 'checkpoint' | 'human-required';
  message: string;
  stage: string;
};

export type RespondControllerSummary = {
  iterationId: string;
  stage: string;
  version: number;
  nextAction: 'run_learner' | 'await_human' | null;
  candidateId: string | null;
};

export type PairLocalReview = {
  manifestSha256: string;
  diffSha256: string;
  changedFileCount: number;
  changedPaths: string[];
  diff: string;
};

export type DesktopPairDecisionAction =
  | 'back_test'
  | 'back_implementation'
  | 'back_tasking'
  | 'retry_quality'
  | 'cancel';

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
  fetchInboxGitHubIssues?(workspaceId: string): Promise<InboxSourceCapture[]>;
  runInboxAnalyst?(
    request: { id: string; workspaceId: string; extractionId: string },
    onEvent: (event: AnalystEvent) => void,
  ): Promise<void>;
  cancelInboxAnalyst?(id: string): Promise<void>;
  startIteration?(
    request: StartIterationRequest,
  ): Promise<IterationProvisioningSummary>;
  runKickoffAnalyst?(
    request: { id: string; workspaceId: string; iterationId: string },
    onEvent: (event: AnalystEvent) => void,
  ): Promise<void>;
  cancelKickoffAnalyst?(id: string): Promise<void>;
  runUnderstandingAnalyst?(
    request: { id: string; workspaceId: string; iterationId: string },
    onEvent: (event: AnalystEvent) => void,
  ): Promise<void>;
  cancelUnderstandingAnalyst?(id: string): Promise<void>;
  runTaskingAnalyst?(
    request: { id: string; workspaceId: string; iterationId: string },
    onEvent: (event: AnalystEvent) => void,
  ): Promise<void>;
  cancelTaskingAnalyst?(id: string): Promise<void>;
  startPair?(
    request: PairRunRequest,
    onEvent: (event: PairControllerEvent) => void,
  ): Promise<PairControllerSummary>;
  resumePair?(
    request: PairRunRequest,
    onEvent: (event: PairControllerEvent) => void,
  ): Promise<PairControllerSummary>;
  reviewPair?(
    request: PairRunRequest & { expectedManifestSha256: string },
  ): Promise<PairLocalReview>;
  decidePair?(
    request: PairRunRequest & {
      action: DesktopPairDecisionAction;
      reason: string;
      resume: boolean;
    },
    onEvent: (event: PairControllerEvent) => void,
  ): Promise<PairControllerSummary>;
  approvePair?(
    request: PairRunRequest & {
      expectedManifestSha256: string;
      expectedDiffSha256: string;
      commitMessage: string;
      reason: string;
    },
  ): Promise<PairControllerSummary>;
  cancelPair?(id: string): Promise<void>;
  runShowcaseChecks?(
    request: ShowcaseRunRequest,
    onEvent: (event: ShowcaseControllerEvent) => void,
  ): Promise<ShowcaseControllerSummary>;
  runShowcaseReviewer?(
    request: ShowcaseRunRequest,
    onEvent: (event: ShowcaseControllerEvent) => void,
  ): Promise<ShowcaseControllerSummary>;
  cancelShowcase?(id: string): Promise<void>;
  runRespondLearner?(
    request: RespondRunRequest,
    onEvent: (event: RespondControllerEvent) => void,
  ): Promise<RespondControllerSummary>;
  cancelRespond?(id: string): Promise<void>;
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
