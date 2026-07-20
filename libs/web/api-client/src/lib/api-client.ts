import { createClient } from '@hateoas-ts/resource';
import { zodActionSchemaPlugin } from '@hateoas-ts/resource/zod';

import type { RootResource } from './api-types.js';

type EvidenceDesktopBridge = {
  getApiBaseUrl(): Promise<string>;
  chooseDirectory(): Promise<string | null>;
};

type EvidenceImportMeta = ImportMeta & {
  env?: {
    VITE_API_BASE_URL?: string;
  };
};

declare global {
  interface Window {
    evidenceDesktop?: EvidenceDesktopBridge;
  }
}

function createEvidenceClient(apiRootUrl: string) {
  return createClient({
    baseURL: apiRootUrl,
    schemaPlugin: zodActionSchemaPlugin,
    sendUserAgent: false,
  });
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
  apiClient = createEvidenceClient(apiRootUrl);
  rootResource = getRootResource();
}
