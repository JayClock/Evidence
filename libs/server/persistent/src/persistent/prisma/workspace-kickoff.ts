import { randomUUID } from 'node:crypto';
import {
  DomainError,
  KickoffDecision,
  ProblemStatement,
  Ref,
  StoryCard,
  assertIterationVersion,
  assertKickoffCanConfirm,
  normalizeKickoffReplacementProposal,
  type InboxStoryCandidateInput,
  type JsonValue,
  type KickoffDecisionInput,
  type KickoffDecisionResult,
  type KickoffView,
} from '@evidence/server-domain';
import { Prisma } from '@prisma/client';
import {
  hashCanonicalJson,
  hashKickoffDecision,
  hashKickoffProposal,
} from '../workflow-content';
import type { PrismaStore } from './types';
import { inputJson, isUniqueConflict } from './utils';
import { allocateWorkspaceReference } from './workflow-sequence';
import {
  assembleIntake,
  assembleIteration,
  assembleProposal,
  iterationInclude,
} from './workspace-iterations';

const ITERATION_INCLUDE = iterationInclude();
const PROPOSAL_INCLUDE = {
  decision: true,
} satisfies Prisma.KickoffProposalInclude;

type IterationRow = Prisma.IterationGetPayload<{
  include: typeof ITERATION_INCLUDE;
}>;
type IntakeRow = Prisma.IterationIntakeGetPayload<Record<string, never>>;
type PlainProposalRow = Prisma.KickoffProposalGetPayload<Record<string, never>>;
type DecisionRow = Prisma.KickoffDecisionGetPayload<Record<string, never>>;
type ProblemRow = Prisma.ProblemStatementRevisionGetPayload<
  Record<string, never>
>;
type CardRow = Prisma.StoryCardRevisionGetPayload<Record<string, never>>;

interface StoredCitation {
  inboxItemId: string;
  inboxRevisionId: string;
  revisionNumber: number;
  revisionSha256: string;
  locator: string;
}

interface StoredSourceSnapshot {
  inboxItemId: string;
  inboxRevisionId: string;
  revisionNumber: number;
  contentSha256: string;
}

export class PrismaWorkspaceKickoff {
  constructor(
    private readonly store: PrismaStore,
    private readonly workspaceId: string,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async findKickoff(iterationId: string): Promise<KickoffView | null> {
    const iteration = await this.store.iteration.findFirst({
      where: { id: iterationId, workspaceId: this.workspaceId },
      include: ITERATION_INCLUDE,
    });
    if (!iteration) return null;
    const [intake, proposals, decisions] = await Promise.all([
      this.store.iterationIntake.findFirst({ where: { iterationId } }),
      this.store.kickoffProposal.findMany({
        where: { iterationId },
        include: PROPOSAL_INCLUDE,
        orderBy: { sequence: 'asc' },
      }),
      this.store.kickoffDecision.findMany({
        where: { iterationId },
        orderBy: { decidedAt: 'asc' },
      }),
    ]);
    if (!intake) {
      throw DomainError.internal(`Iteration ${iterationId} lost its Intake`);
    }
    const current =
      iteration.loop === 'kickoff' && iteration.stage === 'candidate_review'
        ? ([...proposals].reverse().find((proposal) => !proposal.decision) ??
          null)
        : null;
    return {
      iteration: assembleIteration(iteration),
      intake: assembleIntake(intake),
      currentProposal: current ? assembleProposal(current) : null,
      decisions: decisions.map(assembleDecision),
    };
  }

  async proposeKickoffReplacement(
    iterationId: string,
    expectedIterationVersion: number,
    rawProposal: InboxStoryCandidateInput,
  ) {
    assertIterationVersion(expectedIterationVersion);
    const proposal = normalizeKickoffReplacementProposal(rawProposal);
    const proposedAt = this.clock();
    const proposalId = randomUUID();

    await this.store.$transaction(async (store) => {
      const iteration = await requireIteration(
        store,
        this.workspaceId,
        iterationId,
      );
      if (
        iteration.lifecycle !== 'active' ||
        iteration.loop !== 'kickoff' ||
        iteration.stage !== 'candidate_drafting'
      ) {
        throw DomainError.conflict(
          `Iteration ${iterationId} is not drafting a Kickoff replacement`,
        );
      }
      if (iteration.version !== expectedIterationVersion) {
        throw DomainError.conflict(`Iteration ${iterationId} has changed`);
      }
      const intake = await requireIntake(store, iterationId);
      const storedSources =
        intake.sourceSnapshots as unknown as StoredSourceSnapshot[];
      const sourceByItemId = new Map(
        storedSources.map((source) => [source.inboxItemId, source]),
      );
      const storedCitations: StoredCitation[] = proposal.citations.map(
        (citation) => {
          const source = sourceByItemId.get(citation.inboxItemId);
          if (!source || source.contentSha256 !== citation.revisionSha256) {
            throw DomainError.conflict(
              `Kickoff Proposal citation is outside Frozen Intake source ${citation.inboxItemId}`,
            );
          }
          return {
            inboxItemId: source.inboxItemId,
            inboxRevisionId: source.inboxRevisionId,
            revisionNumber: source.revisionNumber,
            revisionSha256: source.contentSha256,
            locator: citation.locator,
          };
        },
      );
      const latest = await store.kickoffProposal.findFirst({
        where: { iterationId },
        orderBy: { sequence: 'desc' },
      });
      const sequence = (latest?.sequence ?? 0) + 1;
      const hashed = hashKickoffProposal({
        proposal,
        origin: 'requirements_analyst',
        sequence,
      });
      const reference = await allocateWorkspaceReference(
        store,
        this.workspaceId,
        'kickoff',
        proposedAt,
      );
      await store.kickoffProposal.create({
        data: {
          id: proposalId,
          reference,
          iterationId,
          sequence,
          origin: 'requirements_analyst',
          title: hashed.candidate.title,
          problem: hashed.candidate.problem,
          role: hashed.candidate.role,
          goal: hashed.candidate.goal,
          value: hashed.candidate.value,
          cognitiveMode: hashed.candidate.cognitiveMode,
          citations: inputJson(storedCitations),
          contentSha256: hashed.contentSha256,
          proposedAt,
        },
      });
      const updated = await store.iteration.updateMany({
        where: {
          id: iterationId,
          workspaceId: this.workspaceId,
          lifecycle: 'active',
          loop: 'kickoff',
          stage: 'candidate_drafting',
          version: expectedIterationVersion,
        },
        data: {
          stage: 'candidate_review',
          version: { increment: 1 },
          updatedAt: proposedAt,
        },
      });
      if (updated.count !== 1) {
        throw DomainError.conflict(`Iteration ${iterationId} has changed`);
      }
    });

    const row = await this.store.kickoffProposal.findFirst({
      where: { id: proposalId, iterationId },
    });
    if (!row) {
      throw DomainError.internal(
        `Kickoff Proposal ${proposalId} was not persisted`,
      );
    }
    return assembleProposal(row);
  }

  async decideKickoff(
    iterationId: string,
    rawInput: KickoffDecisionInput,
    decidedByUserId: string,
  ): Promise<KickoffDecisionResult> {
    const decidedAt = this.clock();
    let decisionId = '';
    let problemStatementId: string | null = null;
    let storyCardId: string | null = null;

    try {
      await this.store.$transaction(async (store) => {
        const iteration = await requireIteration(
          store,
          this.workspaceId,
          iterationId,
        );
        const hashed = hashKickoffDecision({
          ...rawInput,
          iterationId,
          decidedByUserId,
          decidedAt: decidedAt.toISOString(),
        });
        const input = hashed.decision;
        if (
          iteration.lifecycle !== 'active' ||
          iteration.loop !== 'kickoff' ||
          iteration.stage !== 'candidate_review'
        ) {
          throw DomainError.conflict(
            `Iteration ${iterationId} is not reviewing a Kickoff Proposal`,
          );
        }
        if (iteration.version !== input.expectedIterationVersion) {
          throw DomainError.conflict(`Iteration ${iterationId} has changed`);
        }
        const proposal = await requireCurrentProposal(
          store,
          iterationId,
          input.proposalId,
        );
        if (proposal.contentSha256 !== input.proposalSha256) {
          throw DomainError.conflict(
            `Kickoff Proposal ${input.proposalId} content has changed`,
          );
        }

        const decisionReference = await allocateWorkspaceReference(
          store,
          this.workspaceId,
          'decision',
          decidedAt,
        );
        decisionId = randomUUID();
        await store.kickoffDecision.create({
          data: {
            id: decisionId,
            reference: decisionReference,
            iterationId,
            proposalId: proposal.id,
            proposalSha256: proposal.contentSha256,
            action: input.action,
            reason: input.reason,
            decidedByUserId,
            decidedAt,
            contentSha256: hashed.contentSha256,
          },
        });

        let iterationUpdate: Prisma.IterationUpdateManyMutationInput;
        if (input.action === 'confirm') {
          assertKickoffCanConfirm(iteration.story?.id ?? null);
          const storyId = randomUUID();
          const storyRevisionId = randomUUID();
          problemStatementId = randomUUID();
          storyCardId = randomUUID();
          const citations = proposal.citations as unknown as StoredCitation[];
          const storyRevision = {
            title: proposal.title,
            problem: proposal.problem,
            role: proposal.role,
            goal: proposal.goal,
            value: proposal.value,
            cognitiveMode: parseCognitiveMode(proposal.cognitiveMode),
            citations: citations.map((citation) => ({
              inboxItemId: citation.inboxItemId,
              inboxRevisionId: citation.inboxRevisionId,
              contentSha256: citation.revisionSha256,
              locator: citation.locator,
            })),
            scenarios: [],
          };
          const storyRevisionSha256 = hashCanonicalJson(
            storyRevision as unknown as JsonValue,
          );
          const problemContentSha256 = hashCanonicalJson({
            title: proposal.title,
            problem: proposal.problem,
            cognitiveMode: proposal.cognitiveMode,
            citations,
          } as unknown as JsonValue);
          const cardContentSha256 = hashCanonicalJson({
            reference: 'US-001',
            title: proposal.title,
            role: proposal.role,
            goal: proposal.goal,
            value: proposal.value,
            problemStatementId,
          });
          await store.story.create({
            data: {
              id: storyId,
              workspaceId: this.workspaceId,
              iterationId,
              reference: 'US-001',
              latestRevisionId: null,
              version: 1,
              createdAt: decidedAt,
              updatedAt: decidedAt,
            },
          });
          await store.storyRevision.create({
            data: {
              id: storyRevisionId,
              storyId,
              revisionNumber: 1,
              title: storyRevision.title,
              problem: storyRevision.problem,
              role: storyRevision.role,
              goal: storyRevision.goal,
              value: storyRevision.value,
              cognitiveMode: storyRevision.cognitiveMode,
              contentSha256: storyRevisionSha256,
              sourceCandidateId: null,
              createdByUserId: decidedByUserId,
              createdAt: decidedAt,
            },
          });
          await store.storyRevisionCitation.createMany({
            data: citations.map((citation, position) => ({
              id: randomUUID(),
              storyRevisionId,
              inboxRevisionId: citation.inboxRevisionId,
              position,
              locator: citation.locator,
            })),
          });
          await store.story.update({
            where: { id: storyId },
            data: { latestRevisionId: storyRevisionId },
          });
          await store.problemStatementRevision.create({
            data: {
              id: problemStatementId,
              storyId,
              iterationId,
              revisionNumber: 1,
              title: proposal.title,
              problem: proposal.problem,
              cognitiveMode: proposal.cognitiveMode,
              citations: inputJson(citations),
              contentSha256: problemContentSha256,
              createdAt: decidedAt,
            },
          });
          await store.storyCardRevision.create({
            data: {
              id: storyCardId,
              storyId,
              iterationId,
              problemStatementId,
              revisionNumber: 1,
              title: proposal.title,
              role: proposal.role,
              goal: proposal.goal,
              value: proposal.value,
              contentSha256: cardContentSha256,
              createdAt: decidedAt,
            },
          });
          iterationUpdate = {
            loop: 'understand',
            stage: 'tqa',
            version: { increment: 1 },
            updatedAt: decidedAt,
          };
        } else if (input.action === 'revise') {
          iterationUpdate = {
            stage: 'candidate_drafting',
            version: { increment: 1 },
            updatedAt: decidedAt,
          };
        } else {
          iterationUpdate = {
            lifecycle: 'halted',
            version: { increment: 1 },
            updatedAt: decidedAt,
          };
        }
        const updated = await store.iteration.updateMany({
          where: {
            id: iterationId,
            workspaceId: this.workspaceId,
            lifecycle: 'active',
            loop: 'kickoff',
            stage: 'candidate_review',
            version: input.expectedIterationVersion,
          },
          data: iterationUpdate,
        });
        if (updated.count !== 1) {
          throw DomainError.conflict(`Iteration ${iterationId} has changed`);
        }
      });
    } catch (error) {
      if (isUniqueConflict(error)) {
        throw DomainError.conflict(
          `Kickoff Proposal ${rawInput.proposalId} already has a Decision`,
        );
      }
      throw error;
    }

    const [iteration, decision, problemStatement, storyCard] =
      await Promise.all([
        requireIteration(this.store, this.workspaceId, iterationId),
        requireDecision(this.store, iterationId, decisionId),
        problemStatementId
          ? requireProblemStatement(this.store, problemStatementId)
          : Promise.resolve(null),
        storyCardId
          ? requireStoryCard(this.store, storyCardId)
          : Promise.resolve(null),
      ]);
    return {
      iteration: assembleIteration(iteration),
      decision: assembleDecision(decision),
      problemStatement: problemStatement
        ? assembleProblemStatement(problemStatement)
        : null,
      storyCard: storyCard ? assembleStoryCard(storyCard) : null,
    };
  }
}

export function assembleDecision(row: DecisionRow): KickoffDecision {
  return new KickoffDecision(row.id, {
    reference: row.reference,
    iteration: new Ref(row.iterationId),
    proposal: new Ref(row.proposalId),
    proposalSha256: row.proposalSha256,
    action: parseDecisionAction(row.action),
    reason: row.reason,
    decidedBy: new Ref(row.decidedByUserId),
    decidedAt: row.decidedAt.toISOString(),
    contentSha256: row.contentSha256,
  });
}

function assembleProblemStatement(row: ProblemRow): ProblemStatement {
  const citations = row.citations as unknown as StoredCitation[];
  return new ProblemStatement(row.id, {
    iteration: new Ref(row.iterationId),
    story: new Ref(row.storyId),
    revisionNumber: row.revisionNumber,
    title: row.title,
    problem: row.problem,
    cognitiveMode: parseCognitiveMode(row.cognitiveMode),
    citations: citations.map(restoreCitation),
    contentSha256: row.contentSha256,
    createdAt: row.createdAt.toISOString(),
  });
}

function assembleStoryCard(row: CardRow): StoryCard {
  return new StoryCard(row.id, {
    reference: 'US-001',
    iteration: new Ref(row.iterationId),
    story: new Ref(row.storyId),
    revisionNumber: row.revisionNumber,
    title: row.title,
    role: row.role,
    goal: row.goal,
    value: row.value,
    problemStatement: new Ref(row.problemStatementId),
    contentSha256: row.contentSha256,
    createdAt: row.createdAt.toISOString(),
  });
}

async function requireIteration(
  store: PrismaStore,
  workspaceId: string,
  iterationId: string,
): Promise<IterationRow> {
  const row = await store.iteration.findFirst({
    where: { id: iterationId, workspaceId },
    include: ITERATION_INCLUDE,
  });
  if (!row) throw DomainError.notFound(`Iteration ${iterationId} not found`);
  return row;
}

async function requireIntake(
  store: PrismaStore,
  iterationId: string,
): Promise<IntakeRow> {
  const row = await store.iterationIntake.findFirst({
    where: { iterationId },
  });
  if (!row) throw DomainError.internal(`Iteration ${iterationId} lost Intake`);
  return row;
}

async function requireCurrentProposal(
  store: PrismaStore,
  iterationId: string,
  proposalId: string,
): Promise<PlainProposalRow> {
  const row = await store.kickoffProposal.findFirst({
    where: { id: proposalId, iterationId, decision: null },
    orderBy: { sequence: 'desc' },
  });
  if (!row) {
    throw DomainError.conflict(
      `Kickoff Proposal ${proposalId} is not awaiting a Decision`,
    );
  }
  return row;
}

async function requireDecision(
  store: PrismaStore,
  iterationId: string,
  decisionId: string,
): Promise<DecisionRow> {
  const row = await store.kickoffDecision.findFirst({
    where: { id: decisionId, iterationId },
  });
  if (!row) {
    throw DomainError.internal(
      `Kickoff Decision ${decisionId} was not persisted`,
    );
  }
  return row;
}

async function requireProblemStatement(
  store: PrismaStore,
  id: string,
): Promise<ProblemRow> {
  const row = await store.problemStatementRevision.findFirst({ where: { id } });
  if (!row)
    throw DomainError.internal(`Problem Statement ${id} was not persisted`);
  return row;
}

async function requireStoryCard(
  store: PrismaStore,
  id: string,
): Promise<CardRow> {
  const row = await store.storyCardRevision.findFirst({ where: { id } });
  if (!row) throw DomainError.internal(`Story Card ${id} was not persisted`);
  return row;
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

function parseDecisionAction(value: string) {
  if (
    value === 'confirm' ||
    value === 'revise' ||
    value === 'split' ||
    value === 'defer' ||
    value === 'stop'
  ) {
    return value;
  }
  throw DomainError.internal(`unsupported Kickoff Decision action: ${value}`);
}

function parseCognitiveMode(
  value: string,
): 'clear' | 'complicated' | 'complex' {
  if (value === 'clear' || value === 'complicated' || value === 'complex') {
    return value;
  }
  throw DomainError.internal(`unsupported cognitive mode: ${value}`);
}
