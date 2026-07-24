import {
  parseCodingStoryRevisionSnapshot,
  type CodingStoryRevisionSnapshot,
} from './coding-agent-protocol';
import type { CodingQualityCheck } from './coding-quality-gates';

export interface RemoteStoryResource {
  id: string;
  latestRevisionId: string;
  latestScenarioCount: number;
  links: Record<string, string>;
}

export type RemoteCodingRunStatus =
  | 'running'
  | 'review_required'
  | 'failed'
  | 'cancelled'
  | 'accepted'
  | 'rejected';

export interface RemoteCodingRunResource {
  id: string;
  storyId: string;
  storyRevisionId: string;
  status: RemoteCodingRunStatus;
  version: number;
  baseCommitSha: string;
  diffSha256: string | null;
  commitSha: string | null;
  links: Record<string, string>;
  raw: Record<string, unknown>;
}

export interface CodingRunClientOptions {
  apiBaseUrl: string;
  authorization?: string;
  fetch?: typeof fetch;
}

export class CodingRunClient {
  private readonly apiBaseUrl: URL;
  private readonly authorization: string | undefined;
  private readonly fetch: typeof fetch;

  constructor(options: CodingRunClientOptions) {
    this.apiBaseUrl = normalizeApiBaseUrl(options.apiBaseUrl);
    this.authorization = options.authorization?.trim() || undefined;
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  async getStory(
    workspaceId: string,
    storyId: string,
    signal?: AbortSignal,
  ): Promise<RemoteStoryResource> {
    const resource = await this.requestJson(
      this.path(
        `/workspaces/${encode(workspaceId)}/stories/${encode(storyId)}`,
      ),
      { signal },
    );
    return {
      id: requiredString(resource.id, 'Story id'),
      latestRevisionId: requiredString(
        resource.latestRevisionId,
        'latest Story Revision id',
      ),
      latestScenarioCount: nonNegativeInteger(
        resource.latestScenarioCount,
        'latest Scenario count',
      ),
      links: links(resource),
    };
  }

  async getStoryRevision(
    workspaceId: string,
    storyId: string,
    revisionId: string,
    signal?: AbortSignal,
  ): Promise<CodingStoryRevisionSnapshot> {
    const resource = await this.requestJson(
      this.path(
        `/workspaces/${encode(workspaceId)}/stories/${encode(storyId)}/revisions/${encode(revisionId)}`,
      ),
      { signal },
    );
    return parseCodingStoryRevisionSnapshot(resource);
  }

  async start(
    story: RemoteStoryResource,
    input: { storyRevisionId: string; baseCommitSha: string },
    signal?: AbortSignal,
  ): Promise<RemoteCodingRunResource> {
    return this.commandUrl(
      requiredLink(story.links, 'start-coding-run'),
      input,
      signal,
    );
  }

  async submitForReview(
    run: RemoteCodingRunResource,
    input: {
      diffSha256: string;
      changedFileCount: number;
      qualityChecks: CodingQualityCheck[];
    },
    signal?: AbortSignal,
  ): Promise<RemoteCodingRunResource> {
    return this.command(
      run,
      'review',
      { expectedVersion: run.version, ...input },
      signal,
    );
  }

  async fail(
    run: RemoteCodingRunResource,
    code: string,
    summary: string,
    signal?: AbortSignal,
  ): Promise<RemoteCodingRunResource> {
    return this.command(
      run,
      'fail',
      { expectedVersion: run.version, code, summary },
      signal,
    );
  }

  async cancel(
    run: RemoteCodingRunResource,
    signal?: AbortSignal,
  ): Promise<RemoteCodingRunResource> {
    return this.command(
      run,
      'cancel',
      { expectedVersion: run.version },
      signal,
    );
  }

  async accept(
    run: RemoteCodingRunResource,
    diffSha256: string,
    commitSha: string,
    signal?: AbortSignal,
  ): Promise<RemoteCodingRunResource> {
    return this.command(
      run,
      'accept',
      {
        expectedVersion: run.version,
        diffSha256,
        commitSha,
      },
      signal,
    );
  }

  async reject(
    run: RemoteCodingRunResource,
    reason: string,
    signal?: AbortSignal,
  ): Promise<RemoteCodingRunResource> {
    return this.command(
      run,
      'reject',
      { expectedVersion: run.version, reason },
      signal,
    );
  }

  private async command(
    run: RemoteCodingRunResource,
    relation: string,
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<RemoteCodingRunResource> {
    return this.commandUrl(requiredLink(run.links, relation), body, signal);
  }

  private async commandUrl(
    href: string,
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<RemoteCodingRunResource> {
    const resource = await this.requestJson(this.resolveApiUrl(href), {
      method: 'POST',
      body: JSON.stringify(body),
      signal,
    });
    return codingRun(resource);
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
        `Evidence Coding Run request failed (${String(response.status)}): ${text.slice(0, 2_000) || response.statusText}`,
      );
    }
    try {
      return record(JSON.parse(text) as unknown, 'Evidence API response');
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error('Evidence Coding Run response was not valid JSON.');
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
        'Evidence Coding Run link is outside the configured API root.',
      );
    }
    return url;
  }
}

function codingRun(value: Record<string, unknown>): RemoteCodingRunResource {
  const status = requiredString(value.status, 'Coding Run status');
  if (!isCodingRunStatus(status)) {
    throw new Error(`Evidence Coding Run status is unsupported: ${status}`);
  }
  return {
    id: requiredString(value.id, 'Coding Run id'),
    storyId: requiredString(value.storyId, 'Coding Run Story id'),
    storyRevisionId: requiredString(
      value.storyRevisionId,
      'Coding Run Story Revision id',
    ),
    status,
    version: positiveInteger(value.version, 'Coding Run version'),
    baseCommitSha: requiredString(value.baseCommitSha, 'base commit SHA'),
    diffSha256: nullableString(value.diffSha256, 'diff SHA-256'),
    commitSha: nullableString(value.commitSha, 'commit SHA'),
    links: links(value),
    raw: value,
  };
}

function links(value: Record<string, unknown>): Record<string, string> {
  const source = record(value._links, 'HAL links');
  return Object.fromEntries(
    Object.entries(source).flatMap(([relation, candidate]) => {
      if (
        !candidate ||
        typeof candidate !== 'object' ||
        Array.isArray(candidate)
      ) {
        return [];
      }
      const href = (candidate as { href?: unknown }).href;
      return typeof href === 'string' && href.trim() ? [[relation, href]] : [];
    }),
  );
}

function requiredLink(links: Record<string, string>, relation: string): string {
  const href = links[relation];
  if (!href) throw new Error(`Evidence resource is missing ${relation} link.`);
  return href;
}

function normalizeApiBaseUrl(value: string): URL {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Evidence Coding Run API must use HTTP(S).');
  }
  url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  url.search = '';
  url.hash = '';
  return url;
}

function encode(value: string): string {
  const normalized = value.trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,199}$/.test(normalized)) {
    throw new Error('Evidence resource identity is invalid.');
  }
  return encodeURIComponent(normalized);
}

function isCodingRunStatus(value: string): value is RemoteCodingRunStatus {
  return [
    'running',
    'review_required',
    'failed',
    'cancelled',
    'accepted',
    'rejected',
  ].includes(value);
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Evidence ${label} is required.`);
  }
  return value.trim();
}

function nullableString(value: unknown, label: string): string | null {
  if (value === null) return null;
  return requiredString(value, label);
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new Error(`Evidence ${label} must be positive.`);
  }
  return Number(value);
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`Evidence ${label} must not be negative.`);
  }
  return Number(value);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}
