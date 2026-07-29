const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

export type EvidenceAuthenticationMode = 'local' | 'oidc';

export interface OidcConfiguration {
  issuer: string;
  audience: string;
  jwksUri?: string;
}

export function authenticationMode(
  value = process.env.EVIDENCE_AUTH_MODE,
): EvidenceAuthenticationMode {
  const normalized = value?.trim().toLowerCase() || 'local';
  if (normalized === 'local' || normalized === 'oidc') return normalized;
  throw new Error('EVIDENCE_AUTH_MODE must be either local or oidc.');
}

export function oidcConfiguration(
  environment: NodeJS.ProcessEnv = process.env,
): OidcConfiguration {
  const issuer = requiredValue(environment.EVIDENCE_OIDC_ISSUER, 'issuer');
  const audience = requiredValue(
    environment.EVIDENCE_OIDC_AUDIENCE,
    'audience',
  );
  validateEndpoint(issuer, 'EVIDENCE_OIDC_ISSUER');

  const jwksUri = environment.EVIDENCE_OIDC_JWKS_URI?.trim() || undefined;
  if (jwksUri) validateEndpoint(jwksUri, 'EVIDENCE_OIDC_JWKS_URI');

  return { issuer, audience, ...(jwksUri ? { jwksUri } : {}) };
}

export function oidcAutoProvision(
  value = process.env.EVIDENCE_OIDC_AUTO_PROVISION,
): boolean {
  const normalized = value?.trim().toLowerCase();
  if (!normalized || normalized === 'true') return true;
  if (normalized === 'false') return false;
  throw new Error('EVIDENCE_OIDC_AUTO_PROVISION must be true or false.');
}

export function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTS.has(host.trim().toLowerCase());
}

function requiredValue(value: string | undefined, name: string): string {
  const normalized = value?.trim();
  if (!normalized)
    throw new Error(`EVIDENCE_OIDC_${name.toUpperCase()} is required.`);
  if (/\r|\n/.test(normalized) || normalized.length > 2_048) {
    throw new Error(`EVIDENCE_OIDC_${name.toUpperCase()} is invalid.`);
  }
  return normalized;
}

function validateEndpoint(value: string, name: string): void {
  let endpoint: URL;
  try {
    endpoint = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute URL.`);
  }
  if (
    endpoint.protocol !== 'https:' &&
    !(endpoint.protocol === 'http:' && isLoopbackHost(endpoint.hostname))
  ) {
    throw new Error(`${name} must use HTTPS unless it targets loopback.`);
  }
}
