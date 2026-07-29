import type { UserManagerSettings } from 'oidc-client-ts';

export interface BrowserAuthenticationSession {
  mode: 'local' | 'oidc';
  status: 'authenticated' | 'sign-in-required';
}

export interface BrowserOidcEnvironment {
  VITE_OIDC_AUTHORITY?: string;
  VITE_OIDC_CLIENT_ID?: string;
  VITE_OIDC_SCOPE?: string;
  VITE_OIDC_REDIRECT_URI?: string;
  VITE_OIDC_POST_LOGOUT_REDIRECT_URI?: string;
}

interface OidcUser {
  access_token: string;
  expired?: boolean;
  state: unknown;
}

interface OidcManagerEvents {
  addUserLoaded(callback: (user: OidcUser) => void): () => void;
  addUserUnloaded(callback: () => void): () => void;
  addAccessTokenExpired(callback: () => void): () => void;
}

interface OidcManager {
  readonly events: OidcManagerEvents;
  getUser(): Promise<OidcUser | null>;
  removeUser(): Promise<void>;
  signinRedirect(input: { state: { returnUrl: string } }): Promise<void>;
  signinRedirectCallback(url: string): Promise<OidcUser>;
  signoutRedirect(): Promise<void>;
}

interface BrowserRuntime {
  evidenceDesktop?: unknown;
  history: Pick<History, 'replaceState'>;
  location: Pick<Location, 'hash' | 'href' | 'origin' | 'pathname' | 'search'>;
  sessionStorage: Storage;
}

type OidcManagerFactory = (
  settings: UserManagerSettings,
  storage: Storage,
) => Promise<OidcManager>;

export class BrowserAuthentication {
  private manager: OidcManager | null = null;
  private runtime: BrowserRuntime | null = null;
  private accessToken: string | undefined;
  private mode: 'local' | 'oidc' = 'local';

  constructor(
    private readonly managerFactory: OidcManagerFactory = createOidcManager,
  ) {}

  async initialize(
    environment: BrowserOidcEnvironment = browserEnvironment(),
    runtime: BrowserRuntime = window,
  ): Promise<BrowserAuthenticationSession> {
    this.runtime = runtime;
    this.accessToken = undefined;
    if (runtime.evidenceDesktop) {
      this.mode = 'local';
      this.manager = null;
      return { mode: 'local', status: 'authenticated' };
    }

    const configuration = browserOidcConfiguration(environment, runtime);
    if (!configuration) {
      this.mode = 'local';
      this.manager = null;
      return { mode: 'local', status: 'authenticated' };
    }

    this.mode = 'oidc';
    this.manager = await this.managerFactory(
      {
        ...configuration,
        response_type: 'code',
        automaticSilentRenew: false,
        monitorSession: false,
        revokeTokensOnSignout: true,
      },
      runtime.sessionStorage,
    );
    this.observeManager(this.manager);

    const user = isRedirectCallback(runtime, configuration.redirect_uri)
      ? await this.completeSignIn(this.manager, runtime)
      : await this.manager.getUser();
    if (!usableUser(user)) {
      if (user) await this.manager.removeUser();
      return { mode: 'oidc', status: 'sign-in-required' };
    }

    this.useUser(user);
    return { mode: 'oidc', status: 'authenticated' };
  }

  authorization(): string | undefined {
    return this.accessToken ? `Bearer ${this.accessToken}` : undefined;
  }

  canSignOut(): boolean {
    return this.mode === 'oidc' && Boolean(this.accessToken);
  }

  async signIn(): Promise<void> {
    const manager = this.requireManager();
    const runtime = this.requireRuntime();
    await manager.signinRedirect({
      state: { returnUrl: currentApplicationPath(runtime.location) },
    });
  }

  async signOut(): Promise<void> {
    const manager = this.requireManager();
    this.accessToken = undefined;
    await manager.signoutRedirect();
  }

  private async completeSignIn(
    manager: OidcManager,
    runtime: BrowserRuntime,
  ): Promise<OidcUser> {
    const user = await manager.signinRedirectCallback(runtime.location.href);
    runtime.history.replaceState(null, '', returnUrlFromState(user.state));
    return user;
  }

  private observeManager(manager: OidcManager): void {
    manager.events.addUserLoaded((user) => this.useUser(user));
    manager.events.addUserUnloaded(() => {
      this.accessToken = undefined;
    });
    manager.events.addAccessTokenExpired(() => {
      this.accessToken = undefined;
    });
  }

  private useUser(user: OidcUser): void {
    this.accessToken = usableUser(user) ? user.access_token : undefined;
  }

  private requireManager(): OidcManager {
    if (!this.manager) throw new Error('Browser OIDC is not configured.');
    return this.manager;
  }

  private requireRuntime(): BrowserRuntime {
    if (!this.runtime)
      throw new Error('Browser authentication is not initialized.');
    return this.runtime;
  }
}

export const browserAuthentication = new BrowserAuthentication();

export function browserOidcConfiguration(
  environment: BrowserOidcEnvironment,
  runtime: Pick<BrowserRuntime, 'location'>,
): UserManagerSettings | null {
  const authority = environment.VITE_OIDC_AUTHORITY?.trim();
  const clientId = environment.VITE_OIDC_CLIENT_ID?.trim();
  if (!authority && !clientId) return null;
  if (!authority || !clientId) {
    throw new Error(
      'VITE_OIDC_AUTHORITY and VITE_OIDC_CLIENT_ID must be configured together.',
    );
  }
  validateAuthority(authority);

  const redirectUri = sameOriginUrl(
    environment.VITE_OIDC_REDIRECT_URI,
    `${runtime.location.origin}/auth/callback`,
    runtime.location.origin,
    'VITE_OIDC_REDIRECT_URI',
  );
  const postLogoutRedirectUri = sameOriginUrl(
    environment.VITE_OIDC_POST_LOGOUT_REDIRECT_URI,
    runtime.location.origin,
    runtime.location.origin,
    'VITE_OIDC_POST_LOGOUT_REDIRECT_URI',
  );
  const scope = environment.VITE_OIDC_SCOPE?.trim() || 'openid profile email';
  if (!scope.split(/\s+/).includes('openid')) {
    throw new Error('VITE_OIDC_SCOPE must include openid.');
  }

  return {
    authority,
    client_id: boundedValue(clientId, 500, 'VITE_OIDC_CLIENT_ID'),
    redirect_uri: redirectUri,
    post_logout_redirect_uri: postLogoutRedirectUri,
    scope,
  };
}

async function createOidcManager(
  settings: UserManagerSettings,
  storage: Storage,
): Promise<OidcManager> {
  const { UserManager, WebStorageStateStore } = await import('oidc-client-ts');
  const stateStore = new WebStorageStateStore({ store: storage });
  return new UserManager({
    ...settings,
    stateStore,
    userStore: stateStore,
  });
}

function browserEnvironment(): BrowserOidcEnvironment {
  return (
    (import.meta as ImportMeta & { env?: BrowserOidcEnvironment }).env ?? {}
  );
}

function usableUser(user: OidcUser | null): user is OidcUser {
  return Boolean(user && !user.expired && user.access_token.trim());
}

function isRedirectCallback(
  runtime: BrowserRuntime,
  redirectUri: string,
): boolean {
  return runtime.location.pathname === new URL(redirectUri).pathname;
}

function currentApplicationPath(location: BrowserRuntime['location']): string {
  const path = `${location.pathname}${location.search}${location.hash}`;
  return safeApplicationPath(path) ?? '/';
}

function returnUrlFromState(state: unknown): string {
  if (!isRecord(state)) return '/';
  return safeApplicationPath(state.returnUrl) ?? '/';
}

function safeApplicationPath(value: unknown): string | null {
  return typeof value === 'string' &&
    value.startsWith('/') &&
    !value.startsWith('//')
    ? value
    : null;
}

function validateAuthority(value: string): void {
  const authority = absoluteUrl(value, 'VITE_OIDC_AUTHORITY');
  const loopback = ['127.0.0.1', 'localhost', '::1'].includes(
    authority.hostname,
  );
  if (
    authority.protocol !== 'https:' &&
    !(authority.protocol === 'http:' && loopback)
  ) {
    throw new Error(
      'VITE_OIDC_AUTHORITY must use HTTPS unless it targets loopback.',
    );
  }
}

function sameOriginUrl(
  configured: string | undefined,
  fallback: string,
  expectedOrigin: string,
  name: string,
): string {
  const value = configured?.trim() || fallback;
  const url = absoluteUrl(value, name);
  if (url.origin !== expectedOrigin) {
    throw new Error(`${name} must use the application origin.`);
  }
  return url.toString();
}

function absoluteUrl(value: string, name: string): URL {
  try {
    return new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute URL.`);
  }
}

function boundedValue(
  value: string,
  maximumLength: number,
  name: string,
): string {
  if (!value || value.length > maximumLength || /\r|\n/.test(value)) {
    throw new Error(`${name} is invalid.`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
