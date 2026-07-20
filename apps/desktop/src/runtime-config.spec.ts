import { describe, expect, it } from 'vitest';
import { resolveApiBaseUrl, resolveWebUrl } from './runtime-config';

describe('desktop runtime config', () => {
  it('uses loopback defaults', () => {
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
});
