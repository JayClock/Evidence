import { randomUUID } from 'node:crypto';
import {
  assertCodingRunTransition,
  assertCodingRunVersion,
  CodingRun,
  DomainError,
  normalizeCodingRunAcceptanceInput,
  normalizeCodingRunFailureInput,
  normalizeCodingRunQualityChecks,
  normalizeCodingRunRejectionReason,
  normalizeCodingRunReviewInput,
  normalizeStartCodingRunInput,
  parseCodingRunStatus,
  Ref,
  type CodingRunAcceptanceInput,
  type CodingRunFailureInput,
  type CodingRunListQuery,
  type CodingRunQualityCheck,
  type CodingRunReviewInput,
  type StartCodingRunInput,
  type WorkspaceCodingRuns,
} from '@evidence/server-domain';
import type { CodingRun as CodingRunRow, Prisma } from '@prisma/client';
import { EntityList } from '../database';
import type { PrismaStore } from './types';
import { inputJson, isUniqueConflict } from './utils';

const ACTIVE_STATUSES = ['running', 'review_required'] as const;

export class PrismaWorkspaceCodingRuns
  extends EntityList<CodingRun>
  implements WorkspaceCodingRuns
{
  constructor(
    private readonly store: PrismaStore,
    private readonly workspaceId: string,
  ) {
    super();
  }

  protected override async findEntities(
    from: number,
    to: number,
  ): Promise<CodingRun[]> {
    const rows = await this.store.codingRun.findMany({
      where: { workspaceId: this.workspaceId },
      orderBy: { startedAt: 'desc' },
      skip: from,
      take: Math.max(to - from, 0),
    });
    return rows.map(assembleCodingRun);
  }

  protected override async findEntity(id: string): Promise<CodingRun | null> {
    const row = await this.store.codingRun.findFirst({
      where: { id, workspaceId: this.workspaceId },
    });
    return row ? assembleCodingRun(row) : null;
  }

  override async size(): Promise<number> {
    return this.store.codingRun.count({
      where: { workspaceId: this.workspaceId },
    });
  }

  async list(query: CodingRunListQuery): Promise<[CodingRun[], number]> {
    validatePage(query.page, query.pageSize);
    const where: Prisma.CodingRunWhereInput = {
      workspaceId: this.workspaceId,
      ...(query.storyId ? { storyId: query.storyId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const [rows, total] = await Promise.all([
      this.store.codingRun.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.store.codingRun.count({ where }),
    ]);
    return [rows.map(assembleCodingRun), total];
  }

  async start(
    storyId: string,
    input: StartCodingRunInput,
    requestedByUserId: string,
  ): Promise<CodingRun> {
    const start = normalizeStartCodingRunInput(input);
    try {
      return await this.transaction(async (store) => {
        const story = await store.story.findFirst({
          where: { id: storyId, workspaceId: this.workspaceId },
          include: {
            latestRevision: {
              include: { _count: { select: { scenarios: true } } },
            },
          },
        });
        if (!story) {
          throw DomainError.notFound(`Story ${storyId} not found`);
        }
        if (
          story.latestRevisionId !== start.storyRevisionId ||
          !story.latestRevision
        ) {
          throw DomainError.conflict(
            `Story ${storyId} latest revision has changed`,
          );
        }
        if (story.latestRevision._count.scenarios === 0) {
          throw DomainError.validation(
            `Story Revision ${start.storyRevisionId} has no acceptance Scenarios`,
          );
        }
        const active = await store.codingRun.findFirst({
          where: {
            workspaceId: this.workspaceId,
            storyRevisionId: start.storyRevisionId,
            status: { in: [...ACTIVE_STATUSES] },
          },
        });
        if (active) {
          throw DomainError.conflict(
            `Story Revision ${start.storyRevisionId} already has an active Coding Run`,
          );
        }
        const row = await store.codingRun.create({
          data: {
            id: randomUUID(),
            workspaceId: this.workspaceId,
            storyId,
            storyRevisionId: start.storyRevisionId,
            requestedByUserId,
            status: 'running',
            version: 1,
            baseCommitSha: start.baseCommitSha,
            qualityChecks: inputJson([]),
            startedAt: new Date(),
          },
        });
        return assembleCodingRun(row);
      });
    } catch (error) {
      if (isUniqueConflict(error)) {
        throw DomainError.conflict(
          `Story Revision ${start.storyRevisionId} already has an active Coding Run`,
        );
      }
      throw error;
    }
  }

  async submitForReview(
    runId: string,
    expectedVersion: number,
    input: CodingRunReviewInput,
  ): Promise<CodingRun> {
    assertCodingRunVersion(expectedVersion);
    const review = normalizeCodingRunReviewInput(input);
    const current = await requireCodingRun(this.store, this.workspaceId, runId);
    if (current.status === 'review_required') {
      if (sameReview(current, review)) return assembleCodingRun(current);
      throw DomainError.conflict(`Coding Run ${runId} review has changed`);
    }
    assertCodingRunTransition(
      parseCodingRunStatus(current.status),
      'review_required',
    );
    await this.claimTransition(runId, current, expectedVersion, {
      status: 'review_required',
      diffSha256: review.diffSha256,
      changedFileCount: review.changedFileCount,
      qualityChecks: inputJson(review.qualityChecks),
      executionFinishedAt: new Date(),
      version: { increment: 1 },
    });
    return requireCodingRun(this.store, this.workspaceId, runId).then(
      assembleCodingRun,
    );
  }

  async fail(
    runId: string,
    expectedVersion: number,
    input: CodingRunFailureInput,
  ): Promise<CodingRun> {
    assertCodingRunVersion(expectedVersion);
    const failure = normalizeCodingRunFailureInput(input);
    const current = await requireCodingRun(this.store, this.workspaceId, runId);
    if (current.status === 'failed') {
      if (
        current.failureCode === failure.code &&
        current.failureSummary === failure.summary
      ) {
        return assembleCodingRun(current);
      }
      throw DomainError.conflict(`Coding Run ${runId} failure has changed`);
    }
    assertCodingRunTransition(parseCodingRunStatus(current.status), 'failed');
    await this.claimTransition(runId, current, expectedVersion, {
      status: 'failed',
      failureCode: failure.code,
      failureSummary: failure.summary,
      executionFinishedAt: new Date(),
      version: { increment: 1 },
    });
    return requireCodingRun(this.store, this.workspaceId, runId).then(
      assembleCodingRun,
    );
  }

  async cancel(runId: string, expectedVersion: number): Promise<CodingRun> {
    assertCodingRunVersion(expectedVersion);
    const current = await requireCodingRun(this.store, this.workspaceId, runId);
    if (current.status === 'cancelled') return assembleCodingRun(current);
    assertCodingRunTransition(
      parseCodingRunStatus(current.status),
      'cancelled',
    );
    await this.claimTransition(runId, current, expectedVersion, {
      status: 'cancelled',
      executionFinishedAt: new Date(),
      version: { increment: 1 },
    });
    return requireCodingRun(this.store, this.workspaceId, runId).then(
      assembleCodingRun,
    );
  }

  async accept(
    runId: string,
    expectedVersion: number,
    input: CodingRunAcceptanceInput,
    decidedByUserId: string,
  ): Promise<CodingRun> {
    assertCodingRunVersion(expectedVersion);
    const acceptance = normalizeCodingRunAcceptanceInput(input);
    const current = await requireCodingRun(this.store, this.workspaceId, runId);
    if (current.status === 'accepted') {
      if (
        current.diffSha256 === acceptance.diffSha256 &&
        current.commitSha === acceptance.commitSha
      ) {
        return assembleCodingRun(current);
      }
      throw DomainError.conflict(`Coding Run ${runId} acceptance has changed`);
    }
    assertCodingRunTransition(parseCodingRunStatus(current.status), 'accepted');
    if (current.diffSha256 !== acceptance.diffSha256) {
      throw DomainError.conflict(`Coding Run ${runId} diff has changed`);
    }
    await this.claimTransition(runId, current, expectedVersion, {
      status: 'accepted',
      commitSha: acceptance.commitSha,
      decidedByUserId,
      decidedAt: new Date(),
      version: { increment: 1 },
    });
    return requireCodingRun(this.store, this.workspaceId, runId).then(
      assembleCodingRun,
    );
  }

  async reject(
    runId: string,
    expectedVersion: number,
    reasonInput: string,
    decidedByUserId: string,
  ): Promise<CodingRun> {
    assertCodingRunVersion(expectedVersion);
    const reason = normalizeCodingRunRejectionReason(reasonInput);
    const current = await requireCodingRun(this.store, this.workspaceId, runId);
    if (current.status === 'rejected') {
      if (current.decisionReason === reason) return assembleCodingRun(current);
      throw DomainError.conflict(`Coding Run ${runId} rejection has changed`);
    }
    assertCodingRunTransition(parseCodingRunStatus(current.status), 'rejected');
    await this.claimTransition(runId, current, expectedVersion, {
      status: 'rejected',
      decisionReason: reason,
      decidedByUserId,
      decidedAt: new Date(),
      version: { increment: 1 },
    });
    return requireCodingRun(this.store, this.workspaceId, runId).then(
      assembleCodingRun,
    );
  }

  private async claimTransition(
    runId: string,
    current: CodingRunRow,
    expectedVersion: number,
    data: Prisma.CodingRunUncheckedUpdateManyInput,
  ): Promise<void> {
    const claimed = await this.store.codingRun.updateMany({
      where: {
        id: runId,
        workspaceId: this.workspaceId,
        status: current.status,
        version: expectedVersion,
      },
      data,
    });
    if (claimed.count !== 1) {
      throw DomainError.conflict(`Coding Run ${runId} has changed`);
    }
  }

  private async transaction<T>(
    operation: (store: PrismaStore) => Promise<T>,
  ): Promise<T> {
    if ('$transaction' in this.store) {
      return this.store.$transaction((transaction) => operation(transaction));
    }
    return operation(this.store);
  }
}

async function requireCodingRun(
  store: PrismaStore,
  workspaceId: string,
  runId: string,
): Promise<CodingRunRow> {
  const row = await store.codingRun.findFirst({
    where: { id: runId, workspaceId },
  });
  if (!row) {
    throw DomainError.notFound(`Coding Run ${runId} not found`);
  }
  return row;
}

function assembleCodingRun(row: CodingRunRow): CodingRun {
  return new CodingRun(row.id, {
    workspace: new Ref(row.workspaceId),
    story: new Ref(row.storyId),
    storyRevision: new Ref(row.storyRevisionId),
    requestedBy: new Ref(row.requestedByUserId),
    status: parseCodingRunStatus(row.status),
    version: row.version,
    baseCommitSha: row.baseCommitSha,
    diffSha256: row.diffSha256,
    changedFileCount: row.changedFileCount,
    qualityChecks: qualityChecks(row.qualityChecks, row.id),
    commitSha: row.commitSha,
    failureCode: row.failureCode,
    failureSummary: row.failureSummary,
    decisionReason: row.decisionReason,
    startedAt: row.startedAt.toISOString(),
    executionFinishedAt: row.executionFinishedAt?.toISOString() ?? null,
    decidedBy: row.decidedByUserId ? new Ref(row.decidedByUserId) : null,
    decidedAt: row.decidedAt?.toISOString() ?? null,
  });
}

function qualityChecks(
  value: Prisma.JsonValue,
  runId: string,
): CodingRunQualityCheck[] {
  try {
    return normalizeCodingRunQualityChecks(
      value as unknown as CodingRunQualityCheck[],
    );
  } catch {
    throw DomainError.internal(
      `Coding Run ${runId} has invalid quality checks`,
    );
  }
}

function sameReview(row: CodingRunRow, input: CodingRunReviewInput): boolean {
  return (
    row.diffSha256 === input.diffSha256 &&
    row.changedFileCount === input.changedFileCount &&
    JSON.stringify(qualityChecks(row.qualityChecks, row.id)) ===
      JSON.stringify(input.qualityChecks)
  );
}

function validatePage(page: number, pageSize: number): void {
  if (
    !Number.isSafeInteger(page) ||
    page <= 0 ||
    !Number.isSafeInteger(pageSize) ||
    pageSize <= 0
  ) {
    throw DomainError.validation('page and pageSize must be greater than 0');
  }
}
