import { Injectable } from '@nestjs/common';
import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
} from 'jose';
import type { ExternalUserIdentity } from '@evidence/server-domain';
import {
  isLoopbackHost,
  oidcConfiguration,
  type OidcConfiguration,
} from './authentication-config';

const ACCEPTED_ALGORITHMS = ['RS256', 'PS256', 'ES256', 'EdDSA'];
const DISCOVERY_TIMEOUT_MS = 10_000;

@Injectable()
export class OidcTokenVerifier {
  private keySetKey: string | undefined;
  private keySet: Promise<JWTVerifyGetKey> | undefined;

  async verify(
    token: string,
    configuration = oidcConfiguration(),
  ): Promise<ExternalUserIdentity> {
    const { payload } = await jwtVerify(
      token,
      await this.resolveKeySet(configuration),
      {
        issuer: configuration.issuer,
        audience: configuration.audience,
        algorithms: ACCEPTED_ALGORITHMS,
        requiredClaims: ['sub', 'exp'],
      },
    );

    return identityFromPayload(payload, configuration.issuer);
  }

  private resolveKeySet(
    configuration: OidcConfiguration,
  ): Promise<JWTVerifyGetKey> {
    const cacheKey = `${configuration.issuer}\u0000${configuration.jwksUri ?? ''}`;
    if (cacheKey !== this.keySetKey || !this.keySet) {
      this.keySetKey = cacheKey;
      this.keySet = createKeySet(configuration);
    }
    return this.keySet;
  }
}

async function createKeySet(
  configuration: OidcConfiguration,
): Promise<JWTVerifyGetKey> {
  const jwksUri =
    configuration.jwksUri ?? (await discoverJwksUri(configuration.issuer));
  validateRemoteEndpoint(jwksUri, 'OIDC jwks_uri');
  return createRemoteJWKSet(new URL(jwksUri));
}

async function discoverJwksUri(issuer: string): Promise<string> {
  const discoveryUrl = `${issuer.replace(/\/+$/, '')}/.well-known/openid-configuration`;
  const response = await fetch(discoveryUrl, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`OIDC discovery returned ${response.status}.`);
  }

  const document = (await response.json()) as unknown;
  if (!isRecord(document) || document.issuer !== issuer) {
    throw new Error('OIDC discovery issuer does not match configuration.');
  }
  if (typeof document.jwks_uri !== 'string') {
    throw new Error('OIDC discovery did not provide jwks_uri.');
  }
  return document.jwks_uri;
}

function identityFromPayload(
  payload: JWTPayload,
  issuer: string,
): ExternalUserIdentity {
  const subject = boundedClaim(payload.sub, 500, 'OIDC subject');
  const email = optionalBoundedClaim(payload.email, 320);
  const name =
    optionalBoundedClaim(payload.name, 200) ??
    optionalBoundedClaim(payload.preferred_username, 200) ??
    email ??
    subject;
  return { issuer, subject, name, email };
}

function boundedClaim(
  value: unknown,
  maximumLength: number,
  name: string,
): string {
  const normalized = optionalBoundedClaim(value, maximumLength);
  if (!normalized) throw new Error(`${name} is missing or invalid.`);
  return normalized;
}

function optionalBoundedClaim(
  value: unknown,
  maximumLength: number,
): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (
    !normalized ||
    normalized.length > maximumLength ||
    /\r|\n/.test(normalized)
  ) {
    return null;
  }
  return normalized;
}

function validateRemoteEndpoint(value: string, name: string): void {
  const endpoint = new URL(value);
  if (
    endpoint.protocol !== 'https:' &&
    !(endpoint.protocol === 'http:' && isLoopbackHost(endpoint.hostname))
  ) {
    throw new Error(`${name} must use HTTPS unless it targets loopback.`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
