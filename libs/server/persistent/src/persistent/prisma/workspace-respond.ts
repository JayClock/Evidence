import { randomUUID } from 'node:crypto';
import {
  DomainError,
  normalizeDecideRespondInput,
  normalizeProposeRespondCandidateInput,
  type DecideRespondInput,
  type JsonValue,
  type ProposeRespondCandidateInput,
  type RespondActionResult,
  type RespondAuthority,
  type RespondNextAction,
  type RespondView,
  type WorkspaceRespond,
} from '@evidence/server-domain';
import { hashCanonicalJson } from '../workflow-content';
import {
  assembleRespondCandidate,
  assembleRespondDecision,
  type RespondCandidateRow,
  type RespondDecisionRow,
} from './respond-persistence';
import {
  assembleShowcaseDecision,
  assembleShowcaseRun,
  type ShowcaseDecisionRow,
  type ShowcaseRunRow,
} from './showcase-persistence';
import type { PrismaStore } from './types';
import {
  assembleStory,
  assembleStoryRevision,
  STORY_INCLUDE,
  STORY_REVISION_INCLUDE,
} from './workspace-delivery';
import { assembleIteration, iterationInclude } from './workspace-iterations';
import { inputJson, now } from './utils';

type RespondBase = Omit<RespondView, 'nextAction'>

export class PrismaWorkspaceRespond implements WorkspaceRespond {
  constructor(
    private readonly store: PrismaStore,
    private readonly workspaceId: string,
  ) {}

  async findRespond(iterationId: string): Promise<RespondView | null> {
    const authority = await findAcceptedShowcase(
      this.store,
      this.workspaceId,
      iterationId,
    );
    if (!authority) return null;
    return loadRespondView(
      this.store,
      this.workspaceId,
      iterationId,
      authority,
    );
  }

  async proposeCandidate(
    iterationId: string,
    rawInput: ProposeRespondCandidateInput,
  ): Promise<RespondActionResult> {
    const input = normalizeProposeRespondCandidateInput(rawInput);
    return this.transaction(async (store) => {
      const duplicate = await store.respondCandidate.findFirst({
        where: {
          workspaceId: this.workspaceId,
          iterationId,
          actionId: input.actionId,
        },
      });
      if (duplicate)
        return actionResult(store, this.workspaceId, iterationId, duplicate.id);

      const accepted = await requireAcceptedShowcase(
        store,
        this.workspaceId,
        iterationId,
      );
      const view = await loadRespondView(
        store,
        this.workspaceId,
        iterationId,
        accepted,
      );
      const next = requireNextAction(view, 'run_learner');
      if (
        next.actionId !== input.actionId ||
        next.authoritySha256 !== input.authoritySha256
      ) {
        throw DomainError.conflict('Respond proposal authority has changed');
      }
      const timestamp = now();
      const [workspaceCount, iterationCount] = await Promise.all([
        store.respondCandidate.count({
          where: { workspaceId: this.workspaceId },
        }),
        store.respondCandidate.count({ where: { iterationId } }),
      ]);
      const id = randomUUID();
      const content = {
        reference: `RESP-${String(workspaceCount + 1).padStart(4, '0')}`,
        sequence: iterationCount + 1,
        actionId: input.actionId,
        workspaceId: this.workspaceId,
        iterationId,
        storyId: accepted.run.storyId,
        storyRevisionId: accepted.run.storyRevisionId,
        showcaseRunId: accepted.run.id,
        showcaseDecisionId: accepted.decision.id,
        authority: view.authority,
        promotions: input.promotions,
        noPromotionReason: input.noPromotionReason,
        observedOutcomes: input.observedOutcomes,
        residualRisks: input.residualRisks,
        nextProbe: input.nextProbe,
        proposedAt: timestamp.toISOString(),
      };
      await store.respondCandidate.create({
        data: {
          id,
          ...content,
          authority: inputJson(view.authority),
          authoritySha256: view.authority.authoritySha256,
          promotions: inputJson(input.promotions),
          observedOutcomes: inputJson(input.observedOutcomes),
          residualRisks: inputJson(input.residualRisks),
          nextProbe: inputJson(input.nextProbe),
          proposedAt: timestamp,
          contentSha256: hashCanonicalJson(content as unknown as JsonValue),
        },
      });
      await updateIteration(
        store,
        this.workspaceId,
        iterationId,
        input.expectedIterationVersion,
        'drafting',
        'decision',
        timestamp,
      );
      return actionResult(store, this.workspaceId, iterationId, id);
    });
  }

  async decideRespond(
    iterationId: string,
    rawInput: DecideRespondInput,
    decidedByUserId: string,
  ): Promise<RespondActionResult> {
    const input = normalizeDecideRespondInput(rawInput);
    return this.transaction(async (store) => {
      const duplicate = await store.respondDecision.findFirst({
        where: { candidateId: input.candidateId },
      });
      if (duplicate) {
        if (
          duplicate.action !== input.action ||
          duplicate.candidateSha256 !== input.candidateSha256 ||
          duplicate.authoritySha256 !== input.authoritySha256
        ) {
          throw DomainError.conflict(
            'Respond Candidate already has a different decision',
          );
        }
        return actionResult(store, this.workspaceId, iterationId, duplicate.id);
      }
      const accepted = await requireAcceptedShowcase(
        store,
        this.workspaceId,
        iterationId,
      );
      const view = await loadRespondView(
        store,
        this.workspaceId,
        iterationId,
        accepted,
      );
      const next = requireNextAction(view, 'await_human');
      if (
        next.candidateId !== input.candidateId ||
        next.candidateSha256 !== input.candidateSha256 ||
        next.authoritySha256 !== input.authoritySha256
      ) {
        throw DomainError.conflict('Respond decision authority has changed');
      }
      const timestamp = now();
      const id = randomUUID();
      const content = {
        candidateId: input.candidateId,
        action: input.action,
        reason: input.reason,
        candidateSha256: input.candidateSha256,
        authoritySha256: input.authoritySha256,
        decidedByUserId,
        decidedAt: timestamp.toISOString(),
      };
      await store.respondDecision.create({
        data: {
          id,
          ...content,
          decidedAt: timestamp,
          contentSha256: hashCanonicalJson(content as unknown as JsonValue),
        },
      });
      await updateIteration(
        store,
        this.workspaceId,
        iterationId,
        input.expectedIterationVersion,
        'decision',
        input.action === 'approve' ? 'accepted' : 'drafting',
        timestamp,
      );
      return actionResult(store, this.workspaceId, iterationId, id);
    });
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

interface AcceptedShowcase {
  run: ShowcaseRunRow;
  decision: ShowcaseDecisionRow;
  reviewSha256: string;
}

async function findAcceptedShowcase(
  store: PrismaStore,
  workspaceId: string,
  iterationId: string,
): Promise<AcceptedShowcase | null> {
  const run = await store.showcaseRun.findFirst({
    where: { workspaceId, iterationId, stage: 'accepted' },
    orderBy: { attempt: 'desc' },
  });
  if (!run) return null;
  const [decision, review] = await Promise.all([
    store.showcaseDecision.findFirst({
      where: { showcaseRunId: run.id, action: 'accept' },
    }),
    store.showcaseReview.findFirst({ where: { showcaseRunId: run.id } }),
  ]);
  return decision && review
    ? { run, decision, reviewSha256: review.contentSha256 }
    : null;
}

async function requireAcceptedShowcase(
  store: PrismaStore,
  workspaceId: string,
  iterationId: string,
): Promise<AcceptedShowcase> {
  const accepted = await findAcceptedShowcase(store, workspaceId, iterationId);
  if (!accepted) {
    throw DomainError.conflict('Respond requires one human-accepted Showcase');
  }
  return accepted;
}

async function loadRespondView(
  store: PrismaStore,
  workspaceId: string,
  iterationId: string,
  accepted: AcceptedShowcase,
): Promise<RespondView> {
  const [iterationRow, storyRow, storyRevisionRow, candidateRows] =
    await Promise.all([
      store.iteration.findFirst({
        where: { id: iterationId, workspaceId },
        include: iterationInclude(),
      }),
      store.story.findFirst({
        where: { id: accepted.run.storyId, workspaceId },
        include: STORY_INCLUDE,
      }),
      store.storyRevision.findFirst({
        where: { id: accepted.run.storyRevisionId, story: { workspaceId } },
        include: STORY_REVISION_INCLUDE,
      }),
      store.respondCandidate.findMany({
        where: { workspaceId, iterationId },
        orderBy: { sequence: 'asc' },
      }),
    ]);
  if (!iterationRow || !storyRow || !storyRevisionRow) {
    throw DomainError.internal('Respond authority references are incomplete');
  }
  const decisionRows =
    candidateRows.length === 0
      ? []
      : await store.respondDecision.findMany({
          where: {
            candidateId: { in: candidateRows.map((candidate) => candidate.id) },
          },
          orderBy: { decidedAt: 'asc' },
        });
  const authority = respondAuthority(accepted);
  const base: RespondBase = {
    iteration: assembleIteration(iterationRow),
    story: assembleStory(storyRow),
    storyRevision: assembleStoryRevision(storyRevisionRow),
    showcaseRun: assembleShowcaseRun(accepted.run),
    showcaseDecision: assembleShowcaseDecision(accepted.decision),
    authority,
    candidates: (candidateRows as RespondCandidateRow[]).map(
      assembleRespondCandidate,
    ),
    decisions: (decisionRows as RespondDecisionRow[]).map(
      assembleRespondDecision,
    ),
  };
  return { ...base, nextAction: respondNextAction(base) };
}

function respondAuthority(accepted: AcceptedShowcase): RespondAuthority {
  const facts = {
    storyRevisionSha256: accepted.run.storyRevisionSha256,
    approvedTaskingPlanSha256: accepted.run.approvedTaskingPlanSha256,
    pairManifestSha256: accepted.run.pairManifestSha256,
    approvedCommitSha: accepted.run.approvedCommitSha,
    showcaseEvidenceBundleSha256: accepted.run.evidenceBundleSha256,
    showcaseReviewSha256: accepted.reviewSha256,
    showcaseDecisionSha256: accepted.decision.contentSha256,
  };
  if (!facts.showcaseEvidenceBundleSha256) {
    throw DomainError.internal('Accepted Showcase evidence bundle is missing');
  }
  return {
    ...facts,
    showcaseEvidenceBundleSha256: facts.showcaseEvidenceBundleSha256,
    authoritySha256: hashCanonicalJson(facts as unknown as JsonValue),
  };
}

function respondNextAction(base: RespondBase): RespondNextAction | null {
  const iteration = base.iteration.description();
  if (iteration.loop !== 'respond' || iteration.lifecycle !== 'active')
    return null;
  const common = {
    expectedIterationVersion: iteration.version,
    authoritySha256: base.authority.authoritySha256,
  };
  if (iteration.stage === 'drafting') {
    return {
      ...common,
      kind: 'run_learner',
      actionId: `respond:${base.iteration.identity()}:${String(iteration.version)}:${base.authority.authoritySha256}`,
      showcaseRunId: base.showcaseRun.identity(),
      showcaseDecisionId: base.showcaseDecision.identity(),
    };
  }
  if (iteration.stage === 'decision') {
    const decided = new Set(
      base.decisions.map((decision) => decision.description().candidate.id()),
    );
    const candidate = [...base.candidates]
      .reverse()
      .find((item) => !decided.has(item.identity()));
    if (!candidate)
      throw DomainError.internal('Respond decision Candidate is missing');
    return {
      ...common,
      kind: 'await_human',
      actionId: `respond-decision:${candidate.identity()}:${String(iteration.version)}`,
      candidateId: candidate.identity(),
      candidateSha256: candidate.description().contentSha256,
    };
  }
  return null;
}

function requireNextAction<K extends RespondNextAction['kind']>(
  view: RespondView,
  kind: K,
): Extract<RespondNextAction, { kind: K }> {
  if (view.nextAction?.kind !== kind) {
    throw DomainError.conflict(`Respond next action is not ${kind}`);
  }
  return view.nextAction as Extract<RespondNextAction, { kind: K }>;
}

async function updateIteration(
  store: PrismaStore,
  workspaceId: string,
  iterationId: string,
  expectedVersion: number,
  fromStage: 'drafting' | 'decision',
  toStage: 'drafting' | 'decision' | 'accepted',
  timestamp: Date,
): Promise<void> {
  const result = await store.iteration.updateMany({
    where: {
      id: iterationId,
      workspaceId,
      lifecycle: 'active',
      loop: 'respond',
      stage: fromStage,
      version: expectedVersion,
    },
    data: {
      stage: toStage,
      lane: 'review',
      version: { increment: 1 },
      updatedAt: timestamp,
    },
  });
  if (result.count !== 1) {
    throw DomainError.conflict('Respond Iteration authority has changed');
  }
}

async function actionResult(
  store: PrismaStore,
  workspaceId: string,
  iterationId: string,
  acceptedRecordId: string,
): Promise<RespondActionResult> {
  const accepted = await requireAcceptedShowcase(
    store,
    workspaceId,
    iterationId,
  );
  return {
    view: await loadRespondView(store, workspaceId, iterationId, accepted),
    acceptedRecordId,
  };
}
