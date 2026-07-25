import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getApiBaseUrl,
  getRootResource,
  initializeApiClient,
} from './api-client.js';

type TestRuntimeWindow = typeof globalThis & {
  evidenceDesktop?: {
    getApiBaseUrl: () => Promise<string>;
    chooseRepository: () => Promise<null>;
  };
  window: TestRuntimeWindow;
};

const runtimeWindow = globalThis as TestRuntimeWindow;

describe('api client runtime configuration', () => {
  afterEach(() => {
    delete runtimeWindow.evidenceDesktop;
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
      chooseRepository: vi.fn(async () => null),
    };

    await initializeApiClient();

    expect(runtimeWindow.evidenceDesktop.getApiBaseUrl).toHaveBeenCalledOnce();
    expect(getRootResource().uri).toBe('http://127.0.0.1:45321/api');
  });
});
