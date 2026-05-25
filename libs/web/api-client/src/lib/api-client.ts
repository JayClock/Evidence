import { createClient } from '@hateoas-ts/resource';

import type { RootResource } from './api-types.js';

type TauriCore = {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
};

type EvidenceImportMeta = ImportMeta & {
  env?: {
    VITE_API_BASE_URL?: string;
  };
};

declare global {
  interface Window {
    __TAURI__?: {
      core?: TauriCore;
    };
  }
}

function isTauri(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.__TAURI__?.core?.invoke === 'function'
  );
}

function createEvidenceClient(apiRootUrl: string) {
  return createClient({
    baseURL: apiRootUrl,
    sendUserAgent: false,
  });
}

export async function getApiBaseUrl(): Promise<string> {
  const invoke = window.__TAURI__?.core?.invoke;
  if (isTauri() && invoke) {
    return invoke<string>('get_api_base_url');
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
