import { describe, expect, it, vi } from 'vitest';
import { RemoteEvidenceClient } from './api-client';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function client(fetch: typeof globalThis.fetch) {
  return new RemoteEvidenceClient({
    apiBaseUrl: 'https://api.example.test/api',
    logicalEntitiesHref: '/api/workspaces/workspace-1/logical-entities',
    logicalRelationshipsHref:
      '/api/workspaces/workspace-1/logical-relationships',
    authorization: 'Bearer delegated-token',
    fetch,
  });
}

describe('RemoteEvidenceClient', () => {
  it('lists workspace-scoped resources through the supplied HAL collection link', async () => {
    const fetch = vi.fn(async () =>
      jsonResponse({
        _embedded: {
          logicalEntities: [
            {
              id: 'entity-1',
              _links: {
                self: {
                  href: '/api/workspaces/workspace-1/logical-entities/entity-1',
                },
              },
            },
          ],
        },
      }),
    ) as unknown as typeof globalThis.fetch;

    await expect(client(fetch).listLogicalEntities()).resolves.toEqual([
      expect.objectContaining({ id: 'entity-1' }),
    ]);

    const [url, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(String(url)).toBe(
      'https://api.example.test/api/workspaces/workspace-1/logical-entities?page=1&pageSize=100',
    );
    expect(new Headers(init?.headers).get('authorization')).toBe(
      'Bearer delegated-token',
    );
  });

  it('creates remote entities without exposing transport details to the caller', async () => {
    const fetch = vi.fn(async () =>
      jsonResponse({ id: 'entity-1', name: 'Contract' }, 201),
    ) as unknown as typeof globalThis.fetch;

    await expect(
      client(fetch).createLogicalEntity({
        type: 'EVIDENCE',
        subType: 'contract',
        name: 'Contract',
      }),
    ).resolves.toMatchObject({ id: 'entity-1' });

    const [url, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(String(url)).toBe(
      'https://api.example.test/api/workspaces/workspace-1/logical-entities',
    );
    expect(init).toMatchObject({ method: 'POST' });
    expect(JSON.parse(String(init?.body))).toEqual({
      type: 'EVIDENCE',
      subType: 'contract',
      name: 'Contract',
    });
  });

  it('follows a resource self link before updating it', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          _embedded: {
            logicalRelationships: [
              {
                id: 'relationship-1',
                _links: {
                  self: {
                    href: '/api/workspaces/workspace-1/logical-relationships/relationship-1',
                  },
                },
              },
            ],
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ id: 'relationship-1', label: 'fulfills' }),
      ) as unknown as typeof globalThis.fetch;

    await client(fetch).updateLogicalRelationship('relationship-1', {
      label: 'fulfills',
    });

    const [url, init] = vi.mocked(fetch).mock.calls[1] ?? [];
    expect(String(url)).toBe(
      'https://api.example.test/api/workspaces/workspace-1/logical-relationships/relationship-1',
    );
    expect(init).toMatchObject({ method: 'PUT' });
  });

  it('rejects supplied links that escape the configured API authority', () => {
    expect(
      () =>
        new RemoteEvidenceClient({
          apiBaseUrl: 'https://api.example.test/api',
          logicalEntitiesHref: 'https://attacker.example/entities',
          logicalRelationshipsHref:
            '/api/workspaces/workspace-1/logical-relationships',
        }),
    ).toThrow('configured API origin');

    expect(
      () =>
        new RemoteEvidenceClient({
          apiBaseUrl: 'https://api.example.test/api',
          logicalEntitiesHref: '/admin/entities',
          logicalRelationshipsHref:
            '/api/workspaces/workspace-1/logical-relationships',
        }),
    ).toThrow('outside the configured API root');
  });

  it('reports bounded remote API failures', async () => {
    const fetch = vi.fn(
      async () => new Response('forbidden', { status: 403 }),
    ) as unknown as typeof globalThis.fetch;

    await expect(client(fetch).listLogicalEntities()).rejects.toThrow(
      'Remote Evidence request failed (403): forbidden',
    );
  });
});
