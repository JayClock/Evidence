import type { ExecutionContext } from '@nestjs/common';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ApiAuthorizationGuard,
  assertRemoteApiIsSecured,
  currentUserId,
} from './api-authorization.guard';

const originalAuthorization = process.env.EVIDENCE_API_AUTHORIZATION;

afterEach(() => {
  if (originalAuthorization === undefined) {
    delete process.env.EVIDENCE_API_AUTHORIZATION;
  } else {
    process.env.EVIDENCE_API_AUTHORIZATION = originalAuthorization;
  }
});

describe('ApiAuthorizationGuard', () => {
  it('requires the configured exact Authorization header', () => {
    process.env.EVIDENCE_API_AUTHORIZATION = 'Bearer expected-token';
    const guard = new ApiAuthorizationGuard();

    expect(() => guard.canActivate(context('/api', undefined))).toThrow(
      'Evidence API authorization failed',
    );
    expect(() =>
      guard.canActivate(context('/api', 'Bearer wrong-token')),
    ).toThrow('Evidence API authorization failed');
    expect(guard.canActivate(context('/api', 'Bearer expected-token'))).toBe(
      true,
    );
  });

  it('keeps the health probe public', () => {
    process.env.EVIDENCE_API_AUTHORIZATION = 'Bearer expected-token';

    expect(new ApiAuthorizationGuard().canActivate(context('/health'))).toBe(
      true,
    );
  });

  it('allows an unsecured loopback server but rejects remote binding', () => {
    expect(() => assertRemoteApiIsSecured('127.0.0.1', '')).not.toThrow();
    expect(() => assertRemoteApiIsSecured('0.0.0.0', '')).toThrow(
      'EVIDENCE_API_AUTHORIZATION is required',
    );
    expect(() =>
      assertRemoteApiIsSecured('0.0.0.0', 'Bearer configured'),
    ).not.toThrow();
  });

  it('normalizes and validates the deployment user identity', () => {
    expect(currentUserId(' workspace-user ')).toBe('workspace-user');
    expect(currentUserId('')).toBe('desktop-user');
    expect(() => currentUserId('../other-user')).toThrow(
      'unsupported characters',
    );
  });
});

function context(path: string, authorization?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ path, headers: { authorization } }),
    }),
  } as ExecutionContext;
}
