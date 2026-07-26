import { randomUUID } from 'node:crypto';
import {
  DomainError,
  Ref,
  ScenarioDraft,
  ScenarioSetProposal,
  StoryClarification,
  UnderstandingDecision,
  normalizeAnswerClarificationInput,
  normalizeAskClarificationInput,
  normalizeScenarioSetInput,
  normalizeUnderstandingDecisionInput,
  type AnswerClarificationInput,
  type AnswerClarificationResult,
  type AskClarificationInput,
  type DecideUnderstandingInput,
  type ProposeScenarioSetInput,
  type UnderstandingDecisionResult,
  type UnderstandingView,
  type WorkspaceUnderstanding,
} from '@evidence/server-domain';
import { Prisma } from '@prisma/client';
import { hashCanonicalJson } from '../workflow-content';
import type { PrismaStore } from './types';
import { inputJson, now } from './utils';
import {
  assembleStory,
  assembleStoryRevision,
  STORY_INCLUDE,
  STORY_REVISION_INCLUDE,
} from './workspace-delivery';
import {
  assembleIteration,
  iterationInclude,
} from './workspace-iterations';

const ITERATION_INCLUDE = iterationInclude();
const PROPOSAL_INCLUDE = {
  drafts: { orderBy: { position: 'asc' } },
} satisfies Prisma.ScenarioSetProposalInclude;

type ClarificationRow = Prisma.StoryClarificationGetPayload<
  Record<string, never>
>;
type ProposalRow = Prisma.ScenarioSetProposalGetPayload<{
  include: typeof PROPOSAL_INCLUDE;
}>;
type DraftRow = ProposalRow['drafts'][number];
type DecisionRow = Prisma.UnderstandingDecisionGetPayload<
  Record<string, never>
>;

export class PrismaWorkspaceUnderstanding implements WorkspaceUnderstanding {
  constructor(
    private readonly store: PrismaStore,
    private readonly workspaceId: string,
  ) {}

  async findUnderstanding(
    iterationId: string,
  ): Promise<UnderstandingView | null> {
    const context = await findContext(this.store, this.workspaceId, iterationId);
    if (!context) return null;
    const [clarifications, proposal, decisions] = await Promise.all([
      this.store.storyClarification.findMany({
        where: { iterationId, workspaceId: this.workspaceId },
        orderBy: { sequence: 'asc' },
      }),
      this.store.scenarioSetProposal.findFirst({
        where: {
          iterationId,
          workspaceId: this.workspaceId,
          decision: null,
        },
        include: PROPOSAL_INCLUDE,
        orderBy: { sequence: 'desc' },
      }),
      this.store.understandingDecision.findMany({
        where: { iterationId, workspaceId: this.workspaceId },
        orderBy: { decidedAt: 'asc' },
      }),
    ]);
    return {
      iteration: assembleIteration(context.iteration),
      story: assembleStory(context.story),
      storyRevision: assembleStoryRevision(context.revision),
      pendingClarification:
        clarifications.find(({ status }) => status === 'pending')
          ? assembleClarification(
              clarifications.find(({ status }) => status === 'pending')!,
            )
          : null,
      clarifications: clarifications.map(assembleClarification),
      currentScenarioProposal: proposal ? assembleProposal(proposal) : null,
      decisions: decisions.map(assembleDecision),
    };
  }

  async askClarification(
    iterationId: string,
    raw: AskClarificationInput,
  ): Promise<StoryClarification> {
    const input = normalizeAskClarificationInput(raw);
    return this.transaction(async (store) => {
      const context = await requireContext(
        store,
        this.workspaceId,
        iterationId,
      );
      requireTqaContext(context, input.storyId, input.storyRevisionId);
      const pending = await store.storyClarification.findFirst({
        where: { iterationId, status: 'pending' },
      });
      if (pending) {
        throw DomainError.conflict(
          `Clarification ${pending.reference} awaits an answer`,
        );
      }
      await claimIteration(store, this.workspaceId, iterationId, input.expectedIterationVersion, ['tqa']);
      const sequence =
        (await store.storyClarification.count({ where: { iterationId } })) + 1;
      const askedAt = now();
      const id = randomUUID();
      const contentSha256 = hashCanonicalJson({
        iterationId,
        storyId: input.storyId,
        storyRevisionId: input.storyRevisionId,
        target: input.target,
        question: input.question,
        askedAt: askedAt.toISOString(),
      });
      const row = await store.storyClarification.create({
        data: {
          id,
          reference: reference('Q', sequence),
          workspaceId: this.workspaceId,
          iterationId,
          storyId: input.storyId,
          storyRevisionId: input.storyRevisionId,
          sequence,
          target: input.target,
          question: input.question,
          status: 'pending',
          askedAt,
          contentSha256,
        },
      });
      return assembleClarification(row);
    });
  }

  async answerClarification(
    iterationId: string,
    raw: AnswerClarificationInput,
    answeredByUserId: string,
  ): Promise<AnswerClarificationResult> {
    const input = normalizeAnswerClarificationInput(raw);
    return this.transaction(async (store) => {
      const context = await requireContext(
        store,
        this.workspaceId,
        iterationId,
      );
      const pending = await store.storyClarification.findFirst({
        where: {
          id: input.clarificationId,
          iterationId,
          workspaceId: this.workspaceId,
          status: 'pending',
        },
      });
      if (!pending) {
        throw DomainError.conflict(
          `Clarification ${input.clarificationId} is not pending`,
        );
      }
      requireTqaContext(context, pending.storyId, pending.storyRevisionId);
      const answeredAt = now();
      const contentSha256 = hashCanonicalJson({
        questionSha256: pending.contentSha256,
        answer: input.answer,
        answeredByUserId,
        answeredAt: answeredAt.toISOString(),
      });
      const storyCorrection = pending.target === 'story';
      const claimed = await store.iteration.updateMany({
        where: {
          id: iterationId,
          workspaceId: this.workspaceId,
          lifecycle: 'active',
          loop: 'understand',
          stage: 'tqa',
          version: input.expectedIterationVersion,
        },
        data: {
          version: { increment: 1 },
          updatedAt: answeredAt,
          ...(storyCorrection
            ? { loop: 'kickoff', stage: 'candidate_drafting' }
            : {}),
        },
      });
      if (claimed.count !== 1) changed(iterationId);
      const row = await store.storyClarification.update({
        where: { id: pending.id },
        data: {
          status: 'answered',
          answer: input.answer,
          answeredByUserId,
          answeredAt,
          contentSha256,
        },
      });
      const iteration = await requireIteration(store, this.workspaceId, iterationId);
      return {
        iteration: assembleIteration(iteration),
        clarification: assembleClarification(row),
      };
    });
  }

  async proposeScenarioSet(
    iterationId: string,
    raw: ProposeScenarioSetInput,
  ): Promise<ScenarioSetProposal> {
    const input = normalizeScenarioSetInput(raw);
    return this.transaction(async (store) => {
      const context = await requireContext(
        store,
        this.workspaceId,
        iterationId,
      );
      requireTqaContext(context, input.storyId, input.storyRevisionId);
      const pending = await store.storyClarification.findFirst({
        where: { iterationId, status: 'pending' },
      });
      if (pending) {
        throw DomainError.conflict(
          `Clarification ${pending.reference} must be answered first`,
        );
      }
      await claimIteration(store, this.workspaceId, iterationId, input.expectedIterationVersion, ['tqa'], { stage: 'scenario_review' });
      const sequence =
        (await store.scenarioSetProposal.count({ where: { iterationId } })) + 1;
      const proposedAt = now();
      const id = randomUUID();
      const drafts = input.scenarios.map((scenario, position) => ({
        id: randomUUID(),
        reference: reference('DRAFT', position + 1),
        position,
        ...scenario,
        contentSha256: hashCanonicalJson(
          scenario as unknown as import('@evidence/server-domain').JsonValue,
        ),
      }));
      const contentSha256 = hashCanonicalJson({
        iterationId,
        storyId: input.storyId,
        storyRevisionId: input.storyRevisionId,
        sequence,
        drafts: drafts.map(({ id: _id, ...draft }) => draft),
      });
      await store.scenarioSetProposal.create({
        data: {
          id,
          reference: reference('SP', sequence),
          workspaceId: this.workspaceId,
          iterationId,
          storyId: input.storyId,
          storyRevisionId: input.storyRevisionId,
          sequence,
          contentSha256,
          proposedAt,
          drafts: {
            create: drafts.map((draft) => ({
              id: draft.id,
              reference: draft.reference,
              position: draft.position,
              title: draft.title,
              givenSteps: inputJson(draft.given),
              whenStep: draft.when,
              thenSteps: inputJson(draft.then),
              businessData: inputJson(draft.businessData),
              contentSha256: draft.contentSha256,
            })),
          },
        },
      });
      const saved = await store.scenarioSetProposal.findUnique({
        where: { id },
        include: PROPOSAL_INCLUDE,
      });
      if (!saved) throw DomainError.internal(`Scenario Proposal ${id} was not found`);
      return assembleProposal(saved);
    });
  }

  async decideUnderstanding(
    iterationId: string,
    raw: DecideUnderstandingInput,
    decidedByUserId: string,
  ): Promise<UnderstandingDecisionResult> {
    const input = normalizeUnderstandingDecisionInput(raw);
    return this.transaction(async (store) => {
      const context = await requireContext(
        store,
        this.workspaceId,
        iterationId,
      );
      if (context.iteration.lifecycle !== 'active' || context.iteration.loop !== 'understand') {
        throw DomainError.conflict(`Iteration ${iterationId} is not in Understand`);
      }
      const proposal = input.proposalId
        ? await store.scenarioSetProposal.findFirst({
            where: {
              id: input.proposalId,
              iterationId,
              workspaceId: this.workspaceId,
              decision: null,
            },
            include: PROPOSAL_INCLUDE,
          })
        : null;
      if (input.action === 'confirm' || input.action === 'continue') {
        if (!proposal || proposal.contentSha256 !== input.proposalSha256) {
          throw DomainError.conflict('Scenario Proposal has changed');
        }
        if (context.iteration.stage !== 'scenario_review') {
          throw DomainError.conflict('No Scenario Proposal awaits a decision');
        }
      }
      const timestamp = now();
      await claimIteration(
        store,
        this.workspaceId,
        iterationId,
        input.expectedIterationVersion,
        input.action === 'confirm' || input.action === 'continue'
          ? ['scenario_review']
          : ['tqa', 'scenario_review'],
        input.action === 'continue'
          ? { stage: 'tqa' }
          : input.action === 'split' || input.action === 'defer'
            ? { lifecycle: 'halted' }
            : undefined,
        timestamp,
      );
      if (input.action === 'split' || input.action === 'defer') {
        await store.storyClarification.updateMany({
          where: { iterationId, status: 'pending' },
          data: {
            status: 'waived',
            waivedReason: input.reason,
            waivedByUserId: decidedByUserId,
            waivedAt: timestamp,
          },
        });
      }
      const selectedDrafts = proposal
        ? (input.selectedDraftIds ?? []).map((draftId) => {
            const draft = proposal.drafts.find(({ id }) => id === draftId);
            if (!draft) throw DomainError.validation(`Unknown Scenario Draft ${draftId}`);
            return draft;
          })
        : [];
      if (
        input.action === 'confirm' &&
        proposal &&
        selectedDrafts.length < proposal.drafts.length &&
        !input.reason
      ) {
        throw DomainError.validation(
          'Confirming an incomplete Proposal requires an omission reason',
        );
      }
      const decisionId = randomUUID();
      const decisionSequence =
        (await store.understandingDecision.count({ where: { iterationId } })) + 1;
      const scenarioCount = await store.storyScenario.count({
        where: { storyRevision: { storyId: context.story.id } },
      });
      const scenarios = selectedDrafts.map((draft, index) => ({
        id: randomUUID(),
        reference: reference('SC', scenarioCount + index + 1),
        draft,
      }));
      const decisionHash = hashCanonicalJson({
        iterationId,
        storyId: context.story.id,
        storyRevisionId: context.revision.id,
        proposalId: proposal?.id ?? null,
        proposalSha256: proposal?.contentSha256 ?? null,
        action: input.action,
        reason: input.reason ?? null,
        selectedDraftIds: selectedDrafts.map(({ id }) => id),
        confirmedScenarioIds: scenarios.map(({ id }) => id),
        decidedByUserId,
        decidedAt: timestamp.toISOString(),
      });
      await store.understandingDecision.create({
        data: {
          id: decisionId,
          reference: reference('UD', decisionSequence),
          workspaceId: this.workspaceId,
          iterationId,
          storyId: context.story.id,
          storyRevisionId: context.revision.id,
          proposalId: proposal?.id ?? null,
          proposalSha256: proposal?.contentSha256 ?? null,
          action: input.action,
          reason: input.reason ?? null,
          selectedDraftIds: inputJson(selectedDrafts.map(({ id }) => id)),
          confirmedScenarioIds: inputJson(scenarios.map(({ id }) => id)),
          decidedByUserId,
          decidedAt: timestamp,
          contentSha256: decisionHash,
        },
      });

      let createdRevisionId: string | null = null;
      if (input.action === 'confirm') {
        createdRevisionId = randomUUID();
        const revisionNumber = context.revision.revisionNumber + 1;
        const revisionHash = hashCanonicalJson({
          title: context.revision.title,
          problem: context.revision.problem,
          role: context.revision.role,
          goal: context.revision.goal,
          value: context.revision.value,
          cognitiveMode: context.revision.cognitiveMode,
          citations: context.revision.citations.map((citation) => ({
            inboxRevisionId: citation.inboxRevisionId,
            locator: citation.locator,
          })),
          scenarios: scenarios.map(({ reference: scenarioReference, draft }) => ({
            reference: scenarioReference,
            title: draft.title,
            given: jsonStrings(draft.givenSteps, draft.id, 'Given'),
            when: draft.whenStep,
            then: jsonStrings(draft.thenSteps, draft.id, 'Then'),
            businessData: jsonStrings(draft.businessData, draft.id, 'businessData'),
          })),
        });
        await store.storyRevision.create({
          data: {
            id: createdRevisionId,
            storyId: context.story.id,
            revisionNumber,
            title: context.revision.title,
            problem: context.revision.problem,
            role: context.revision.role,
            goal: context.revision.goal,
            value: context.revision.value,
            cognitiveMode: context.revision.cognitiveMode,
            contentSha256: revisionHash,
            createdByUserId: decidedByUserId,
            createdAt: timestamp,
            understandingDecisionId: decisionId,
          },
        });
        await store.storyRevisionCitation.createMany({
          data: context.revision.citations.map((citation) => ({
            id: randomUUID(),
            storyRevisionId: createdRevisionId!,
            inboxRevisionId: citation.inboxRevisionId,
            position: citation.position,
            locator: citation.locator,
          })),
        });
        await store.storyScenario.createMany({
          data: scenarios.map(({ id, reference: scenarioReference, draft }, position) => ({
            id,
            reference: scenarioReference,
            storyRevisionId: createdRevisionId!,
            sourceDraftId: draft.id,
            understandingDecisionId: decisionId,
            position,
            title: draft.title,
            givenSteps: inputJson(draft.givenSteps),
            whenStep: draft.whenStep,
            thenSteps: inputJson(draft.thenSteps),
            businessData: inputJson(draft.businessData),
            confirmedAt: timestamp,
          })),
        });
        const storyClaim = await store.story.updateMany({
          where: {
            id: context.story.id,
            workspaceId: this.workspaceId,
            latestRevisionId: context.revision.id,
            version: context.story.version,
          },
          data: {
            latestRevisionId: createdRevisionId,
            version: { increment: 1 },
            updatedAt: timestamp,
          },
        });
        if (storyClaim.count !== 1) changed(iterationId);
        await store.iteration.update({
          where: { id: iterationId },
          data: { stage: 'modeling', updatedAt: timestamp },
        });
      }
      const [iteration, decision, revision] = await Promise.all([
        requireIteration(store, this.workspaceId, iterationId),
        store.understandingDecision.findUnique({ where: { id: decisionId } }),
        createdRevisionId
          ? store.storyRevision.findUnique({
              where: { id: createdRevisionId },
              include: STORY_REVISION_INCLUDE,
            })
          : Promise.resolve(null),
      ]);
      if (!decision) throw DomainError.internal(`Understanding Decision ${decisionId} was not found`);
      return {
        iteration: assembleIteration(iteration),
        decision: assembleDecision(decision),
        storyRevision: revision ? assembleStoryRevision(revision) : null,
      };
    });
  }

  private async transaction<T>(operation: (store: PrismaStore) => Promise<T>): Promise<T> {
    if ('$transaction' in this.store) {
      return this.store.$transaction((transaction) => operation(transaction));
    }
    return operation(this.store);
  }
}

async function findContext(store: PrismaStore, workspaceId: string, iterationId: string) {
  const iteration = await store.iteration.findFirst({
    where: { id: iterationId, workspaceId },
    include: ITERATION_INCLUDE,
  });
  if (!iteration?.story) return null;
  const story = await store.story.findFirst({
    where: { id: iteration.story.id, workspaceId },
    include: STORY_INCLUDE,
  });
  if (!story?.latestRevisionId) return null;
  const revision = await store.storyRevision.findUnique({
    where: { id: story.latestRevisionId },
    include: STORY_REVISION_INCLUDE,
  });
  return story && revision ? { iteration, story, revision } : null;
}

async function requireContext(store: PrismaStore, workspaceId: string, iterationId: string) {
  const context = await findContext(store, workspaceId, iterationId);
  if (!context) throw DomainError.notFound(`Understanding ${iterationId} not found`);
  return context;
}

function requireTqaContext(
  context: NonNullable<Awaited<ReturnType<typeof findContext>>>,
  storyId: string,
  storyRevisionId: string,
) {
  if (
    context.iteration.lifecycle !== 'active' ||
    context.iteration.loop !== 'understand' ||
    context.iteration.stage !== 'tqa'
  ) {
    throw DomainError.conflict(`Iteration ${context.iteration.id} is not in Understand/TQA`);
  }
  if (context.story.id !== storyId || context.revision.id !== storyRevisionId) {
    throw DomainError.conflict('The active Story Revision has changed');
  }
}

async function claimIteration(
  store: PrismaStore,
  workspaceId: string,
  iterationId: string,
  expectedVersion: number,
  stages: string[],
  data: Prisma.IterationUpdateManyMutationInput = {},
  timestamp = now(),
) {
  const claimed = await store.iteration.updateMany({
    where: {
      id: iterationId,
      workspaceId,
      lifecycle: 'active',
      loop: 'understand',
      stage: { in: stages },
      version: expectedVersion,
    },
    data: { ...data, version: { increment: 1 }, updatedAt: timestamp },
  });
  if (claimed.count !== 1) changed(iterationId);
}

async function requireIteration(store: PrismaStore, workspaceId: string, iterationId: string) {
  const row = await store.iteration.findFirst({
    where: { id: iterationId, workspaceId },
    include: ITERATION_INCLUDE,
  });
  if (!row) throw DomainError.notFound(`Iteration ${iterationId} not found`);
  return row;
}

function assembleClarification(row: ClarificationRow): StoryClarification {
  return new StoryClarification(row.id, {
    reference: row.reference,
    iteration: new Ref(row.iterationId),
    story: new Ref(row.storyId),
    storyRevision: new Ref(row.storyRevisionId),
    sequence: row.sequence,
    target: row.target as 'business_context' | 'story' | 'history',
    question: row.question,
    status: row.status as 'pending' | 'answered' | 'waived',
    askedBy: 'requirements_analyst',
    askedAt: row.askedAt.toISOString(),
    answer: row.answer,
    answeredBy: row.answeredByUserId ? new Ref(row.answeredByUserId) : null,
    answeredAt: row.answeredAt?.toISOString() ?? null,
    waivedReason: row.waivedReason,
    waivedBy: row.waivedByUserId ? new Ref(row.waivedByUserId) : null,
    waivedAt: row.waivedAt?.toISOString() ?? null,
    contentSha256: row.contentSha256,
  });
}

function assembleProposal(row: ProposalRow): ScenarioSetProposal {
  return new ScenarioSetProposal(row.id, {
    reference: row.reference,
    iteration: new Ref(row.iterationId),
    story: new Ref(row.storyId),
    storyRevision: new Ref(row.storyRevisionId),
    sequence: row.sequence,
    drafts: row.drafts.map(assembleDraft),
    proposedBy: 'requirements_analyst',
    proposedAt: row.proposedAt.toISOString(),
    contentSha256: row.contentSha256,
  });
}

function assembleDraft(row: DraftRow): ScenarioDraft {
  return new ScenarioDraft(row.id, {
    reference: row.reference,
    proposal: new Ref(row.proposalId),
    position: row.position,
    title: row.title,
    given: jsonStrings(row.givenSteps, row.id, 'Given'),
    when: row.whenStep,
    then: jsonStrings(row.thenSteps, row.id, 'Then'),
    businessData: jsonStrings(row.businessData, row.id, 'businessData'),
    contentSha256: row.contentSha256,
  });
}

function assembleDecision(row: DecisionRow): UnderstandingDecision {
  return new UnderstandingDecision(row.id, {
    reference: row.reference,
    iteration: new Ref(row.iterationId),
    story: new Ref(row.storyId),
    storyRevision: new Ref(row.storyRevisionId),
    proposal: row.proposalId ? new Ref(row.proposalId) : null,
    proposalSha256: row.proposalSha256,
    action: row.action as 'confirm' | 'continue' | 'split' | 'defer',
    reason: row.reason,
    selectedDrafts: jsonStrings(row.selectedDraftIds, row.id, 'selectedDraftIds').map((id) => new Ref(id)),
    confirmedScenarios: jsonStrings(row.confirmedScenarioIds, row.id, 'confirmedScenarioIds').map((id) => new Ref(id)),
    decidedBy: new Ref(row.decidedByUserId),
    decidedAt: row.decidedAt.toISOString(),
    contentSha256: row.contentSha256,
  });
}

function jsonStrings(value: Prisma.JsonValue, id: string, field: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    throw DomainError.internal(`${id} has invalid ${field}`);
  }
  return value as string[];
}

function reference(prefix: string, sequence: number): string {
  return `${prefix}-${String(sequence).padStart(3, '0')}`;
}

function changed(iterationId: string): never {
  throw DomainError.conflict(`Iteration ${iterationId} has changed`);
}
