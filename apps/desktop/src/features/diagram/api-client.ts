export interface LogicalEntityInput {
  type: 'EVIDENCE' | 'PARTICIPANT' | 'ROLE' | 'CONTEXT';
  subType?: string | null;
  name: string;
  label?: string | null;
  description?: string | null;
  attributes?: Array<{
    id: string;
    name: string;
    label?: string | null;
    type?: string | null;
    description?: string | null;
  }>;
}

export interface LogicalRelationshipInput {
  source: { id: string };
  target: { id: string };
  label?: string | null;
}

export interface RemoteEvidenceClientOptions {
  apiBaseUrl: string;
  logicalEntitiesHref: string;
  logicalRelationshipsHref: string;
  authorization?: string;
  fetch?: typeof fetch;
}

type JsonRecord = Record<string, unknown>;

export class RemoteEvidenceClient {
  private readonly apiBaseUrl: URL;
  private readonly logicalEntitiesUrl: URL;
  private readonly logicalRelationshipsUrl: URL;
  private readonly authorization: string | undefined;
  private readonly fetch: typeof fetch;

  constructor(options: RemoteEvidenceClientOptions) {
    this.apiBaseUrl = normalizeApiBaseUrl(options.apiBaseUrl);
    this.logicalEntitiesUrl = this.resolveApiUrl(options.logicalEntitiesHref);
    this.logicalRelationshipsUrl = this.resolveApiUrl(
      options.logicalRelationshipsHref,
    );
    this.authorization = options.authorization?.trim() || undefined;
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  async listLogicalEntities(signal?: AbortSignal): Promise<JsonRecord[]> {
    const collection = await this.getCollection(
      this.logicalEntitiesUrl,
      'logicalEntities',
      signal,
    );
    return collection;
  }

  async createLogicalEntity(
    input: LogicalEntityInput,
    signal?: AbortSignal,
  ): Promise<JsonRecord> {
    return this.requestJson(this.logicalEntitiesUrl, {
      method: 'POST',
      body: JSON.stringify(input),
      signal,
    });
  }

  async updateLogicalEntity(
    entityId: string,
    input: Partial<LogicalEntityInput>,
    signal?: AbortSignal,
  ): Promise<JsonRecord> {
    const entity = await this.findResource(
      await this.listLogicalEntities(signal),
      entityId,
      'logical entity',
    );
    return this.requestJson(this.resourceSelfUrl(entity), {
      method: 'PUT',
      body: JSON.stringify(input),
      signal,
    });
  }

  async deleteLogicalEntity(
    entityId: string,
    signal?: AbortSignal,
  ): Promise<JsonRecord> {
    const entity = await this.findResource(
      await this.listLogicalEntities(signal),
      entityId,
      'logical entity',
    );
    return this.requestJson(this.resourceSelfUrl(entity), {
      method: 'DELETE',
      signal,
    });
  }

  async listLogicalRelationships(signal?: AbortSignal): Promise<JsonRecord[]> {
    return this.getCollection(
      this.logicalRelationshipsUrl,
      'logicalRelationships',
      signal,
    );
  }

  async createLogicalRelationship(
    input: LogicalRelationshipInput,
    signal?: AbortSignal,
  ): Promise<JsonRecord> {
    return this.requestJson(this.logicalRelationshipsUrl, {
      method: 'POST',
      body: JSON.stringify(input),
      signal,
    });
  }

  async updateLogicalRelationship(
    relationshipId: string,
    input: Partial<LogicalRelationshipInput>,
    signal?: AbortSignal,
  ): Promise<JsonRecord> {
    const relationship = await this.findResource(
      await this.listLogicalRelationships(signal),
      relationshipId,
      'logical relationship',
    );
    return this.requestJson(this.resourceSelfUrl(relationship), {
      method: 'PUT',
      body: JSON.stringify(input),
      signal,
    });
  }

  async deleteLogicalRelationship(
    relationshipId: string,
    signal?: AbortSignal,
  ): Promise<JsonRecord> {
    const relationship = await this.findResource(
      await this.listLogicalRelationships(signal),
      relationshipId,
      'logical relationship',
    );
    return this.requestJson(this.resourceSelfUrl(relationship), {
      method: 'DELETE',
      signal,
    });
  }

  private async getCollection(
    collectionUrl: URL,
    embeddedName: string,
    signal?: AbortSignal,
  ): Promise<JsonRecord[]> {
    const url = new URL(collectionUrl);
    url.searchParams.set('page', '1');
    url.searchParams.set('pageSize', '100');
    const resource = await this.requestJson(url, { signal });
    const embedded = record(resource._embedded);
    const values = embedded[embeddedName];
    if (!Array.isArray(values)) {
      throw new Error(
        `Remote Evidence response is missing _embedded.${embeddedName}.`,
      );
    }
    return values.map((value) => record(value));
  }

  private async findResource(
    resources: JsonRecord[],
    id: string,
    resourceName: string,
  ): Promise<JsonRecord> {
    const resource = resources.find((candidate) => candidate.id === id);
    if (!resource) {
      throw new Error(`Remote ${resourceName} ${id} was not found.`);
    }
    return resource;
  }

  private resourceSelfUrl(resource: JsonRecord): URL {
    const links = record(resource._links);
    const self = record(links.self);
    if (typeof self.href !== 'string' || self.href.trim().length === 0) {
      throw new Error('Remote Evidence resource is missing its self link.');
    }
    return this.resolveApiUrl(self.href);
  }

  private async requestJson(
    url: URL,
    init: RequestInit = {},
  ): Promise<JsonRecord> {
    const response = await this.fetch(url, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init.body === undefined
          ? {}
          : { 'Content-Type': 'application/json' }),
        ...(this.authorization ? { Authorization: this.authorization } : {}),
        ...headersRecord(init.headers),
      },
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(
        `Remote Evidence request failed (${String(response.status)}): ${text.slice(0, 2_000) || response.statusText}`,
      );
    }
    if (!text) {
      return {};
    }
    try {
      return record(JSON.parse(text) as unknown);
    } catch {
      throw new Error('Remote Evidence response was not valid JSON.');
    }
  }

  private resolveApiUrl(href: string): URL {
    const url = new URL(href, `${this.apiBaseUrl.origin}/`);
    if (url.origin !== this.apiBaseUrl.origin) {
      throw new Error(
        'Remote Evidence links must stay on the configured API origin.',
      );
    }

    const apiPath = trimTrailingSlash(this.apiBaseUrl.pathname);
    if (url.pathname !== apiPath && !url.pathname.startsWith(`${apiPath}/`)) {
      throw new Error(
        'Remote Evidence link is outside the configured API root.',
      );
    }
    return url;
  }
}

function normalizeApiBaseUrl(value: string): URL {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Remote Evidence API must use HTTP(S).');
  }
  url.pathname = trimTrailingSlash(url.pathname);
  url.search = '';
  url.hash = '';
  return url;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '') || '/';
}

function record(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Remote Evidence response must contain JSON objects.');
  }
  return value as JsonRecord;
}

function headersRecord(
  headers: RequestInit['headers'],
): Record<string, string> {
  if (!headers) {
    return {};
  }
  return Object.fromEntries(new Headers(headers).entries());
}
