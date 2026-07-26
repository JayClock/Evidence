import type {
  ClaimPairLeaseResultData,
  DecidePairInput,
  PairActionResultData,
  PairResourceData,
  RecordPairCommandObservationInput,
  RecordPairDriverAttemptInput,
  RecordPairExceptionInput,
  RecordPairRedReviewInput,
} from '@evidence/api-client';

export interface RemotePair {
  data: PairResourceData;
  links: Record<string, string>;
  raw: Record<string, unknown>;
}

export interface RemotePairTaskingEntry {
  iteration: PairResourceData['iteration'];
  story: PairResourceData['story'];
  storyRevision: PairResourceData['storyRevision'];
  approvedPlan: PairResourceData['approvedPlan'];
  links: Record<string, string>;
}

export interface PairApiClientOptions {
  apiBaseUrl: string;
  authorization?: string;
  fetch?: typeof fetch;
}

export class PairApiClient {
  private readonly apiBaseUrl: URL;
  private readonly authorization: string | undefined;
  private readonly fetch: typeof fetch;

  constructor(options: PairApiClientOptions) {
    this.apiBaseUrl = normalizeApiBaseUrl(options.apiBaseUrl);
    this.authorization = options.authorization?.trim() || undefined;
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  async getTaskingEntry(
    workspaceId: string,
    iterationId: string,
    signal?: AbortSignal,
  ): Promise<RemotePairTaskingEntry> {
    const raw = await this.requestJson(
      this.path(
        `/workspaces/${encode(workspaceId)}/iterations/${encode(iterationId)}/tasking`,
      ),
      { signal },
    );
    const approvedPlan = record(raw.approvedPlan, 'Approved Tasking Plan');
    const iteration = record(raw.iteration, 'Tasking Iteration');
    const story = record(raw.story, 'Tasking Story');
    const storyRevision = record(raw.storyRevision, 'Tasking Story Revision');
    if (
      iteration.loop !== 'tasking' ||
      iteration.stage !== 'approved' ||
      approvedPlan.contentSha256 === undefined
    ) {
      throw new Error('Iteration is not at the approved Pair entry.');
    }
    return {
      iteration: iteration as unknown as PairResourceData['iteration'],
      story: story as unknown as PairResourceData['story'],
      storyRevision:
        storyRevision as unknown as PairResourceData['storyRevision'],
      approvedPlan: approvedPlan as unknown as PairResourceData['approvedPlan'],
      links: links(raw),
    };
  }

  async startPair(
    tasking: RemotePairTaskingEntry,
    executorId: string,
    signal?: AbortSignal,
  ): Promise<{ pair: RemotePair; leaseToken: string }> {
    const raw = await this.requestJson(
      this.resolveApiUrl(requiredLink(tasking.links, 'start-pair')),
      {
        method: 'POST',
        body: JSON.stringify({
          expectedIterationVersion: tasking.iteration.version,
          approvedTaskingPlanId: tasking.approvedPlan.id,
          approvedTaskingPlanSha256: tasking.approvedPlan.contentSha256,
          executorId,
        }),
        signal,
      },
    );
    return {
      pair: pair(record(raw.pair, 'Started Pair')),
      leaseToken: requiredString(raw.leaseToken, 'Pair lease token'),
    };
  }

  async getPair(
    workspaceId: string,
    iterationId: string,
    signal?: AbortSignal,
  ): Promise<RemotePair> {
    return pair(
      await this.requestJson(
        this.path(
          `/workspaces/${encode(workspaceId)}/iterations/${encode(iterationId)}/pair`,
        ),
        { signal },
      ),
    );
  }

  async claimLease(
    pairResource: RemotePair,
    executorId: string,
    signal?: AbortSignal,
  ): Promise<ClaimPairLeaseResultData> {
    return this.requestTyped(requiredLink(pairResource.links, 'claim-lease'), {
      method: 'POST',
      body: JSON.stringify({
        pairRunId: pairResource.data.run.id,
        expectedPairVersion: pairResource.data.run.version,
        executorId,
      }),
      signal,
    });
  }

  async heartbeatLease(
    pairResource: RemotePair,
    leaseToken: string,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.requestJson(
      this.resolveApiUrl(requiredLink(pairResource.links, 'heartbeat-lease')),
      {
        method: 'POST',
        body: JSON.stringify({
          pairRunId: pairResource.data.run.id,
          expectedPairVersion: pairResource.data.run.version,
        }),
        signal,
      },
      leaseToken,
    );
  }

  recordDriverAttempt(
    pairResource: RemotePair,
    leaseToken: string,
    input: RecordPairDriverAttemptInput,
    signal?: AbortSignal,
  ): Promise<RemotePair> {
    return this.recordAction(
      pairResource,
      'record-driver-attempt',
      leaseToken,
      input,
      signal,
    );
  }

  recordCommandObservation(
    pairResource: RemotePair,
    leaseToken: string,
    input: RecordPairCommandObservationInput,
    signal?: AbortSignal,
  ): Promise<RemotePair> {
    return this.recordAction(
      pairResource,
      'record-command-observation',
      leaseToken,
      input,
      signal,
    );
  }

  recordRedReview(
    pairResource: RemotePair,
    leaseToken: string,
    input: RecordPairRedReviewInput,
    signal?: AbortSignal,
  ): Promise<RemotePair> {
    return this.recordAction(
      pairResource,
      'record-red-review',
      leaseToken,
      input,
      signal,
    );
  }

  recordException(
    pairResource: RemotePair,
    leaseToken: string,
    input: RecordPairExceptionInput,
    signal?: AbortSignal,
  ): Promise<RemotePair> {
    return this.recordAction(
      pairResource,
      'record-exception',
      leaseToken,
      input,
      signal,
    );
  }

  async decide(
    pairResource: RemotePair,
    input: DecidePairInput,
    signal?: AbortSignal,
  ): Promise<RemotePair> {
    const result = await this.requestTyped<PairActionResultData>(
      requiredLink(pairResource.links, 'decide'),
      { method: 'POST', body: JSON.stringify(input), signal },
    );
    return pair(result.pair as unknown as Record<string, unknown>);
  }

  private async recordAction(
    pairResource: RemotePair,
    relation:
      | 'record-driver-attempt'
      | 'record-command-observation'
      | 'record-red-review'
      | 'record-exception',
    leaseToken: string,
    input:
      | RecordPairDriverAttemptInput
      | RecordPairCommandObservationInput
      | RecordPairRedReviewInput
      | RecordPairExceptionInput,
    signal?: AbortSignal,
  ): Promise<RemotePair> {
    const result = await this.requestTyped<PairActionResultData>(
      requiredLink(pairResource.links, relation),
      { method: 'POST', body: JSON.stringify(input), signal },
      leaseToken,
    );
    return pair(result.pair as unknown as Record<string, unknown>);
  }

  private async requestTyped<T>(
    href: string,
    init: RequestInit,
    leaseToken?: string,
  ): Promise<T> {
    return (await this.requestJson(
      this.resolveApiUrl(href),
      init,
      leaseToken,
    )) as unknown as T;
  }

  private async requestJson(
    url: URL,
    init: RequestInit,
    leaseToken?: string,
  ): Promise<Record<string, unknown>> {
    const response = await this.fetch(url, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init.body === undefined
          ? {}
          : { 'Content-Type': 'application/json' }),
        ...(this.authorization ? { Authorization: this.authorization } : {}),
        ...(leaseToken ? { 'X-Evidence-Pair-Lease': leaseToken } : {}),
      },
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(
        `Evidence Pair request failed (${String(response.status)}): ${text.slice(0, 2_000) || response.statusText}`,
      );
    }
    try {
      return record(JSON.parse(text) as unknown, 'Evidence Pair response');
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error('Evidence Pair response was not valid JSON.');
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
      throw new Error('Evidence Pair link is outside the configured API root.');
    }
    return url;
  }
}

function pair(value: Record<string, unknown>): RemotePair {
  const run = record(value.run, 'Pair Run');
  const nextAction = value.nextAction;
  if (
    !Array.isArray(value.driverAttempts) ||
    !Array.isArray(value.commandObservations) ||
    !Array.isArray(value.redReviews) ||
    !Array.isArray(value.decisions) ||
    (nextAction !== null &&
      (typeof nextAction !== 'object' || Array.isArray(nextAction)))
  ) {
    throw new Error('Pair response is missing execution authority.');
  }
  requiredString(run.id, 'Pair Run id');
  positiveInteger(run.version, 'Pair Run version');
  return {
    data: value as unknown as PairResourceData,
    links: links(value),
    raw: value,
  };
}

function links(value: Record<string, unknown>): Record<string, string> {
  const source = record(value._links, 'Pair HAL links');
  return Object.fromEntries(
    Object.entries(source).flatMap(([relation, candidate]) => {
      if (
        !candidate ||
        typeof candidate !== 'object' ||
        Array.isArray(candidate)
      ) {
        return [];
      }
      const href = (candidate as Record<string, unknown>).href;
      return typeof href === 'string' ? [[relation, href]] : [];
    }),
  );
}

function requiredLink(links: Record<string, string>, relation: string): string {
  const href = links[relation];
  if (!href) throw new Error(`Pair resource is missing ${relation} link.`);
  return href;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} is required.`);
  }
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
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Evidence API must use HTTP(S).');
  }
  url.pathname = url.pathname.replace(/\/+$/, '');
  url.search = '';
  url.hash = '';
  return url;
}

function encode(value: string): string {
  return encodeURIComponent(value);
}
