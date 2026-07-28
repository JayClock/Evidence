import { randomUUID } from 'node:crypto';
import {
  DomainError,
  Iteration,
  IterationIntake,
  KickoffProposal,
  Ref,
  normalizeCompleteIterationProvisioningInput,
  normalizeFailIterationProvisioningInput,
  normalizeSelectInboxCandidateInput,
  parseIterationLifecycle,
  parseIterationLoop,
  parseIterationStage,
  type CompleteIterationProvisioningInput,
  type FailIterationProvisioningInput,
  type FrozenCandidateSnapshot,
  type InboxExtractionSourceDescription,
  type JsonValue,
  type SelectInboxCandidateInput,
  type SelectedIteration,
} from '@evidence/server-domain';
import { Prisma } from '@prisma/client';
import { hashIterationIntake, hashKickoffProposal } from '../workflow-content';
import type { PrismaStore } from './types';
import { inputJson, isUniqueConflict } from './utils';
import { allocateWorkspaceReference } from './workflow-sequence';
import { candidateInclude, candidateStatus } from './workspace-inbox-workflow';

const MAX_DISCOVERY_WIP = 2;

const CANDIDATE_INCLUDE = candidateInclude();
const ITERATION_INCLUDE = {
  story: { select: { id: true } },
} satisfies Prisma.IterationInclude;

type CandidateRow = Prisma.InboxStoryCandidateGetPayload<{
  include: typeof CANDIDATE_INCLUDE;
}>;
type IterationRow = Prisma.IterationGetPayload<{
  include: typeof ITERATION_INCLUDE;
}>;
type IntakeRow = Prisma.IterationIntakeGetPayload<Record<string, never>>;
type ProposalRow = Prisma.KickoffProposalGetPayload<Record<string, never>>;
type ExtractionSourceRow = Prisma.InboxExtractionSourceGetPayload<
  Record<string, never>
>;

interface StoredCandidateSnapshot {
  candidateId: string;
  candidateReference: string;
  extractionId: string;
  title: string;
  problem: string;
  role: string;
  goal: string;
  value: string;
  cognitiveMode: 'clear' | 'complicated' | 'complex';
  citations: StoredCitation[];
  contentSha256: string;
  proposedAt: string;
}

interface StoredCitation {
  inboxItemId: string;
  inboxRevisionId: string;
  revisionNumber: number;
  revisionSha256: string;
  locator: string;
}

interface StoredSourceSnapshot {
  position: number;
  inboxItemId: string;
  inboxRevisionId: string;
  revisionNumber: number;
  sourceKind: string;
  externalKey: string;
  itemStatus: 'active' | 'deferred' | 'closed';
  title: string;
  body: string;
  contentType: 'text/plain' | 'text/markdown';
  uri: string | null;
  providerMetadata: Record<string, JsonValue>;
  sourceUpdatedAt: string | null;
  capturedAt: string;
  contentSha256: string;
}

export class PrismaWorkspaceIterations {
  constructor(
    private readonly store: PrismaStore,
    private readonly workspaceId: string,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async selectCandidate(
    rawInput: SelectInboxCandidateInput,
    selectedByUserId: string,
  ): Promise<SelectedIteration> {
    const input = normalizeSelectInboxCandidateInput(rawInput);
    const admittedAt = this.clock();
    const iterationId = randomUUID();
    let intakeId = '';
    let proposalId = '';

    try {
      await this.store.$transaction(async (store) => {
        const candidate = await requireCandidate(
          store,
          this.workspaceId,
          input.candidateId,
        );
        const status = candidateStatus(candidate);
        if (status !== 'ready') {
          throw DomainError.conflict(
            `Inbox Candidate ${input.candidateId} is ${status} and cannot start an Iteration`,
          );
        }
        if (candidate.contentSha256 !== input.candidateSha256) {
          throw DomainError.conflict(
            `Inbox Candidate ${input.candidateId} content has changed`,
          );
        }
        const discoveryWip = await store.iteration.count({
          where: {
            workspaceId: this.workspaceId,
            lane: 'discovery',
            lifecycle: {
              in: ['provisioning', 'active', 'provisioning_failed'],
            },
          },
        });
        if (discoveryWip >= MAX_DISCOVERY_WIP) {
          throw DomainError.conflict(
            `Discovery WIP limit ${String(MAX_DISCOVERY_WIP)} has been reached`,
          );
        }
        const extraction = await store.inboxExtraction.findFirst({
          where: {
            id: candidate.extractionId,
            workspaceId: this.workspaceId,
          },
          include: { sources: { orderBy: { position: 'asc' } } },
        });
        if (!extraction) {
          throw DomainError.internal(
            `Inbox Candidate ${input.candidateId} lost its Extraction`,
          );
        }

        const iterationReference = await allocateWorkspaceReference(
          store,
          this.workspaceId,
          'iteration',
          admittedAt,
        );
        await store.iteration.create({
          data: {
            id: iterationId,
            reference: iterationReference,
            workspaceId: this.workspaceId,
            sourceCandidateId: candidate.id,
            sourceCandidateSha256: candidate.contentSha256,
            lifecycle: 'provisioning',
            loop: 'kickoff',
            stage: 'candidate_review',
            lane: 'discovery',
            version: 1,
            baseCommitSha: input.baseCommitSha,
            admittedByUserId: selectedByUserId,
            admittedAt,
            updatedAt: admittedAt,
          },
        });

        const candidateSnapshot = storeCandidateSnapshot(candidate);
        const sourceSnapshots = extraction.sources.map(storeSourceSnapshot);
        const requirementsProjection =
          renderRequirementsProjection(candidateSnapshot);
        const frozenAt = admittedAt;
        intakeId = iterationId;
        await store.iterationIntake.create({
          data: {
            iterationId,
            candidateSnapshot: inputJson(candidateSnapshot),
            sourceSnapshots: inputJson(sourceSnapshots),
            requirementsProjection,
            contentSha256: hashIterationIntake({
              candidateSnapshot: candidateSnapshot as unknown as JsonValue,
              sourceSnapshots: sourceSnapshots as unknown as JsonValue[],
              requirementsProjection,
              frozenAt: frozenAt.toISOString(),
            }),
            frozenAt,
          },
        });

        const proposalInput = {
          title: candidate.title,
          problem: candidate.problem,
          role: candidate.role,
          goal: candidate.goal,
          value: candidate.value,
          cognitiveMode: parseCognitiveMode(candidate.cognitiveMode),
          citations: candidate.citations.map((citation) => ({
            inboxItemId: citation.inboxItemId,
            revisionSha256: citation.revisionSha256,
            locator: citation.locator,
          })),
        };
        const proposal = hashKickoffProposal({
          proposal: proposalInput,
          origin: 'inbox_candidate',
          sequence: 1,
        });
        const proposalReference = await allocateWorkspaceReference(
          store,
          this.workspaceId,
          'kickoff',
          admittedAt,
        );
        proposalId = randomUUID();
        await store.kickoffProposal.create({
          data: {
            id: proposalId,
            reference: proposalReference,
            iterationId,
            sequence: 1,
            origin: 'inbox_candidate',
            title: proposal.candidate.title,
            problem: proposal.candidate.problem,
            role: proposal.candidate.role,
            goal: proposal.candidate.goal,
            value: proposal.candidate.value,
            cognitiveMode: proposal.candidate.cognitiveMode,
            citations: inputJson(candidateSnapshot.citations),
            contentSha256: proposal.contentSha256,
            proposedAt: admittedAt,
          },
        });
      });
    } catch (error) {
      if (isUniqueConflict(error)) {
        throw DomainError.conflict(
          `Inbox Candidate ${input.candidateId} is already selected`,
        );
      }
      throw error;
    }

    const [iteration, intake, proposal] = await Promise.all([
      this.requireIteration(iterationId),
      this.requireIntake(intakeId),
      this.requireProposal(iterationId, proposalId),
    ]);
    return { iteration, intake, proposal };
  }

  async findIteration(iterationId: string): Promise<Iteration | null> {
    const row = await this.store.iteration.findFirst({
      where: { id: iterationId, workspaceId: this.workspaceId },
      include: ITERATION_INCLUDE,
    });
    return row ? assembleIteration(row) : null;
  }

  async findIntake(iterationId: string): Promise<IterationIntake | null> {
    await this.requireOwnedIteration(iterationId);
    const row = await this.store.iterationIntake.findFirst({
      where: { iterationId },
    });
    return row ? assembleIntake(row) : null;
  }

  async completeProvisioning(
    iterationId: string,
    rawInput: CompleteIterationProvisioningInput,
  ): Promise<Iteration> {
    const input = normalizeCompleteIterationProvisioningInput(rawInput);
    const current = await this.requireOwnedIteration(iterationId);
    if (current.lifecycle !== 'provisioning') {
      throw DomainError.conflict(
        `Iteration ${iterationId} is not awaiting provisioning`,
      );
    }
    if (current.baseCommitSha !== input.baseCommitSha) {
      throw DomainError.conflict(
        `Iteration ${iterationId} base commit does not match its frozen admission`,
      );
    }
    const updated = await this.store.iteration.updateMany({
      where: {
        id: iterationId,
        workspaceId: this.workspaceId,
        lifecycle: 'provisioning',
        version: input.expectedVersion,
        baseCommitSha: input.baseCommitSha,
      },
      data: {
        lifecycle: 'active',
        branchName: input.branchName,
        provisioningFailureSummary: null,
        version: { increment: 1 },
        updatedAt: this.clock(),
      },
    });
    if (updated.count !== 1) {
      throw DomainError.conflict(`Iteration ${iterationId} has changed`);
    }
    return this.requireIteration(iterationId);
  }

  async failProvisioning(
    iterationId: string,
    rawInput: FailIterationProvisioningInput,
  ): Promise<Iteration> {
    const input = normalizeFailIterationProvisioningInput(rawInput);
    const updated = await this.store.iteration.updateMany({
      where: {
        id: iterationId,
        workspaceId: this.workspaceId,
        lifecycle: 'provisioning',
        version: input.expectedVersion,
      },
      data: {
        lifecycle: 'provisioning_failed',
        provisioningFailureSummary: input.reason,
        version: { increment: 1 },
        updatedAt: this.clock(),
      },
    });
    if (updated.count !== 1) {
      throw DomainError.conflict(
        `Iteration ${iterationId} is not awaiting provisioning or has changed`,
      );
    }
    return this.requireIteration(iterationId);
  }

  private async requireIteration(iterationId: string): Promise<Iteration> {
    const iteration = await this.findIteration(iterationId);
    if (!iteration) {
      throw DomainError.notFound(`Iteration ${iterationId} not found`);
    }
    return iteration;
  }

  private async requireOwnedIteration(
    iterationId: string,
  ): Promise<IterationRow> {
    const row = await this.store.iteration.findFirst({
      where: { id: iterationId, workspaceId: this.workspaceId },
      include: ITERATION_INCLUDE,
    });
    if (!row) {
      throw DomainError.notFound(`Iteration ${iterationId} not found`);
    }
    return row;
  }

  private async requireIntake(iterationId: string): Promise<IterationIntake> {
    const row = await this.store.iterationIntake.findFirst({
      where: { iterationId },
    });
    if (!row) {
      throw DomainError.internal(`Iteration ${iterationId} lost its Intake`);
    }
    return assembleIntake(row);
  }

  private async requireProposal(
    iterationId: string,
    proposalId: string,
  ): Promise<KickoffProposal> {
    const row = await this.store.kickoffProposal.findFirst({
      where: { id: proposalId, iterationId },
    });
    if (!row) {
      throw DomainError.internal(
        `Iteration ${iterationId} lost Kickoff Proposal ${proposalId}`,
      );
    }
    return assembleProposal(row);
  }
}

export function assembleIteration(row: IterationRow): Iteration {
  return new Iteration(row.id, {
    reference: row.reference,
    workspace: new Ref(row.workspaceId),
    sourceCandidate: new Ref(row.sourceCandidateId),
    sourceCandidateSha256: row.sourceCandidateSha256,
    lifecycle: parseIterationLifecycle(row.lifecycle),
    loop: parseIterationLoop(row.loop),
    stage: parseIterationStage(row.stage),
    lane: parseLane(row.lane),
    version: row.version,
    baseCommitSha: row.baseCommitSha,
    branchName: row.branchName,
    provisioningFailureSummary: row.provisioningFailureSummary,
    activeStory: row.story ? new Ref(row.story.id) : null,
    admittedBy: new Ref(row.admittedByUserId),
    admittedAt: row.admittedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

export function assembleIntake(row: IntakeRow): IterationIntake {
  const candidate = row.candidateSnapshot as unknown as StoredCandidateSnapshot;
  const sources = row.sourceSnapshots as unknown as StoredSourceSnapshot[];
  return new IterationIntake(row.iterationId, {
    iteration: new Ref(row.iterationId),
    candidate: restoreCandidateSnapshot(candidate),
    sources: sources.map(restoreSourceSnapshot),
    requirementsProjection: row.requirementsProjection,
    contentSha256: row.contentSha256,
    frozenAt: row.frozenAt.toISOString(),
  });
}

export function assembleProposal(row: ProposalRow): KickoffProposal {
  const citations = row.citations as unknown as StoredCitation[];
  return new KickoffProposal(row.id, {
    reference: row.reference,
    iteration: new Ref(row.iterationId),
    sequence: row.sequence,
    origin: parseProposalOrigin(row.origin),
    title: row.title,
    problem: row.problem,
    role: row.role,
    goal: row.goal,
    value: row.value,
    cognitiveMode: parseCognitiveMode(row.cognitiveMode),
    citations: citations.map(restoreCitation),
    contentSha256: row.contentSha256,
    proposedAt: row.proposedAt.toISOString(),
  });
}

export function iterationInclude() {
  return ITERATION_INCLUDE;
}

function storeCandidateSnapshot(row: CandidateRow): StoredCandidateSnapshot {
  return {
    candidateId: row.id,
    candidateReference: row.reference,
    extractionId: row.extractionId,
    title: row.title,
    problem: row.problem,
    role: row.role,
    goal: row.goal,
    value: row.value,
    cognitiveMode: parseCognitiveMode(row.cognitiveMode),
    citations: row.citations.map((citation) => ({
      inboxItemId: citation.inboxItemId,
      inboxRevisionId: citation.inboxRevisionId,
      revisionNumber: citation.inboxRevision.revisionNumber,
      revisionSha256: citation.revisionSha256,
      locator: citation.locator,
    })),
    contentSha256: row.contentSha256,
    proposedAt: row.proposedAt.toISOString(),
  };
}

function restoreCandidateSnapshot(
  value: StoredCandidateSnapshot,
): FrozenCandidateSnapshot {
  return {
    ...value,
    citations: value.citations.map(restoreCitation),
  };
}

function storeSourceSnapshot(row: ExtractionSourceRow): StoredSourceSnapshot {
  return {
    position: row.position,
    inboxItemId: row.inboxItemId,
    inboxRevisionId: row.inboxRevisionId,
    revisionNumber: row.revisionNumber,
    sourceKind: row.sourceKind,
    externalKey: row.externalKey,
    itemStatus: parseItemStatus(row.itemStatus),
    title: row.title,
    body: row.body,
    contentType: parseContentType(row.contentType),
    uri: row.uri,
    providerMetadata: row.providerMetadata as Record<string, JsonValue>,
    sourceUpdatedAt: row.sourceUpdatedAt?.toISOString() ?? null,
    capturedAt: row.capturedAt.toISOString(),
    contentSha256: row.contentSha256,
  };
}

function restoreSourceSnapshot(
  value: StoredSourceSnapshot,
): InboxExtractionSourceDescription {
  return {
    position: value.position,
    inboxItem: new Ref(value.inboxItemId),
    inboxRevision: new Ref(value.inboxRevisionId),
    revisionNumber: value.revisionNumber,
    sourceKind: value.sourceKind,
    externalKey: value.externalKey,
    itemStatus: value.itemStatus,
    title: value.title,
    body: value.body,
    contentType: value.contentType,
    uri: value.uri,
    providerMetadata: value.providerMetadata,
    sourceUpdatedAt: value.sourceUpdatedAt,
    capturedAt: value.capturedAt,
    contentSha256: value.contentSha256,
  };
}

function restoreCitation(value: StoredCitation) {
  return {
    inboxItem: new Ref(value.inboxItemId),
    inboxRevision: new Ref(value.inboxRevisionId),
    revisionNumber: value.revisionNumber,
    revisionSha256: value.revisionSha256,
    locator: value.locator,
  };
}

function renderRequirementsProjection(
  candidate: StoredCandidateSnapshot,
): string {
  const citations = candidate.citations
    .map(
      (citation) =>
        `- ${citation.inboxItemId} @ ${citation.revisionSha256} (${citation.locator})`,
    )
    .join('\n');
  return [
    `# ${candidate.title}`,
    '',
    candidate.problem,
    '',
    `As ${candidate.role}`,
    `I want ${candidate.goal}`,
    `So that ${candidate.value}`,
    '',
    '## Frozen sources',
    '',
    citations,
    '',
  ].join('\n');
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

function parseCognitiveMode(
  value: string,
): 'clear' | 'complicated' | 'complex' {
  if (value === 'clear' || value === 'complicated' || value === 'complex') {
    return value;
  }
  throw DomainError.internal(`unsupported cognitive mode: ${value}`);
}

function parseItemStatus(value: string) {
  if (value === 'active' || value === 'deferred' || value === 'closed') {
    return value;
  }
  throw DomainError.internal(`unsupported Inbox status: ${value}`);
}

function parseContentType(value: string) {
  if (value === 'text/plain' || value === 'text/markdown') return value;
  throw DomainError.internal(`unsupported Inbox content type: ${value}`);
}

function parseProposalOrigin(value: string) {
  if (value === 'inbox_candidate' || value === 'requirements_analyst') {
    return value;
  }
  throw DomainError.internal(`unsupported Kickoff Proposal origin: ${value}`);
}

function parseLane(value: string): 'discovery' | 'review' {
  if (value === 'discovery' || value === 'review') return value;
  throw DomainError.internal(`unsupported Iteration lane: ${value}`);
}
