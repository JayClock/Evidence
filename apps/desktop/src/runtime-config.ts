const DEFAULT_API_BASE_URL = 'http://127.0.0.1:3000/api';
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
  return url.toString().replace(/\/$/, '');
}

export function resolveApiBaseUrl(
  value = process.env.EVIDENCE_API_BASE_URL ?? DEFAULT_API_BASE_URL,
): string {
  return normalizeHttpUrl(value, 'EVIDENCE_API_BASE_URL');
}

export function resolveWebUrl(
  value = process.env.EVIDENCE_WEB_URL ?? DEFAULT_WEB_URL,
): string {
  return normalizeHttpUrl(value, 'EVIDENCE_WEB_URL');
}
