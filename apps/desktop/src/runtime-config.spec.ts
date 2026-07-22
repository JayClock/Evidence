import { describe, expect, it } from 'vitest';
import {
  resolveApiAuthorization,
  resolveApiBaseUrl,
  resolveWebUrl,
} from './runtime-config';

describe('desktop runtime config', () => {
  it('requires an explicitly configured remote API', () => {
    expect(() => resolveApiBaseUrl('')).toThrow(
      'EVIDENCE_API_BASE_URL is required',
    );
    expect(resolveApiBaseUrl('http://127.0.0.1:3000/api')).toBe(
      'http://127.0.0.1:3000/api',
    );
    expect(resolveWebUrl('http://127.0.0.1:4200/')).toBe(
      'http://127.0.0.1:4200',
    );
  });

  it('accepts absolute HTTPS endpoints without credentials', () => {
    expect(resolveApiBaseUrl('https://api.example.com/evidence/')).toBe(
      'https://api.example.com/evidence',
    );
  });

  it.each([
    'relative/api',
    'file:///tmp/index.html',
    'https://user:secret@example.com/api',
  ])('rejects unsafe endpoint %s', (value) => {
    expect(() => resolveApiBaseUrl(value)).toThrow(/absolute HTTP\(S\) URL/);
  });

  it('requires HTTPS for non-loopback APIs', () => {
    expect(() => resolveApiBaseUrl('http://api.example.com/api')).toThrow(
      'must use HTTPS unless it targets loopback',
    );
  });

  it('normalizes an optional API Authorization value', () => {
    expect(resolveApiAuthorization(' Bearer desktop-token ')).toBe(
      'Bearer desktop-token',
    );
    expect(resolveApiAuthorization('')).toBeUndefined();
    expect(() =>
      resolveApiAuthorization('Bearer token\nInjected: true'),
    ).toThrow('invalid');
  });
});
