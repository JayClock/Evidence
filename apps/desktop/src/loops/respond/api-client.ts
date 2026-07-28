import type {
  ProposeRespondCandidateInput,
  RespondActionResultData,
  RespondResourceData,
} from '@evidence/api-client';

export interface RemoteRespond {
  data: RespondResourceData;
  links: Record<string, string>;
  raw: Record<string, unknown>;
}

export interface RespondApiClientOptions {
  apiBaseUrl: string;
  authorization?: string;
  fetch?: typeof fetch;
}

export class RespondApiClient {
  private readonly apiBaseUrl: URL;
  private readonly authorization: string | undefined;
  private readonly fetch: typeof fetch;

  constructor(options: RespondApiClientOptions) {
    this.apiBaseUrl = normalizeApiBaseUrl(options.apiBaseUrl);
    this.authorization = options.authorization?.trim() || undefined;
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  async getRespond(
    workspaceId: string,
    iterationId: string,
    signal?: AbortSignal,
  ): Promise<RemoteRespond> {
    return respond(
      await this.requestJson(
        this.path(
          `/workspaces/${encode(workspaceId)}/iterations/${encode(iterationId)}/respond`,
        ),
        { signal },
      ),
    );
  }

  async proposeCandidate(
    resource: RemoteRespond,
    input: ProposeRespondCandidateInput,
    signal?: AbortSignal,
  ): Promise<RemoteRespond> {
    const result = (await this.requestJson(
      this.resolveApiUrl(requiredLink(resource.links, 'propose-candidate')),
      { method: 'POST', body: JSON.stringify(input), signal },
    )) as unknown as RespondActionResultData;
    return respond(result.respond as unknown as Record<string, unknown>);
  }

  private async requestJson(
    url: URL,
    init: RequestInit,
  ): Promise<Record<string, unknown>> {
    const response = await this.fetch(url, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init.body === undefined
          ? {}
          : { 'Content-Type': 'application/json' }),
        ...(this.authorization ? { Authorization: this.authorization } : {}),
      },
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(
        `Evidence Respond request failed (${String(response.status)}): ${text.slice(0, 2_000) || response.statusText}`,
      );
    }
    try {
      return record(JSON.parse(text) as unknown, 'Evidence Respond response');
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error('Evidence Respond response was not valid JSON.');
      }
      throw error;
    }
  }

  private path(suffix: string): URL {
    return this.resolveApiUrl(
      `${this.apiBaseUrl.pathname.replace(/\/$/, '')}${suffix}`,
    );
  }

  private resolveApiUrl(href: string): URL {
    const url = new URL(href, `${this.apiBaseUrl.origin}/`);
    const root = this.apiBaseUrl.pathname.replace(/\/$/, '');
    if (
      url.origin !== this.apiBaseUrl.origin ||
      (url.pathname !== root && !url.pathname.startsWith(`${root}/`))
    ) {
      throw new Error(
        'Evidence Respond link is outside the configured API root.',
      );
    }
    return url;
  }
}

function respond(value: Record<string, unknown>): RemoteRespond {
  const iteration = record(value.iteration, 'Respond Iteration');
  requiredString(iteration.id, 'Respond Iteration id');
  positiveInteger(iteration.version, 'Respond Iteration version');
  if (!Array.isArray(value.candidates) || !Array.isArray(value.decisions)) {
    throw new Error('Respond response is missing bounded authority records.');
  }
  return {
    data: value as unknown as RespondResourceData,
    links: links(value),
    raw: value,
  };
}

function links(value: Record<string, unknown>): Record<string, string> {
  const source = record(value._links, 'Respond HAL links');
  return Object.fromEntries(
    Object.entries(source).flatMap(([relation, candidate]) => {
      if (
        !candidate ||
        typeof candidate !== 'object' ||
        Array.isArray(candidate)
      )
        return [];
      const href = (candidate as Record<string, unknown>).href;
      return typeof href === 'string' ? [[relation, href]] : [];
    }),
  );
}

function requiredLink(links: Record<string, string>, relation: string): string {
  const href = links[relation];
  if (!href) throw new Error(`Respond resource is missing ${relation} link.`);
  return href;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim())
    throw new Error(`${label} is required.`);
  return value;
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return Number(value);
}

function normalizeApiBaseUrl(value: string): URL {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol))
    throw new Error('Evidence API must use HTTP(S).');
  url.pathname = url.pathname.replace(/\/+$/, '');
  url.search = '';
  url.hash = '';
  return url;
}

function encode(value: string): string {
  return encodeURIComponent(value);
}
