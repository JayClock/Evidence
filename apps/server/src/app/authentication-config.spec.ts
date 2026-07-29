import { describe, expect, it } from 'vitest';
import {
  authenticationMode,
  oidcAutoProvision,
  oidcConfiguration,
} from './authentication-config';

describe('authentication configuration', () => {
  it('defaults to local authentication and validates explicit modes', () => {
    expect(authenticationMode(undefined)).toBe('local');
    expect(authenticationMode(' OIDC ')).toBe('oidc');
    expect(() => authenticationMode('shared')).toThrow('EVIDENCE_AUTH_MODE');
  });

  it('requires secure OIDC endpoints outside loopback', () => {
    expect(
      oidcConfiguration({
        EVIDENCE_OIDC_ISSUER: 'https://identity.example.com',
        EVIDENCE_OIDC_AUDIENCE: 'evidence-api',
      }),
    ).toEqual({
      issuer: 'https://identity.example.com',
      audience: 'evidence-api',
    });
    expect(() =>
      oidcConfiguration({
        EVIDENCE_OIDC_ISSUER: 'http://identity.example.com',
        EVIDENCE_OIDC_AUDIENCE: 'evidence-api',
      }),
    ).toThrow('must use HTTPS');
  });

  it('allows provisioning to be explicitly disabled', () => {
    expect(oidcAutoProvision(undefined)).toBe(true);
    expect(oidcAutoProvision('false')).toBe(false);
    expect(() => oidcAutoProvision('sometimes')).toThrow(
      'must be true or false',
    );
  });
});
