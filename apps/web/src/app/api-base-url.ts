type TauriCore = {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
};

declare global {
  interface Window {
    __TAURI__?: {
      core?: TauriCore;
    };
  }
}

function isTauri(): boolean {
  return typeof window !== 'undefined' && typeof window.__TAURI__?.core?.invoke === 'function';
}

export async function getApiBaseUrl(): Promise<string> {
  if (isTauri()) {
    return window.__TAURI__!.core!.invoke<string>('get_api_base_url');
  }

  return import.meta.env.VITE_API_BASE_URL ?? '/api';
}
