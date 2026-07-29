import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BrowserAuthentication,
  browserOidcConfiguration,
} from './browser-authentication.js';

const oidcEnvironment = {
  VITE_OIDC_AUTHORITY: 'https://identity.example.com',
  VITE_OIDC_CLIENT_ID: 'evidence-web',
};

const testStorage = { clear: vi.fn() };

afterEach(() => {
  testStorage.clear.mockClear();
});

describe('BrowserAuthentication', () => {
  it('keeps local and Desktop runtimes free of browser OIDC', async () => {
    const factory = vi.fn();
    const authentication = new BrowserAuthentication(factory);

    await expect(authentication.initialize({}, runtime())).resolves.toEqual({
      mode: 'local',
      status: 'authenticated',
    });
    await expect(
      authentication.initialize(
        { VITE_OIDC_AUTHORITY: 'incomplete' },
        runtime({ evidenceDesktop: {} }),
      ),
    ).resolves.toEqual({ mode: 'local', status: 'authenticated' });
    expect(factory).not.toHaveBeenCalled();
  });

  it('requires sign-in when no active OIDC user is stored', async () => {
    const manager = managerFixture(null);
    const authentication = authenticationWith(manager);

    await expect(
      authentication.initialize(oidcEnvironment, runtime()),
    ).resolves.toEqual({ mode: 'oidc', status: 'sign-in-required' });
    expect(authentication.authorization()).toBeUndefined();
  });

  it('restores an unexpired access token and sends the current path to login', async () => {
    const manager = managerFixture(user('access-token'));
    const authentication = authenticationWith(manager);
    await authentication.initialize(
      oidcEnvironment,
      runtime({
        location: locationFixture('/workspaces/workspace-1?tab=model#node-1'),
      }),
    );

    expect(authentication.authorization()).toBe('Bearer access-token');
    expect(authentication.canSignOut()).toBe(true);

    await authentication.signIn();
    expect(manager.signinRedirect).toHaveBeenCalledWith({
      state: {
        returnUrl: '/workspaces/workspace-1?tab=model#node-1',
      },
    });
  });

  it('completes the code callback and restores only a safe app path', async () => {
    const manager = managerFixture(null);
    manager.signinRedirectCallback.mockResolvedValue(
      user('callback-token', { returnUrl: '/workspaces/workspace-1' }),
    );
    const browser = runtime({
      location: locationFixture('/auth/callback?code=abc'),
    });
    const authentication = authenticationWith(manager);

    await expect(
      authentication.initialize(oidcEnvironment, browser),
    ).resolves.toEqual({ mode: 'oidc', status: 'authenticated' });

    expect(manager.signinRedirectCallback).toHaveBeenCalledWith(
      'https://app.example.com/auth/callback?code=abc',
    );
    expect(browser.history.replaceState).toHaveBeenCalledWith(
      null,
      '',
      '/workspaces/workspace-1',
    );
    expect(authentication.authorization()).toBe('Bearer callback-token');
  });

  it('clears request authorization when the access token expires', async () => {
    const manager = managerFixture(user('access-token'));
    const authentication = authenticationWith(manager);
    await authentication.initialize(oidcEnvironment, runtime());

    manager.expire();

    expect(authentication.authorization()).toBeUndefined();
    expect(authentication.canSignOut()).toBe(false);
  });
});

describe('browserOidcConfiguration', () => {
  it('builds same-origin PKCE callback settings', () => {
    expect(browserOidcConfiguration(oidcEnvironment, runtime())).toMatchObject({
      authority: 'https://identity.example.com',
      client_id: 'evidence-web',
      redirect_uri: 'https://app.example.com/auth/callback',
      post_logout_redirect_uri: 'https://app.example.com/',
      scope: 'openid profile email',
    });
  });

  it('rejects partial, insecure, or cross-origin configuration', () => {
    expect(() =>
      browserOidcConfiguration(
        { VITE_OIDC_AUTHORITY: 'https://identity.example.com' },
        runtime(),
      ),
    ).toThrow('must be configured together');
    expect(() =>
      browserOidcConfiguration(
        {
          ...oidcEnvironment,
          VITE_OIDC_AUTHORITY: 'http://identity.example.com',
        },
        runtime(),
      ),
    ).toThrow('must use HTTPS');
    expect(() =>
      browserOidcConfiguration(
        {
          ...oidcEnvironment,
          VITE_OIDC_REDIRECT_URI: 'https://other.example.com/callback',
        },
        runtime(),
      ),
    ).toThrow('application origin');
  });
});

function authenticationWith(manager: ReturnType<typeof managerFixture>) {
  return new BrowserAuthentication(async () => manager as never);
}

function managerFixture(storedUser: ReturnType<typeof user> | null) {
  let expired: (() => void) | undefined;
  return {
    events: {
      addUserLoaded: vi.fn(() => vi.fn()),
      addUserUnloaded: vi.fn(() => vi.fn()),
      addAccessTokenExpired: vi.fn((callback: () => void) => {
        expired = callback;
        return vi.fn();
      }),
    },
    getUser: vi.fn(async () => storedUser),
    removeUser: vi.fn(async () => undefined),
    signinRedirect: vi.fn(async () => undefined),
    signinRedirectCallback: vi.fn(),
    signoutRedirect: vi.fn(async () => undefined),
    expire: () => expired?.(),
  };
}

function user(accessToken: string, state: unknown = null) {
  return { access_token: accessToken, expired: false, state };
}

function runtime(overrides: Record<string, unknown> = {}) {
  return {
    history: { replaceState: vi.fn() },
    location: locationFixture('/'),
    sessionStorage: testStorage as never,
    ...overrides,
  };
}

function locationFixture(path: string) {
  const url = new URL(path, 'https://app.example.com');
  return {
    hash: url.hash,
    href: url.href,
    origin: url.origin,
    pathname: url.pathname,
    search: url.search,
  };
}
