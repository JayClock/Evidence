import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getApiBaseUrl,
  getRootResource,
  initializeApiClient,
} from './api-client.js';

type TestRuntimeWindow = typeof globalThis & {
  evidenceDesktop?: {
    getApiBaseUrl: () => Promise<string>;
    chooseDirectory: () => Promise<string | null>;
  };
  __TAURI__?: {
    core?: {
      invoke?: (
        command: string,
        payload?: Record<string, unknown>,
      ) => Promise<unknown>;
    };
  };
  window: TestRuntimeWindow;
};

const runtimeWindow = globalThis as TestRuntimeWindow;

describe('api client runtime configuration', () => {
  afterEach(() => {
    delete runtimeWindow.evidenceDesktop;
    delete runtimeWindow.__TAURI__;
    vi.unstubAllGlobals();
  });

  it('uses the web API root by default', async () => {
    await initializeApiClient();

    expect(await getApiBaseUrl()).toBe('/api');
    expect(getRootResource().uri).toBe('/api');
  });

  it('uses the Electron-provided API root when running in desktop', async () => {
    runtimeWindow.window = runtimeWindow;
    runtimeWindow.evidenceDesktop = {
      getApiBaseUrl: vi.fn(async () => 'http://127.0.0.1:45321/api'),
      chooseDirectory: vi.fn(async () => null),
    };

    await initializeApiClient();

    expect(runtimeWindow.evidenceDesktop.getApiBaseUrl).toHaveBeenCalledOnce();
    expect(getRootResource().uri).toBe('http://127.0.0.1:45321/api');
  });

  it('continues to support the Tauri bridge during migration', async () => {
    runtimeWindow.window = runtimeWindow;
    runtimeWindow.__TAURI__ = {
      core: {
        invoke: vi.fn(async (command: string) => {
          if (command === 'get_api_base_url') {
            return 'http://127.0.0.1:43123/api';
          }
          return null;
        }),
      },
    };

    await initializeApiClient();

    expect(runtimeWindow.__TAURI__.core?.invoke).toHaveBeenCalledWith(
      'get_api_base_url',
    );
    expect(getRootResource().uri).toBe('http://127.0.0.1:43123/api');
  });
});
