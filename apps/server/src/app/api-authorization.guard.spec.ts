import type { ExecutionContext } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CurrentPrincipal } from '@evidence/server-api';
import type { User, Users } from '@evidence/server-domain';
import {
  ApiAuthorizationGuard,
  assertRemoteApiIsSecured,
  currentUserId,
} from './api-authorization.guard';
import type { OidcTokenVerifier } from './oidc-token-verifier';

const oidcIdentity = {
  issuer: 'https://identity.example.com',
  subject: 'provider-user-1',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('ApiAuthorizationGuard', () => {
  it('requires the configured exact local Authorization header', async () => {
    vi.stubEnv('EVIDENCE_AUTH_MODE', 'local');
    vi.stubEnv('EVIDENCE_API_AUTHORIZATION', 'Bearer expected-token');
    const { guard, principal } = fixture();

    await expect(guard.canActivate(context('/api'))).rejects.toThrow(
      'Evidence API authentication failed',
    );
    await expect(
      guard.canActivate(context('/api', 'Bearer wrong-token')),
    ).rejects.toThrow('Evidence API authentication failed');
    await expect(
      guard.canActivate(context('/api', 'Bearer expected-token')),
    ).resolves.toBe(true);
    expect(principal.require()).toMatchObject({
      userId: 'desktop-user',
      authentication: 'local',
    });
  });

  it('keeps the health probe public', async () => {
    vi.stubEnv('EVIDENCE_API_AUTHORIZATION', 'Bearer expected-token');
    const { guard, principal } = fixture();

    await expect(guard.canActivate(context('/health'))).resolves.toBe(true);
    expect(() => principal.require()).toThrow('authentication required');
  });

  it('allows unsecured local loopback and validates remote auth modes', () => {
    vi.stubEnv('EVIDENCE_AUTH_MODE', 'local');
    expect(() => assertRemoteApiIsSecured('127.0.0.1', '')).not.toThrow();
    expect(() => assertRemoteApiIsSecured('0.0.0.0', '')).toThrow(
      'EVIDENCE_API_AUTHORIZATION is required',
    );
    expect(() =>
      assertRemoteApiIsSecured('0.0.0.0', 'Bearer configured'),
    ).not.toThrow();

    vi.stubEnv('EVIDENCE_AUTH_MODE', 'oidc');
    vi.stubEnv('EVIDENCE_OIDC_ISSUER', 'https://identity.example.com');
    vi.stubEnv('EVIDENCE_OIDC_AUDIENCE', 'evidence-api');
    expect(() => assertRemoteApiIsSecured('0.0.0.0', '')).not.toThrow();
  });

  it('normalizes and validates the local deployment identity', () => {
    expect(currentUserId(' workspace-user ')).toBe('workspace-user');
    expect(currentUserId('')).toBe('desktop-user');
    expect(() => currentUserId('../other-user')).toThrow(
      'unsupported characters',
    );
  });

  it('maps an OIDC identity to an existing internal user', async () => {
    vi.stubEnv('EVIDENCE_AUTH_MODE', 'oidc');
    const { guard, oidcTokens, principal, users } = fixture();
    oidcTokens.verify.mockResolvedValue(oidcIdentity);
    users.findByExternalIdentity.mockResolvedValue(user('user-42'));

    await expect(
      guard.canActivate(context('/api', 'Bearer signed.jwt')),
    ).resolves.toBe(true);

    expect(users.findByExternalIdentity).toHaveBeenCalledWith(oidcIdentity);
    expect(users.provisionExternalIdentity).not.toHaveBeenCalled();
    expect(principal.require()).toEqual({
      userId: 'user-42',
      authentication: 'oidc',
      issuer: oidcIdentity.issuer,
      subject: oidcIdentity.subject,
    });
  });

  it('provisions a new internal user from a trusted OIDC issuer', async () => {
    vi.stubEnv('EVIDENCE_AUTH_MODE', 'oidc');
    const { guard, oidcTokens, users } = fixture();
    oidcTokens.verify.mockResolvedValue(oidcIdentity);
    users.findByExternalIdentity.mockResolvedValue(null);
    users.provisionExternalIdentity.mockResolvedValue(user('user-42'));

    await guard.canActivate(context('/api', 'Bearer signed.jwt'));

    expect(users.provisionExternalIdentity).toHaveBeenCalledWith(oidcIdentity);
  });

  it('rejects an unmapped OIDC identity when provisioning is disabled', async () => {
    vi.stubEnv('EVIDENCE_AUTH_MODE', 'oidc');
    vi.stubEnv('EVIDENCE_OIDC_AUTO_PROVISION', 'false');
    const { guard, oidcTokens, users } = fixture();
    oidcTokens.verify.mockResolvedValue(oidcIdentity);
    users.findByExternalIdentity.mockResolvedValue(null);

    await expect(
      guard.canActivate(context('/api', 'Bearer signed.jwt')),
    ).rejects.toThrow('Evidence API authentication failed');
    expect(users.provisionExternalIdentity).not.toHaveBeenCalled();
  });
});

function fixture() {
  const users = {
    findByExternalIdentity: vi.fn(),
    provisionExternalIdentity: vi.fn(),
  };
  const oidcTokens = { verify: vi.fn() };
  const principal = new CurrentPrincipal();
  const guard = new ApiAuthorizationGuard(
    users as unknown as Users,
    principal,
    oidcTokens as unknown as OidcTokenVerifier,
  );
  return { guard, oidcTokens, principal, users };
}

function user(id: string): User {
  return { identity: () => id } as User;
}

function context(path: string, authorization?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ path, headers: { authorization } }),
    }),
  } as ExecutionContext;
}
