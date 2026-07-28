import { describe, expect, it } from 'vitest';
import { asStore, mockPrismaStore, timestamp } from './test-support';
import { PrismaWorkspaceRespond } from './workspace-respond';

const sha = (character: string) => `sha256:${character.repeat(64)}`;

describe('PrismaWorkspaceRespond', () => {
  it('publishes one learner action only after human Showcase acceptance', async () => {
    const { respond } = fixture();

    const view = await respond.findRespond('iteration-1');

    expect(view?.nextAction).toEqual(
      expect.objectContaining({
        kind: 'run_learner',
        expectedIterationVersion: 30,
        authoritySha256: expect.stringMatching(/^sha256:/u),
        showcaseRunId: 'showcase-1',
        showcaseDecisionId: 'showcase-decision-1',
      }),
    );
    expect(view?.authority).toEqual(
      expect.objectContaining({
        approvedCommitSha: 'c'.repeat(40),
        showcaseEvidenceBundleSha256: sha('e'),
        showcaseDecisionSha256: sha('d'),
      }),
    );
  });

  it('appends a bounded Candidate and waits for an exact human decision', async () => {
    const { respond, candidates, iteration } = fixture();
    const initial = await respond.findRespond('iteration-1');
    const action = initial?.nextAction;
    if (action?.kind !== 'run_learner')
      throw new Error('missing learner action');

    const result = await respond.proposeCandidate('iteration-1', {
      actionId: action.actionId,
      expectedIterationVersion: action.expectedIterationVersion,
      authoritySha256: action.authoritySha256,
      promotions: [],
      noPromotionReason: '本轮没有可复用知识需要提升。',
      observedOutcomes: ['领域专家确认 Story 价值。'],
      residualRisks: ['发布仍由人类显式触发。'],
      nextProbe: {
        question: '下一轮应验证哪一个发布风险？',
        whyNow: '当前 Story 留下一个非阻塞风险。',
        evidenceRefs: ['showcase:risk-Q4'],
        firstAction: '由人决定是否收集进 Inbox。',
      },
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).not.toHaveProperty('source');
    expect(iteration.stage).toBe('decision');
    expect(result.view.nextAction).toEqual(
      expect.objectContaining({
        kind: 'await_human',
        candidateId: candidates[0]?.id,
        candidateSha256: candidates[0]?.contentSha256,
      }),
    );
  });

  it('completes only after approval of the unchanged Candidate and authority', async () => {
    const context = fixture();
    const candidateView = await propose(context);
    const action = candidateView.nextAction;
    if (action?.kind !== 'await_human') throw new Error('missing human action');

    const result = await context.respond.decideRespond(
      'iteration-1',
      {
        expectedIterationVersion: action.expectedIterationVersion,
        candidateId: action.candidateId,
        candidateSha256: action.candidateSha256,
        authoritySha256: action.authoritySha256,
        action: 'approve',
        reason: '已审查知识处置、残余风险与 next Probe。',
      },
      'user-1',
    );

    expect(context.iteration).toEqual(
      expect.objectContaining({
        loop: 'respond',
        stage: 'accepted',
        version: 32,
      }),
    );
    expect(context.decisions).toHaveLength(1);
    expect(result.view.nextAction).toBeNull();
  });

  it('preserves the old Candidate when a human requests revision', async () => {
    const context = fixture();
    const candidateView = await propose(context);
    const action = candidateView.nextAction;
    if (action?.kind !== 'await_human') throw new Error('missing human action');

    const result = await context.respond.decideRespond(
      'iteration-1',
      {
        expectedIterationVersion: action.expectedIterationVersion,
        candidateId: action.candidateId,
        candidateSha256: action.candidateSha256,
        authoritySha256: action.authoritySha256,
        action: 'revise',
        reason: '下一轮 Probe 仍不够具体。',
      },
      'user-1',
    );

    expect(context.candidates).toHaveLength(1);
    expect(context.decisions).toHaveLength(1);
    expect(result.view.nextAction?.kind).toBe('run_learner');
  });
});

async function propose(context: ReturnType<typeof fixture>) {
  const initial = await context.respond.findRespond('iteration-1');
  const action = initial?.nextAction;
  if (action?.kind !== 'run_learner') throw new Error('missing learner action');
  return (
    await context.respond.proposeCandidate('iteration-1', {
      actionId: action.actionId,
      expectedIterationVersion: action.expectedIterationVersion,
      authoritySha256: action.authoritySha256,
      promotions: [],
      noPromotionReason: '本轮没有可复用知识需要提升。',
      observedOutcomes: ['领域专家确认 Story 价值。'],
      residualRisks: [],
      nextProbe: {
        question: '下一轮应学习哪一个领域风险？',
        whyNow: '本轮已形成明确边界。',
        evidenceRefs: ['showcase:decision-1'],
        firstAction: '由人决定是否收集进 Inbox。',
      },
    })
  ).view;
}

interface CandidateRow {
  id: string;
  actionId: string;
  contentSha256: string;
  [key: string]: unknown;
}

interface DecisionRow {
  id: string;
  candidateId: string;
  action: string;
  candidateSha256: string;
  authoritySha256: string;
  [key: string]: unknown;
}

function fixture() {
  const store = mockPrismaStore();
  const candidates: CandidateRow[] = [];
  const decisions: DecisionRow[] = [];
  const iteration = {
    id: 'iteration-1',
    reference: 'ITER-0001',
    workspaceId: 'workspace-1',
    sourceCandidateId: 'source-candidate-1',
    sourceCandidateSha256: sha('i'),
    lifecycle: 'active',
    loop: 'respond',
    stage: 'drafting',
    lane: 'review',
    version: 30,
    baseCommitSha: 'b'.repeat(40),
    branchName: 'evidence/iter-iteration-1',
    provisioningFailureSummary: null,
    admittedByUserId: 'user-1',
    admittedAt: timestamp,
    updatedAt: timestamp,
    story: { id: 'story-1' },
  };
  const scenario = {
    id: 'scenario-1',
    reference: 'SC-001',
    storyRevisionId: 'revision-1',
    sourceDraftId: 'draft-1',
    understandingDecisionId: 'understanding-1',
    position: 1,
    title: 'Observe accepted value',
    givenSteps: ['Showcase is accepted'],
    whenStep: 'Respond captures learning',
    thenSteps: ['one next Probe remains human-controlled'],
    businessData: ['workspace-1'],
    confirmedAt: timestamp,
  };
  const revision = {
    id: 'revision-1',
    storyId: 'story-1',
    revisionNumber: 1,
    title: 'Respond to accepted value',
    problem: 'Learning can be promoted without evidence.',
    role: 'Domain expert',
    goal: 'Review one bounded knowledge response.',
    value: 'Only validated learning becomes authoritative.',
    cognitiveMode: 'complicated',
    contentSha256: sha('s'),
    createdByUserId: 'user-1',
    createdAt: timestamp,
    understandingDecisionId: 'understanding-1',
    citations: [],
    scenarios: [scenario],
  };
  const story = {
    id: 'story-1',
    workspaceId: 'workspace-1',
    iterationId: 'iteration-1',
    reference: 'US-001',
    latestRevisionId: 'revision-1',
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    iteration: {
      id: 'iteration-1',
      reference: 'ITER-0001',
      lifecycle: 'active',
      loop: 'respond',
      stage: 'drafting',
    },
    latestRevision: { ...revision, _count: { scenarios: 1, citations: 0 } },
    _count: { revisions: 1 },
  };
  const showcaseRun = {
    id: 'showcase-1',
    reference: 'SHOW-0001',
    attempt: 1,
    workspaceId: 'workspace-1',
    iterationId: 'iteration-1',
    storyId: 'story-1',
    storyRevisionId: 'revision-1',
    storyRevisionSha256: sha('s'),
    approvedTaskingPlanId: 'plan-1',
    approvedTaskingPlanSha256: sha('p'),
    pairRunId: 'pair-1',
    pairManifestId: 'manifest-1',
    pairManifestSha256: sha('m'),
    approvedCommitSha: 'c'.repeat(40),
    stage: 'accepted',
    version: 10,
    evidenceBundleSha256: sha('e'),
    startedAt: timestamp,
    updatedAt: timestamp,
    completedAt: timestamp,
  };
  const showcaseDecision = {
    id: 'showcase-decision-1',
    showcaseRunId: 'showcase-1',
    action: 'accept',
    reason: 'Observed value is accepted.',
    feedbackTarget: null,
    evidenceBundleSha256: sha('e'),
    reviewId: 'showcase-review-1',
    decidedByUserId: 'user-1',
    decidedAt: timestamp,
    contentSha256: sha('d'),
  };
  const showcaseReview = {
    id: 'showcase-review-1',
    showcaseRunId: 'showcase-1',
    contentSha256: sha('r'),
  };

  store.showcaseRun.findFirst.mockResolvedValue(showcaseRun);
  store.showcaseDecision.findFirst.mockResolvedValue(showcaseDecision);
  store.showcaseReview.findFirst.mockResolvedValue(showcaseReview);
  store.iteration.findFirst.mockImplementation(async () => iteration);
  store.story.findFirst.mockImplementation(async () => story);
  store.storyRevision.findFirst.mockResolvedValue(revision);
  store.respondCandidate.findMany.mockImplementation(async () => candidates);
  store.respondDecision.findMany.mockImplementation(async () => decisions);
  store.respondCandidate.findFirst.mockImplementation(
    async ({ where }: { where: { actionId?: string } }) =>
      candidates.find((candidate) => candidate.actionId === where.actionId) ??
      null,
  );
  store.respondDecision.findFirst.mockImplementation(
    async ({ where }: { where: { candidateId: string } }) =>
      decisions.find(
        (decision) => decision.candidateId === where.candidateId,
      ) ?? null,
  );
  store.respondCandidate.count.mockImplementation(
    async ({ where }: { where: { iterationId?: string } }) =>
      where.iterationId ? candidates.length : candidates.length,
  );
  store.respondCandidate.create.mockImplementation(
    async ({ data }: { data: CandidateRow }) => {
      candidates.push(data);
      return data;
    },
  );
  store.respondDecision.create.mockImplementation(
    async ({ data }: { data: DecisionRow }) => {
      decisions.push(data);
      return data;
    },
  );
  store.iteration.updateMany.mockImplementation(
    async ({
      where,
      data,
    }: {
      where: { version: number; stage: string };
      data: { stage: string; updatedAt: Date };
    }) => {
      if (
        iteration.version !== where.version ||
        iteration.stage !== where.stage
      ) {
        return { count: 0 };
      }
      iteration.stage = data.stage;
      iteration.version += 1;
      iteration.updatedAt = data.updatedAt;
      story.iteration.stage = data.stage;
      return { count: 1 };
    },
  );
  store.$transaction.mockImplementation(
    async (
      operation: (transaction: ReturnType<typeof asStore>) => Promise<unknown>,
    ) => operation(asStore(store)),
  );

  return {
    respond: new PrismaWorkspaceRespond(asStore(store), 'workspace-1'),
    candidates,
    decisions,
    iteration,
  };
}
