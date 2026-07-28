import { describe, expect, it } from 'vitest';
import {
  PAIR_EXECUTION_POLICY,
  Ref,
  materializePairExecutionBudget,
  type TaskingCandidateDescription,
} from '@evidence/server-domain';
import { hashCanonicalJson } from '../workflow-content';
import {
  asStore,
  mockPrismaStore,
  timestamp,
  type MockFn,
} from './test-support';
import { PrismaWorkspaceShowcase } from './workspace-showcase';

const sha = (character: string) => `sha256:${character.repeat(64)}`;
const baseline = 'b'.repeat(40);
const commit = 'c'.repeat(40);

function planDescription(): TaskingCandidateDescription {
  return {
    planVersion: 2,
    reference: 'TASKING-001',
    iteration: new Ref('iteration-1'),
    story: new Ref('story-1'),
    storyRevision: new Ref('revision-1'),
    storyRevisionSha256: sha('1'),
    baseCommitSha: baseline,
    noModelImpactDecision: new Ref('no-model-1'),
    noModelImpactDecisionSha256: sha('2'),
    sequence: 1,
    projectCatalog: {
      projects: [
        {
          id: '@evidence/desktop',
          root: 'apps/desktop',
          targets: ['package-smoke'],
        },
      ],
    },
    projectCatalogSha256: sha('3'),
    tests: [
      {
        id: 'TEST-002',
        quadrant: 'Q2',
        intent: 'Observe the packaged product behavior.',
        runtimePlanId: 'RUNTIME-001',
        processId: 'typescript-electron-shell',
        stepId: 'electron-package-q2',
        projectId: null,
        testFilter: 'showcase',
        supportedBy: [],
        scenarioIds: ['scenario-1'],
        scenarioOutcome: 'The delivered behavior is visible.',
        businessData: ['workspace-1'],
        modelRefs: { entities: [], associations: [] },
      },
    ],
    tasks: [
      {
        id: 'TASK-001',
        description: 'Deliver one observable behavior.',
        testIds: ['TEST-002'],
        dependsOn: [],
        modelRefs: { entities: [], associations: [] },
      },
    ],
    processes: [
      {
        runtimePlanId: 'RUNTIME-001',
        processId: 'typescript-electron-shell',
        processVersion: 3,
        definitionSha256: sha('4'),
        functionalContexts: ['delivery'],
        technicalBoundaries: ['electron-main'],
        selectedStepIds: ['electron-package-q2'],
        projectIds: ['@evidence/desktop'],
        projectCatalogSha256: sha('3'),
        focusedCommands: [
          {
            testId: 'TEST-002',
            stepId: 'electron-package-q2',
            projectId: null,
            command: 'pnpm nx run @evidence/desktop:package-smoke',
          },
        ],
        qualityGates: [],
        materializedSha256: sha('5'),
      },
    ],
    executionBudget: materializePairExecutionBudget({
      testCount: 1,
      processStepCount: 1,
      qualityGateCount: 1,
      policySha256: hashCanonicalJson(PAIR_EXECUTION_POLICY as never),
    }),
    contentSha256: sha('6'),
    proposedBy: 'tasking-analyst',
    proposedAt: timestamp.toISOString(),
  };
}

function fixture() {
  const store = mockPrismaStore();
  const plan = planDescription();
  let iteration = {
    id: 'iteration-1',
    reference: 'ITER-0001',
    workspaceId: 'workspace-1',
    sourceCandidateId: 'candidate-1',
    sourceCandidateSha256: sha('7'),
    lifecycle: 'active',
    loop: 'showcase',
    stage: 'setup',
    lane: 'review',
    version: 20,
    baseCommitSha: baseline,
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
    title: 'Observe delivered value',
    givenSteps: ['a delivery lead has an approved increment'],
    whenStep: 'the lead opens the product surface',
    thenSteps: ['the delivered behavior is visible'],
    businessData: ['workspace-1'],
    confirmedAt: timestamp,
  };
  const revision = {
    id: 'revision-1',
    storyId: 'story-1',
    revisionNumber: 1,
    title: 'Observe delivered value',
    problem: 'Passing code does not prove product value.',
    role: 'Delivery lead',
    goal: 'Observe the approved increment.',
    value: 'Value acceptance remains human-owned.',
    cognitiveMode: 'complicated',
    contentSha256: sha('1'),
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
      loop: 'showcase',
      stage: 'setup',
    },
    latestRevision: {
      ...revision,
      _count: { scenarios: 1, citations: 0 },
    },
    _count: { revisions: 1 },
  };
  const approvedPlan = {
    id: 'plan-1',
    workspaceId: 'workspace-1',
    iterationId: 'iteration-1',
    storyId: 'story-1',
    storyRevisionId: 'revision-1',
    taskingCandidateId: 'candidate-tasking-1',
    deskCheckDecisionId: 'desk-check-1',
    payload: {
      planVersion: plan.planVersion,
      reference: plan.reference,
      storyRevisionSha256: plan.storyRevisionSha256,
      baseCommitSha: plan.baseCommitSha,
      noModelImpactDecisionId: plan.noModelImpactDecision.id(),
      noModelImpactDecisionSha256: plan.noModelImpactDecisionSha256,
      sequence: plan.sequence,
      projectCatalogSha256: plan.projectCatalogSha256,
      projectCatalog: plan.projectCatalog,
      tests: plan.tests,
      tasks: plan.tasks,
      processes: plan.processes,
      executionBudget: plan.executionBudget,
      candidateContentSha256: plan.contentSha256,
      proposedAt: plan.proposedAt,
    },
    contentSha256: sha('8'),
    approvedByUserId: 'user-1',
    approvedAt: timestamp,
  };
  const pairRun = {
    id: 'pair-1',
    reference: 'PAIR-0001',
    workspaceId: 'workspace-1',
    iterationId: 'iteration-1',
    storyId: 'story-1',
    storyRevisionId: 'revision-1',
    storyRevisionSha256: sha('1'),
    approvedTaskingPlanId: 'plan-1',
    approvedTaskingPlanSha256: sha('8'),
    baseCommitSha: baseline,
    branchName: 'evidence/iter-iteration-1',
    status: 'approved',
    checkpoint: 'approved',
    version: 12,
    cursor: {
      unitIndex: 1,
      pendingRefactorStepKey: null,
      refactorVerificationIndex: 0,
      qualityGateIndex: 0,
      repairMode: null,
      repairDiagnosticObservationId: null,
      repairDecisionId: null,
      repairInstruction: null,
    },
    completedTestIds: ['TEST-002'],
    completedStepKeys: ['RUNTIME-001:electron-package-q2'],
    executionBudget: plan.executionBudget,
    budgetUsage: {
      agentCalls: 3,
      checkpoints: 4,
      repeatedFingerprintCount: 0,
      noProgressCheckpoints: 0,
    },
    leaseOwnerId: null,
    leaseTokenSha256: null,
    leaseExpiresAt: null,
    currentDiffSha256: sha('9'),
    finalManifestSha256: sha('a'),
    approvedCommitSha: commit,
    startedAt: timestamp,
    updatedAt: timestamp,
    completedAt: timestamp,
  };
  const pairManifest = {
    id: 'manifest-1',
    pairRunId: 'pair-1',
    approvedTaskingPlanSha256: sha('8'),
    storyRevisionSha256: sha('1'),
    baseCommitSha: baseline,
    completedTestIds: ['TEST-002'],
    completedStepKeys: ['RUNTIME-001:electron-package-q2'],
    driverAttemptIds: ['driver-1'],
    commandObservationIds: ['command-1'],
    redReviewIds: ['red-review-1'],
    changedPaths: ['apps/desktop/src/showcase.ts'],
    finalDiffSha256: sha('9'),
    evidenceChainSha256: sha('b'),
    generatedAt: timestamp,
    contentSha256: sha('a'),
  };
  const runs: Array<Record<string, unknown>> = [
    {
      id: 'showcase-1',
      reference: 'SHOW-0001',
      attempt: 1,
      workspaceId: 'workspace-1',
      iterationId: 'iteration-1',
      storyId: 'story-1',
      storyRevisionId: 'revision-1',
      storyRevisionSha256: sha('1'),
      approvedTaskingPlanId: 'plan-1',
      approvedTaskingPlanSha256: sha('8'),
      pairRunId: 'pair-1',
      pairManifestId: 'manifest-1',
      pairManifestSha256: sha('a'),
      approvedCommitSha: commit,
      stage: 'setup',
      version: 1,
      evidenceBundleSha256: null,
      startedAt: timestamp,
      updatedAt: timestamp,
      completedAt: null,
    },
  ];
  const q2: Array<Record<string, unknown>> = [];
  const products: Array<Record<string, unknown>> = [];
  const risks: Array<Record<string, unknown>> = [];
  const evaluations: Array<Record<string, unknown>> = [];
  const reviews: Array<Record<string, unknown>> = [];
  const decisions: Array<Record<string, unknown>> = [];

  store.iteration.findFirst.mockImplementation(async () => iteration);
  store.iteration.updateMany.mockImplementation(async ({ data }) => {
    iteration = applyData(iteration, data) as typeof iteration;
    return { count: 1 };
  });
  store.story.findFirst.mockResolvedValue(story);
  store.storyRevision.findUnique.mockResolvedValue(revision);
  store.approvedTaskingPlan.findFirst.mockResolvedValue(approvedPlan);
  store.pairRun.findFirst.mockResolvedValue(pairRun);
  store.pairExecutionManifest.findFirst.mockResolvedValue(pairManifest);

  store.showcaseRun.findFirst.mockImplementation(async ({ where } = {}) => {
    const matches = runs.filter((row) => matchesWhere(row, where));
    return matches.at(-1) ?? null;
  });
  store.showcaseRun.count.mockImplementation(
    async ({ where } = {}) =>
      runs.filter((row) => matchesWhere(row, where)).length,
  );
  store.showcaseRun.create.mockImplementation(async ({ data }) => {
    const row = { ...data };
    runs.push(row);
    return row;
  });
  store.showcaseRun.updateMany.mockImplementation(async ({ where, data }) => {
    const row = runs.find((candidate) => matchesWhere(candidate, where));
    if (!row) return { count: 0 };
    Object.assign(row, applyData(row, data));
    return { count: 1 };
  });
  configure(store.showcaseQ2Observation, q2, 'findFirst');
  configure(store.showcaseProductObservation, products);
  configure(store.showcaseRiskDecision, risks);
  configure(store.showcaseEvaluation, evaluations);
  configure(store.showcaseReview, reviews, 'findUnique');
  configure(store.showcaseDecision, decisions, 'findUnique');

  return {
    store,
    iteration: () => iteration,
    currentRun: () => runs.at(-1),
  };
}

function configure(
  delegate: Record<string, MockFn>,
  rows: Array<Record<string, unknown>>,
  singleMethod?: 'findFirst' | 'findUnique',
) {
  delegate.findMany?.mockImplementation(async ({ where } = {}) =>
    rows.filter((row) => matchesWhere(row, where)),
  );
  if (singleMethod) {
    delegate[singleMethod].mockImplementation(async ({ where } = {}) =>
      rows.find((row) => matchesWhere(row, where)),
    );
  }
  delegate.create.mockImplementation(async ({ data }) => {
    const row = { ...data };
    rows.push(row);
    return row;
  });
}

function matchesWhere(
  row: Record<string, unknown>,
  where: Record<string, unknown> | undefined,
): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, value]) => {
    if (value && typeof value === 'object' && 'in' in value) {
      const values = (value as { in: unknown[] }).in;
      return values.includes(row[key]);
    }
    return row[key] === value;
  });
}

function applyData(
  row: Record<string, unknown>,
  data: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries({ ...row, ...data }).map(([key, value]) => [
      key,
      value && typeof value === 'object' && 'increment' in value
        ? Number(row[key] ?? 0) +
          Number((value as { increment: number }).increment)
        : value,
    ]),
  );
}

describe('PrismaWorkspaceShowcase', () => {
  it('requires Q2, human product evidence, risks and independent review before acceptance', async () => {
    const context = fixture();
    const showcase = new PrismaWorkspaceShowcase(
      asStore(context.store),
      'workspace-1',
    );

    let view = await showcase.findShowcase('iteration-1');
    expect(view?.nextAction).toMatchObject({
      kind: 'execute_q2',
      command: 'pnpm nx run @evidence/desktop:package-smoke',
      approvedCommitSha: commit,
    });
    if (!view || view.nextAction?.kind !== 'execute_q2') {
      throw new Error('Expected Q2 action.');
    }

    view = (
      await showcase.recordQ2Observation('iteration-1', {
        showcaseRunId: view.run.identity(),
        actionId: view.nextAction.actionId,
        expectedShowcaseVersion: view.run.description().version,
        command: view.nextAction.command,
        termination: 'exited',
        exitCode: 0,
        durationMs: 100,
        stdoutSha256: sha('0'),
        stdoutBytes: 10,
        stdoutLines: 1,
        stderrSha256: sha('0'),
        stderrBytes: 0,
        stderrLines: 0,
        approvedCommitSha: commit,
        worktreeSha256: sha('c'),
      })
    ).view;
    expect(view.nextAction).toMatchObject({
      kind: 'observe_scenario',
      scenarioReference: 'SC-001',
    });

    view = (
      await showcase.recordProductObservation(
        'iteration-1',
        {
          expectedShowcaseVersion: view.run.description().version,
          scenarioId: 'scenario-1',
          observedOutcomes: ['The delivered behavior was visible.'],
          observation: 'The product exposed the approved behavior.',
          valueFeedback: 'The delivery lead can validate value directly.',
          evidenceRefs: ['evidence:product-observation-1'],
        },
        'user-1',
      )
    ).view;
    expect(view.nextAction).toMatchObject({
      kind: 'decide_risk',
      quadrant: 'Q3',
    });

    view = (
      await showcase.recordRiskDecision(
        'iteration-1',
        {
          expectedShowcaseVersion: view.run.description().version,
          quadrant: 'Q3',
          disposition: 'not_required',
          activities: [],
          reason: 'The bounded workflow has no additional Q3 exposure.',
        },
        'user-1',
      )
    ).view;
    view = (
      await showcase.recordRiskDecision(
        'iteration-1',
        {
          expectedShowcaseVersion: view.run.description().version,
          quadrant: 'Q4',
          disposition: 'required',
          activities: ['security'],
          reason: 'The Desktop trust boundary requires evaluation.',
        },
        'user-1',
      )
    ).view;
    expect(view.nextAction).toMatchObject({
      kind: 'evaluate_risk',
      quadrant: 'Q4',
      activity: 'security',
    });

    view = (
      await showcase.recordEvaluation(
        'iteration-1',
        {
          expectedShowcaseVersion: view.run.description().version,
          quadrant: 'Q4',
          activity: 'security',
          outcome: 'passed',
          finding: 'The renderer remains behind the restricted preload.',
          evidenceRefs: ['evidence:security-check-1'],
        },
        'user-1',
      )
    ).view;
    expect(view.run.description()).toMatchObject({
      stage: 'reviewing',
      evidenceBundleSha256: expect.stringMatching(/^sha256:/),
    });
    expect(view.nextAction).toMatchObject({ kind: 'run_reviewer' });

    const evidenceBundleSha256 = view.run.description().evidenceBundleSha256;
    if (!evidenceBundleSha256) throw new Error('Evidence bundle is missing.');
    view = (
      await showcase.recordReview('iteration-1', {
        expectedShowcaseVersion: view.run.description().version,
        evidenceBundleSha256,
        observedFacts: [
          'Q2 and the observed Scenario matched the approved plan.',
        ],
        productDomainFeedback: ['The intended value is directly observable.'],
        technicalQualityFeedback: ['The local trust boundary remains intact.'],
        unresolvedAssumptions: [],
        recommendation: 'accept',
      })
    ).view;
    expect(view.nextAction).toMatchObject({ kind: 'await_human' });
    const reviewSha256 = view.review?.description().contentSha256;
    if (!reviewSha256) throw new Error('Review is missing.');

    view = (
      await showcase.decideShowcase(
        'iteration-1',
        {
          expectedShowcaseVersion: view.run.description().version,
          action: 'accept',
          reason: 'The observed behavior delivers the intended value.',
          evidenceBundleSha256,
          reviewSha256,
        },
        'user-1',
      )
    ).view;

    expect(view.run.description().stage).toBe('accepted');
    expect(context.iteration()).toMatchObject({
      loop: 'respond',
      stage: 'drafting',
      lifecycle: 'active',
    });
  });

  it('blocks acceptance after failed Q2 and starts a new attempt for showcase feedback', async () => {
    const context = fixture();
    const showcase = new PrismaWorkspaceShowcase(
      asStore(context.store),
      'workspace-1',
    );
    let view = await showcase.findShowcase('iteration-1');
    if (!view || view.nextAction?.kind !== 'execute_q2') {
      throw new Error('Expected Q2 action.');
    }
    view = (
      await showcase.recordQ2Observation('iteration-1', {
        showcaseRunId: view.run.identity(),
        actionId: view.nextAction.actionId,
        expectedShowcaseVersion: view.run.description().version,
        command: view.nextAction.command,
        termination: 'exited',
        exitCode: 1,
        durationMs: 100,
        stdoutSha256: sha('0'),
        stdoutBytes: 0,
        stdoutLines: 0,
        stderrSha256: sha('d'),
        stderrBytes: 20,
        stderrLines: 1,
        approvedCommitSha: commit,
        worktreeSha256: sha('c'),
      })
    ).view;
    expect(view.nextAction).toMatchObject({ kind: 'resolve_failure' });
    await expect(
      showcase.decideShowcase(
        'iteration-1',
        {
          expectedShowcaseVersion: view.run.description().version,
          action: 'accept',
          reason: 'Cannot accept failed Q2.',
        },
        'user-1',
      ),
    ).rejects.toMatchObject({ kind: 'conflict' });

    view = (
      await showcase.decideShowcase(
        'iteration-1',
        {
          expectedShowcaseVersion: view.run.description().version,
          action: 'revise',
          reason: 'The Showcase setup needs a corrected local environment.',
          feedbackTarget: 'showcase_setup',
        },
        'user-1',
      )
    ).view;
    expect(view.run.description()).toMatchObject({
      attempt: 2,
      stage: 'setup',
      version: 1,
    });
    expect(context.currentRun()?.attempt).toBe(2);
  });
});
