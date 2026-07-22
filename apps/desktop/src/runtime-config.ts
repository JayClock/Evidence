const DEFAULT_WEB_URL = 'http://127.0.0.1:4200';

function normalizeHttpUrl(value: string, name: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute HTTP(S) URL.`);
  }

  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw new Error(
      `${name} must be an absolute HTTP(S) URL without credentials.`,
    );
  }
  if (url.protocol === 'http:' && !isLoopbackHostname(url.hostname)) {
    throw new Error(`${name} must use HTTPS unless it targets loopback.`);
  }
  return url.toString().replace(/\/$/, '');
}

function isLoopbackHostname(hostname: string): boolean {
  return ['127.0.0.1', 'localhost', '[::1]'].includes(hostname);
}

export function resolveApiBaseUrl(
  value = process.env.EVIDENCE_API_BASE_URL,
): string {
  if (!value?.trim()) {
    throw new Error('EVIDENCE_API_BASE_URL is required.');
  }
  return normalizeHttpUrl(value, 'EVIDENCE_API_BASE_URL');
}

export function resolveWebUrl(
  value = process.env.EVIDENCE_WEB_URL ?? DEFAULT_WEB_URL,
): string {
  return normalizeHttpUrl(value, 'EVIDENCE_WEB_URL');
}

export function resolveApiAuthorization(
  value = process.env.EVIDENCE_API_AUTHORIZATION,
): string | undefined {
  const normalized = value?.trim();
  if (!normalized) {
    return undefined;
  }
  if (/\r|\n/.test(normalized) || normalized.length > 4_096) {
    throw new Error('EVIDENCE_API_AUTHORIZATION is invalid.');
  }
  return normalized;
}
