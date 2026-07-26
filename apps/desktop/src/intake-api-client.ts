import type { InboxSourceCapture } from './inbox-source-adapters';

export interface RemoteInboxExtraction {
  id: string;
  reference: string;
  status: 'awaiting_agent' | 'completed' | 'failed' | 'cancelled';
  version: number;
  sources: Array<Record<string, unknown>>;
  links: Record<string, string>;
  raw: Record<string, unknown>;
}

export interface RemoteInboxCandidate {
  id: string;
  reference: string;
  status: 'ready' | 'stale' | 'selected' | 'deferred' | 'rejected';
  contentSha256: string;
  links: Record<string, string>;
  raw: Record<string, unknown>;
}

export interface RemoteIteration {
  id: string;
  reference: string;
  lifecycle: 'provisioning' | 'active' | 'provisioning_failed' | 'halted';
  loop: 'kickoff' | 'understand';
  stage: 'candidate_review' | 'candidate_drafting' | 'tqa';
  version: number;
  baseCommitSha: string;
  branchName: string | null;
  links: Record<string, string>;
  raw: Record<string, unknown>;
}

export interface RemoteKickoff {
  iteration: RemoteIteration;
  intake: Record<string, unknown>;
  currentProposal: Record<string, unknown> | null;
  decisions: Array<Record<string, unknown>>;
  links: Record<string, string>;
  raw: Record<string, unknown>;
}

export interface InboxCandidateProposalInput {
  title: string;
  problem: string;
  role: string;
  goal: string;
  value: string;
  cognitiveMode: 'clear' | 'complicated' | 'complex';
  citations: Array<{
    inboxItemId: string;
    revisionSha256: string;
    locator: string;
  }>;
}

export interface IntakeApiClientOptions {
  apiBaseUrl: string;
  authorization?: string;
  fetch?: typeof fetch;
}

export class IntakeApiClient {
  private readonly apiBaseUrl: URL;
  private readonly authorization: string | undefined;
  private readonly fetch: typeof fetch;

  constructor(options: IntakeApiClientOptions) {
    this.apiBaseUrl = normalizeApiBaseUrl(options.apiBaseUrl);
    this.authorization = options.authorization?.trim() || undefined;
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  async captureSource(
    workspaceId: string,
    source: InboxSourceCapture,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>> {
    return this.requestJson(
      this.path(`/workspaces/${encode(workspaceId)}/inbox-items`),
      { method: 'POST', body: JSON.stringify(source), signal },
    );
  }

  async createExtraction(
    workspaceId: string,
    inboxItemIds: string[],
    signal?: AbortSignal,
  ): Promise<RemoteInboxExtraction> {
    return extraction(
      await this.requestJson(
        this.path(`/workspaces/${encode(workspaceId)}/inbox-extractions`),
        {
          method: 'POST',
          body: JSON.stringify({ inboxItemIds }),
          signal,
        },
      ),
    );
  }

  async getExtraction(
    workspaceId: string,
    extractionId: string,
    signal?: AbortSignal,
  ): Promise<RemoteInboxExtraction> {
    return extraction(
      await this.requestJson(
        this.path(
          `/workspaces/${encode(workspaceId)}/inbox-extractions/${encode(extractionId)}`,
        ),
        { signal },
      ),
    );
  }

  async proposeInboxCandidates(
    extractionResource: RemoteInboxExtraction,
    candidates: InboxCandidateProposalInput[],
    signal?: AbortSignal,
  ): Promise<{
    extraction: RemoteInboxExtraction;
    candidates: RemoteInboxCandidate[];
  }> {
    const resource = await this.requestJson(
      this.resolveApiUrl(
        requiredLink(extractionResource.links, 'propose-candidates'),
      ),
      {
        method: 'POST',
        body: JSON.stringify({
          expectedVersion: extractionResource.version,
          candidates,
        }),
        signal,
      },
    );
    const embedded = record(resource._embedded, 'Candidate set embedded body');
    if (!Array.isArray(embedded.storyCandidates)) {
      throw new Error('Candidate set is missing storyCandidates.');
    }
    return {
      extraction: extraction(
        record(resource.extraction, 'Candidate set Extraction'),
      ),
      candidates: embedded.storyCandidates.map((value) =>
        candidate(record(value, 'Inbox Candidate')),
      ),
    };
  }

  async selectCandidate(
    candidateResource: RemoteInboxCandidate,
    baseCommitSha: string,
    signal?: AbortSignal,
  ): Promise<RemoteIteration> {
    return iteration(
      await this.requestJson(
        this.resolveApiUrl(requiredLink(candidateResource.links, 'select')),
        {
          method: 'POST',
          body: JSON.stringify({
            candidateSha256: candidateResource.contentSha256,
            baseCommitSha,
          }),
          signal,
        },
      ),
    );
  }

  async getIteration(
    workspaceId: string,
    iterationId: string,
    signal?: AbortSignal,
  ): Promise<RemoteIteration> {
    return iteration(
      await this.requestJson(
        this.path(
          `/workspaces/${encode(workspaceId)}/iterations/${encode(iterationId)}`,
        ),
        { signal },
      ),
    );
  }

  async getIterationIntake(
    iterationResource: RemoteIteration,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>> {
    return this.requestJson(
      this.resolveApiUrl(requiredLink(iterationResource.links, 'intake')),
      { signal },
    );
  }

  async completeProvisioning(
    iterationResource: RemoteIteration,
    branchName: string,
    signal?: AbortSignal,
  ): Promise<RemoteIteration> {
    return iteration(
      await this.requestJson(
        this.resolveApiUrl(
          requiredLink(iterationResource.links, 'complete-provisioning'),
        ),
        {
          method: 'POST',
          body: JSON.stringify({
            expectedVersion: iterationResource.version,
            baseCommitSha: iterationResource.baseCommitSha,
            branchName,
          }),
          signal,
        },
      ),
    );
  }

  async failProvisioning(
    iterationResource: RemoteIteration,
    reason: string,
    signal?: AbortSignal,
  ): Promise<RemoteIteration> {
    return iteration(
      await this.requestJson(
        this.resolveApiUrl(
          requiredLink(iterationResource.links, 'fail-provisioning'),
        ),
        {
          method: 'POST',
          body: JSON.stringify({
            expectedVersion: iterationResource.version,
            reason,
          }),
          signal,
        },
      ),
    );
  }

  async getKickoff(
    iterationResource: RemoteIteration,
    signal?: AbortSignal,
  ): Promise<RemoteKickoff> {
    const raw = await this.requestJson(
      this.resolveApiUrl(requiredLink(iterationResource.links, 'kickoff')),
      { signal },
    );
    const decisions = raw.decisions;
    if (!Array.isArray(decisions)) {
      throw new Error('Kickoff response is missing Decisions.');
    }
    return {
      iteration: iteration(record(raw.iteration, 'Kickoff Iteration')),
      intake: record(raw.intake, 'Kickoff Intake'),
      currentProposal:
        raw.currentProposal === null
          ? null
          : record(raw.currentProposal, 'Kickoff Proposal'),
      decisions: decisions.map((value) => record(value, 'Kickoff Decision')),
      links: links(raw),
      raw,
    };
  }

  async proposeKickoffReplacement(
    kickoffResource: RemoteKickoff,
    proposal: InboxCandidateProposalInput,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>> {
    return this.requestJson(
      this.resolveApiUrl(
        requiredLink(kickoffResource.links, 'propose-replacement'),
      ),
      {
        method: 'POST',
        body: JSON.stringify({
          expectedIterationVersion: kickoffResource.iteration.version,
          proposal,
        }),
        signal,
      },
    );
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
        `Evidence Intake request failed (${String(response.status)}): ${text.slice(0, 2_000) || response.statusText}`,
      );
    }
    try {
      return record(JSON.parse(text) as unknown, 'Evidence Intake response');
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error('Evidence Intake response was not valid JSON.');
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
        'Evidence Intake link is outside the configured API root.',
      );
    }
    return url;
  }
}

function extraction(value: Record<string, unknown>): RemoteInboxExtraction {
  const status = requiredString(value.status, 'Extraction status');
  if (!isExtractionStatus(status)) {
    throw new Error(`Unsupported Extraction status: ${status}`);
  }
  if (!Array.isArray(value.sources)) {
    throw new Error('Extraction sources are missing.');
  }
  return {
    id: requiredString(value.id, 'Extraction id'),
    reference: requiredString(value.reference, 'Extraction reference'),
    status,
    version: positiveInteger(value.version, 'Extraction version'),
    sources: value.sources.map((source) => record(source, 'Extraction source')),
    links: links(value),
    raw: value,
  };
}

function candidate(value: Record<string, unknown>): RemoteInboxCandidate {
  const status = requiredString(value.status, 'Candidate status');
  if (!isCandidateStatus(status)) {
    throw new Error(`Unsupported Candidate status: ${status}`);
  }
  return {
    id: requiredString(value.id, 'Candidate id'),
    reference: requiredString(value.reference, 'Candidate reference'),
    status,
    contentSha256: requiredString(
      value.contentSha256,
      'Candidate content SHA-256',
    ),
    links: links(value),
    raw: value,
  };
}

function iteration(value: Record<string, unknown>): RemoteIteration {
  const lifecycle = requiredString(value.lifecycle, 'Iteration lifecycle');
  const loop = requiredString(value.loop, 'Iteration loop');
  const stage = requiredString(value.stage, 'Iteration stage');
  if (!isIterationLifecycle(lifecycle)) {
    throw new Error(`Unsupported Iteration lifecycle: ${lifecycle}`);
  }
  if (loop !== 'kickoff' && loop !== 'understand') {
    throw new Error(`Unsupported Iteration loop: ${loop}`);
  }
  if (
    stage !== 'candidate_review' &&
    stage !== 'candidate_drafting' &&
    stage !== 'tqa'
  ) {
    throw new Error(`Unsupported Iteration stage: ${stage}`);
  }
  return {
    id: requiredString(value.id, 'Iteration id'),
    reference: requiredString(value.reference, 'Iteration reference'),
    lifecycle,
    loop,
    stage,
    version: positiveInteger(value.version, 'Iteration version'),
    baseCommitSha: requiredString(value.baseCommitSha, 'Iteration base SHA'),
    branchName: nullableString(value.branchName, 'Iteration branch'),
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
      const href = (candidate as Record<string, unknown>).href;
      return typeof href === 'string' ? [[relation, href]] : [];
    }),
  );
}

function requiredLink(links: Record<string, string>, relation: string): string {
  const href = links[relation];
  if (!href) throw new Error(`Evidence resource is missing ${relation} link.`);
  return href;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} is required.`);
  }
  return value;
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return Number(value);
}

function nullableString(value: unknown, label: string): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') throw new Error(`${label} must be a string.`);
  return value;
}

function isExtractionStatus(
  value: string,
): value is RemoteInboxExtraction['status'] {
  return ['awaiting_agent', 'completed', 'failed', 'cancelled'].includes(value);
}

function isCandidateStatus(
  value: string,
): value is RemoteInboxCandidate['status'] {
  return ['ready', 'stale', 'selected', 'deferred', 'rejected'].includes(value);
}

function isIterationLifecycle(
  value: string,
): value is RemoteIteration['lifecycle'] {
  return ['provisioning', 'active', 'provisioning_failed', 'halted'].includes(
    value,
  );
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
