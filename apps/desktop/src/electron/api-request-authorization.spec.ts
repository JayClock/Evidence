import { describe, expect, it } from 'vitest';
import { authorizedApiRequestHeaders } from './api-request-authorization';

const authorization = 'Bearer desktop-token';
const apiBaseUrl = 'https://api.example.com/evidence/api';

describe('Desktop API request authorization', () => {
  it('injects authorization only inside the configured API root', () => {
    expect(
      authorizedApiRequestHeaders(
        'https://api.example.com/evidence/api/workspaces',
        { Accept: 'application/json' },
        apiBaseUrl,
        authorization,
      ),
    ).toEqual({ Accept: 'application/json', Authorization: authorization });

    expect(
      authorizedApiRequestHeaders(
        'https://api.example.com/unrelated',
        { Accept: 'application/json' },
        apiBaseUrl,
        authorization,
      ),
    ).toEqual({ Accept: 'application/json' });
    expect(
      authorizedApiRequestHeaders(
        'https://attacker.example/evidence/api',
        { Accept: 'application/json' },
        apiBaseUrl,
        authorization,
      ),
    ).toEqual({ Accept: 'application/json' });
  });

  it('replaces differently cased authorization headers', () => {
    expect(
      authorizedApiRequestHeaders(
        apiBaseUrl,
        { authorization: 'Bearer stale' },
        apiBaseUrl,
        authorization,
      ),
    ).toEqual({ Authorization: authorization });
  });

  it('does not mutate headers when authorization is absent', () => {
    const headers = { Accept: 'application/json' };
    expect(
      authorizedApiRequestHeaders(apiBaseUrl, headers, apiBaseUrl, undefined),
    ).toBe(headers);
  });
});
