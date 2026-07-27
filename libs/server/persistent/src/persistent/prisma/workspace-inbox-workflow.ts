import { randomUUID } from 'node:crypto';
import {
  DomainError,
  InboxCandidateDecision,
  InboxStoryCandidate,
  Ref,
  assertInboxExtractionVersion,
  normalizeContentSha256,
  normalizeInboxCandidateDecisionReason,
  normalizeInboxCandidateSet,
  parseInboxCandidateDecisionAction,
  parseInboxCandidateStatus,
  type CreateInboxExtractionInput,
  type InboxCandidateDecisionAction,
  type InboxCandidateListQuery,
  type InboxStoryCandidateInput,
  type ProposedInboxCandidateSet,
  type WorkspaceInboxWorkflow,
} from '@evidence/server-domain';
import { Prisma } from '@prisma/client';
import {
  hashInboxCandidateDecision,
  hashInboxCandidateInput,
} from '../workflow-content';
import type { PrismaStore } from './types';
import { isUniqueConflict } from './utils';
import { allocateWorkspaceReference } from './workflow-sequence';
import {
  PrismaWorkspaceInboxExtractions,
  extractionInclude,
} from './workspace-inbox-extractions';

const CANDIDATE_INCLUDE = {
  citations: {
    include: {
      inboxRevision: true,
      inboxItem: { select: { latestRevisionId: true } },
    },
    orderBy: { position: 'asc' },
  },
  decision: true,
  selectedIteration: { select: { id: true } },
} satisfies Prisma.InboxStoryCandidateInclude;

const EXTRACTION_INCLUDE = extractionInclude();

type CandidateRow = Prisma.InboxStoryCandidateGetPayload<{
  include: typeof CANDIDATE_INCLUDE;
}>;
type CandidateCitationRow = CandidateRow['citations'][number];
type CandidateDecisionRow = NonNullable<CandidateRow['decision']>;
type ExtractionRow = Prisma.InboxExtractionGetPayload<{
  include: typeof EXTRACTION_INCLUDE;
}>;

export class PrismaWorkspaceInboxWorkflow implements WorkspaceInboxWorkflow {
  private readonly extractions: PrismaWorkspaceInboxExtractions;

  constructor(
    private readonly store: PrismaStore,
    private readonly workspaceId: string,
    private readonly clock: () => Date = () => new Date(),
  ) {
    this.extractions = new PrismaWorkspaceInboxExtractions(
      store,
      workspaceId,
      clock,
    );
  }

  createExtraction(
    input: CreateInboxExtractionInput,
    requestedByUserId: string,
  ) {
    return this.extractions.createExtraction(input, requestedByUserId);
  }

  findExtraction(extractionId: string) {
    return this.extractions.findExtraction(extractionId);
  }

  async proposeCandidates(
    extractionId: string,
    expectedVersion: number,
    candidateInputs: InboxStoryCandidateInput[],
  ): Promise<ProposedInboxCandidateSet> {
    assertInboxExtractionVersion(expectedVersion);
    const candidateIds: string[] = [];
    const proposedAt = this.clock();

    await this.store.$transaction(async (store) => {
      const extraction = await requireExtraction(
        store,
        this.workspaceId,
        extractionId,
      );
      if (extraction.status !== 'awaiting_agent') {
        throw DomainError.conflict(
          `Inbox Extraction ${extractionId} no longer accepts Candidates`,
        );
      }
      if (extraction.version !== expectedVersion) {
        throw DomainError.conflict(
          `Inbox Extraction ${extractionId} has changed`,
        );
      }

      const selectedIds = extraction.sources.map(
        (source) => source.inboxItemId,
      );
      const candidates = normalizeInboxCandidateSet(
        candidateInputs,
        selectedIds,
      );
      const sourceByItemId = new Map(
        extraction.sources.map((source) => [source.inboxItemId, source]),
      );

      for (const input of candidates) {
        const { candidate, contentSha256 } = hashInboxCandidateInput(input);
        const candidateId = randomUUID();
        const reference = await allocateWorkspaceReference(
          store,
          this.workspaceId,
          'candidate',
          proposedAt,
        );
        candidateIds.push(candidateId);
        await store.inboxStoryCandidate.create({
          data: {
            id: candidateId,
            reference,
            workspaceId: this.workspaceId,
            extractionId,
            title: candidate.title,
            problem: candidate.problem,
            role: candidate.role,
            goal: candidate.goal,
            value: candidate.value,
            cognitiveMode: candidate.cognitiveMode,
            contentSha256,
            proposedAt,
          },
        });
        await store.inboxStoryCitation.createMany({
          data: candidate.citations.map((citation, position) => {
            const source = sourceByItemId.get(citation.inboxItemId);
            if (!source || source.contentSha256 !== citation.revisionSha256) {
              throw DomainError.conflict(
                `Inbox Candidate citation no longer matches selected source ${citation.inboxItemId}`,
              );
            }
            return {
              id: randomUUID(),
              candidateId,
              inboxItemId: source.inboxItemId,
              inboxRevisionId: source.inboxRevisionId,
              position,
              locator: citation.locator,
              revisionSha256: citation.revisionSha256,
            };
          }),
        });
      }

      const completed = await store.inboxExtraction.updateMany({
        where: {
          id: extractionId,
          workspaceId: this.workspaceId,
          status: 'awaiting_agent',
          version: expectedVersion,
        },
        data: {
          status: 'completed',
          version: { increment: 1 },
          completedAt: proposedAt,
        },
      });
      if (completed.count !== 1) {
        throw DomainError.conflict(
          `Inbox Extraction ${extractionId} has changed`,
        );
      }
    });

    const [extraction, candidates] = await Promise.all([
      this.extractions.requireExtraction(extractionId),
      this.store.inboxStoryCandidate.findMany({
        where: { id: { in: candidateIds }, workspaceId: this.workspaceId },
        include: CANDIDATE_INCLUDE,
        orderBy: { proposedAt: 'asc' },
      }),
    ]);
    return { extraction, candidates: candidates.map(assembleCandidate) };
  }

  async listCandidates(
    query: InboxCandidateListQuery,
  ): Promise<[InboxStoryCandidate[], number]> {
    validatePage(query.page, query.pageSize);
    if (query.status) parseInboxCandidateStatus(query.status);
    const rows = await this.store.inboxStoryCandidate.findMany({
      where: candidateListWhere(this.workspaceId, query),
      include: CANDIDATE_INCLUDE,
      orderBy: { proposedAt: 'desc' },
    });
    const candidates = rows.map(assembleCandidate);
    const matching = query.status
      ? candidates.filter(
          (candidate) => candidate.description().status === query.status,
        )
      : candidates;
    const start = (query.page - 1) * query.pageSize;
    return [matching.slice(start, start + query.pageSize), matching.length];
  }

  async findCandidate(
    candidateId: string,
  ): Promise<InboxStoryCandidate | null> {
    const row = await this.store.inboxStoryCandidate.findFirst({
      where: { id: candidateId, workspaceId: this.workspaceId },
      include: CANDIDATE_INCLUDE,
    });
    return row ? assembleCandidate(row) : null;
  }

  async decideCandidate(
    candidateId: string,
    candidateSha256Input: string,
    actionInput: InboxCandidateDecisionAction,
    reasonInput: string,
    decidedByUserId: string,
  ): Promise<{
    candidate: InboxStoryCandidate;
    decision: InboxCandidateDecision;
  }> {
    const candidateSha256 = normalizeContentSha256(candidateSha256Input);
    const action = parseInboxCandidateDecisionAction(actionInput);
    const reason = normalizeInboxCandidateDecisionReason(reasonInput);
    const decidedAt = this.clock();
    let decisionId = '';

    try {
      await this.store.$transaction(async (store) => {
        const current = await requireCandidate(
          store,
          this.workspaceId,
          candidateId,
        );
        const status = candidateStatus(current);
        if (
          status === 'selected' ||
          status === 'deferred' ||
          status === 'rejected'
        ) {
          throw DomainError.conflict(
            `Inbox Candidate ${candidateId} is already ${status}`,
          );
        }
        if (current.contentSha256 !== candidateSha256) {
          throw DomainError.conflict(
            `Inbox Candidate ${candidateId} content has changed`,
          );
        }

        const reference = await allocateWorkspaceReference(
          store,
          this.workspaceId,
          'decision',
          decidedAt,
        );
        decisionId = randomUUID();
        const hashed = hashInboxCandidateDecision({
          candidateId,
          candidateSha256,
          action,
          reason,
          decidedByUserId,
          decidedAt: decidedAt.toISOString(),
        });
        await store.inboxCandidateDecision.create({
          data: {
            id: decisionId,
            reference,
            workspaceId: this.workspaceId,
            candidateId,
            candidateSha256,
            action,
            reason: hashed.reason,
            decidedByUserId,
            decidedAt,
            contentSha256: hashed.contentSha256,
          },
        });
      });
    } catch (error) {
      if (isUniqueConflict(error)) {
        throw DomainError.conflict(
          `Inbox Candidate ${candidateId} already has a terminal decision`,
        );
      }
      throw error;
    }

    const row = await requireCandidate(
      this.store,
      this.workspaceId,
      candidateId,
    );
    if (!row.decision || row.decision.id !== decisionId) {
      throw DomainError.internal(
        `Inbox Candidate Decision ${decisionId} was not persisted`,
      );
    }
    return {
      candidate: assembleCandidate(row),
      decision: assembleDecision(row.decision),
    };
  }
}

export function assembleCandidate(row: CandidateRow): InboxStoryCandidate {
  return new InboxStoryCandidate(row.id, {
    reference: row.reference,
    workspace: new Ref(row.workspaceId),
    extraction: new Ref(row.extractionId),
    title: row.title,
    problem: row.problem,
    role: row.role,
    goal: row.goal,
    value: row.value,
    cognitiveMode: parseCognitiveMode(row.cognitiveMode),
    citations: row.citations.map(assembleCitation),
    contentSha256: row.contentSha256,
    status: candidateStatus(row),
    proposedBy: 'inbox-analyst',
    proposedAt: row.proposedAt.toISOString(),
    terminalDecision: row.decision ? new Ref(row.decision.id) : null,
    selectedIteration: row.selectedIteration
      ? new Ref(row.selectedIteration.id)
      : null,
  });
}

export function candidateInclude() {
  return CANDIDATE_INCLUDE;
}

function assembleCitation(row: CandidateCitationRow) {
  return {
    inboxItem: new Ref(row.inboxItemId),
    inboxRevision: new Ref(row.inboxRevisionId),
    revisionNumber: row.inboxRevision.revisionNumber,
    revisionSha256: row.revisionSha256,
    locator: row.locator,
  };
}

function assembleDecision(row: CandidateDecisionRow): InboxCandidateDecision {
  return new InboxCandidateDecision(row.id, {
    reference: row.reference,
    workspace: new Ref(row.workspaceId),
    candidate: new Ref(row.candidateId),
    candidateSha256: row.candidateSha256,
    action: parseInboxCandidateDecisionAction(row.action),
    reason: row.reason,
    decidedBy: new Ref(row.decidedByUserId),
    decidedAt: row.decidedAt.toISOString(),
    contentSha256: row.contentSha256,
  });
}

function candidateListWhere(
  workspaceId: string,
  query: InboxCandidateListQuery,
): Prisma.InboxStoryCandidateWhereInput {
  const search = query.query?.trim();
  return {
    workspaceId,
    ...(query.extractionId ? { extractionId: query.extractionId.trim() } : {}),
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: 'insensitive' } },
            { problem: { contains: search, mode: 'insensitive' } },
            { role: { contains: search, mode: 'insensitive' } },
            { goal: { contains: search, mode: 'insensitive' } },
            { value: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
}

export function candidateStatus(row: CandidateRow) {
  if (row.selectedIteration) return 'selected' as const;
  if (row.decision?.action === 'defer') return 'deferred' as const;
  if (row.decision?.action === 'reject') return 'rejected' as const;
  if (
    row.citations.some(
      (citation) =>
        citation.inboxItem.latestRevisionId !== citation.inboxRevisionId,
    )
  ) {
    return 'stale' as const;
  }
  return 'ready' as const;
}

async function requireExtraction(
  store: PrismaStore,
  workspaceId: string,
  extractionId: string,
): Promise<ExtractionRow> {
  const row = await store.inboxExtraction.findFirst({
    where: { id: extractionId, workspaceId },
    include: EXTRACTION_INCLUDE,
  });
  if (!row) {
    throw DomainError.notFound(`Inbox Extraction ${extractionId} not found`);
  }
  return row;
}

async function requireCandidate(
  store: PrismaStore,
  workspaceId: string,
  candidateId: string,
): Promise<CandidateRow> {
  const row = await store.inboxStoryCandidate.findFirst({
    where: { id: candidateId, workspaceId },
    include: CANDIDATE_INCLUDE,
  });
  if (!row) {
    throw DomainError.notFound(`Inbox Candidate ${candidateId} not found`);
  }
  return row;
}

function parseCognitiveMode(value: string) {
  if (value === 'clear' || value === 'complicated' || value === 'complex') {
    return value;
  }
  throw DomainError.internal(`unsupported Inbox Candidate mode: ${value}`);
}

function validatePage(page: number, pageSize: number): void {
  if (
    !Number.isSafeInteger(page) ||
    page <= 0 ||
    !Number.isSafeInteger(pageSize) ||
    pageSize <= 0 ||
    pageSize > 100
  ) {
    throw DomainError.validation(
      'Inbox Candidate page and pageSize must be positive and pageSize at most 100',
    );
  }
}
