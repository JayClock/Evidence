import { expect } from 'vitest';

export const apiBaseUrl = process.env.API_BASE_URL?.replace(/\/$/, '');

// Contract tests intentionally use loose JSON because they validate wire-level payloads.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type JsonObject = Record<string, any>;

export async function apiRequest<T = JsonObject>(
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: T; headers: Headers }> {
  if (!apiBaseUrl) {
    throw new Error('API_BASE_URL is required to run API contract tests');
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      accept: 'application/*+json',
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  const text = await response.text();
  const body = text ? (JSON.parse(text) as T) : ({} as T);
  return { status: response.status, body, headers: response.headers };
}

export function expectResourceContentType(
  response: { headers: Headers },
  contentType: string,
) {
  expect(normalizeContentType(response.headers.get('content-type'))).toBe(
    contentType,
  );
}

export function expectHalResource(
  response: { headers: Headers; body: JsonObject },
  contentType: string,
) {
  expectResourceContentType(response, contentType);
  expect(response.body._links).toEqual(expect.any(Object));
  expect(response.body._links.self).toEqual(
    expect.objectContaining({ href: expect.any(String) }),
  );
}

export function expectHalCollection(
  response: { headers: Headers; body: JsonObject },
  contentType: string,
  embeddedKey: string,
) {
  expectHalResource(response, contentType);
  expect(response.body._embedded).toEqual(expect.any(Object));
  expect(response.body._embedded[embeddedKey]).toEqual(expect.any(Array));
  expect(response.body.page).toEqual(
    expect.objectContaining({
      number: expect.any(Number),
      size: expect.any(Number),
      totalElements: expect.any(Number),
      totalPages: expect.any(Number),
    }),
  );
}

export function uniqueName(prefix: string): string {
  return `${prefix} ${Date.now()} ${Math.random().toString(36).slice(2)}`;
}

function normalizeContentType(contentType: string | null): string {
  return contentType?.split(';')[0]?.trim().toLowerCase() ?? '';
}
