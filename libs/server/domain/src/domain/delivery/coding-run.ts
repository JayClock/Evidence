import { Entity, HasMany, Ref } from '../core';
import { DomainError } from '../error';

export type CodingRunStatus =
  | 'running'
  | 'review_required'
  | 'failed'
  | 'cancelled'
  | 'accepted'
  | 'rejected';

export type CodingRunQualityStatus = 'passed' | 'failed' | 'skipped';

export interface CodingRunQualityCheck {
  name: string;
  status: CodingRunQualityStatus;
  durationMs: number | null;
  summary: string | null;
}

export interface StartCodingRunInput {
  storyRevisionId: string;
  baseCommitSha: string;
}

export interface CodingRunReviewInput {
  diffSha256: string;
  changedFileCount: number;
  qualityChecks: CodingRunQualityCheck[];
}

export interface CodingRunFailureInput {
  code: string;
  summary: string;
}

export interface CodingRunAcceptanceInput {
  diffSha256: string;
  commitSha: string;
}

export interface CodingRunDescription {
  workspace: Ref<string>;
  story: Ref<string>;
  storyRevision: Ref<string>;
  requestedBy: Ref<string>;
  status: CodingRunStatus;
  version: number;
  baseCommitSha: string;
  diffSha256: string | null;
  changedFileCount: number | null;
  qualityChecks: CodingRunQualityCheck[];
  commitSha: string | null;
  failureCode: string | null;
  failureSummary: string | null;
  decisionReason: string | null;
  startedAt: string;
  executionFinishedAt: string | null;
  decidedBy: Ref<string> | null;
  decidedAt: string | null;
}

export class CodingRun implements Entity<string, CodingRunDescription> {
  constructor(
    private readonly id: string,
    private readonly desc: CodingRunDescription,
  ) {}

  identity(): string {
    return this.id;
  }

  description(): CodingRunDescription {
    return this.desc;
  }
}

export interface CodingRunListQuery {
  page: number;
  pageSize: number;
  storyId?: string;
  status?: CodingRunStatus;
}

export interface WorkspaceCodingRuns extends HasMany<CodingRun> {
  list(query: CodingRunListQuery): Promise<[CodingRun[], number]>;
  start(
    storyId: string,
    input: StartCodingRunInput,
    requestedByUserId: string,
  ): Promise<CodingRun>;
  submitForReview(
    runId: string,
    expectedVersion: number,
    input: CodingRunReviewInput,
  ): Promise<CodingRun>;
  fail(
    runId: string,
    expectedVersion: number,
    input: CodingRunFailureInput,
  ): Promise<CodingRun>;
  cancel(runId: string, expectedVersion: number): Promise<CodingRun>;
  accept(
    runId: string,
    expectedVersion: number,
    input: CodingRunAcceptanceInput,
    decidedByUserId: string,
  ): Promise<CodingRun>;
  reject(
    runId: string,
    expectedVersion: number,
    reason: string,
    decidedByUserId: string,
  ): Promise<CodingRun>;
}

const TRANSITIONS: Readonly<Record<CodingRunStatus, CodingRunStatus[]>> = {
  running: ['review_required', 'failed', 'cancelled'],
  review_required: ['accepted', 'rejected'],
  failed: [],
  cancelled: [],
  accepted: [],
  rejected: [],
};

export function assertCodingRunTransition(
  from: CodingRunStatus,
  to: CodingRunStatus,
): void {
  if (!TRANSITIONS[from].includes(to)) {
    throw DomainError.conflict(
      `Coding Run cannot transition from ${from} to ${to}`,
    );
  }
}

export function isActiveCodingRun(status: CodingRunStatus): boolean {
  return status === 'running' || status === 'review_required';
}
