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

type EvidenceDesktopBridge = {
  getApiBaseUrl(): Promise<string>;
  chooseDirectory(): Promise<string | null>;
  bindWorkspace(workspaceId: string, repositoryRoot: string): Promise<void>;
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

function createEvidenceClient(
  apiRootUrl: string,
  authorization?: string,
) {
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
