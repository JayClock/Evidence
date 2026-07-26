import { describe, expect, it } from 'vitest';
import {
  TASKING_PROCESS_CATALOG,
  type ProposeTaskingInput,
} from '@evidence/server-domain';
import { hashCanonicalJson } from '../workflow-content';
import {
  asStore,
  mockPrismaStore,
  timestamp,
  type MockPrismaStore,
} from './test-support';
import { PrismaWorkspaceTasking } from './workspace-tasking';

const storyRevisionSha256 = `sha256:${'a'.repeat(64)}`;
const noModelImpactSha256 = `sha256:${'b'.repeat(64)}`;

function iterationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'iteration-1',
    reference: 'ITER-0001',
    workspaceId: 'workspace-1',
    sourceCandidateId: 'candidate-source-1',
    sourceCandidateSha256: `sha256:${'c'.repeat(64)}`,
    lifecycle: 'active',
    loop: 'tasking',
    stage: 'drafting',
    lane: 'discovery',
    version: 4,
    baseCommitSha: 'd'.repeat(40),
    branchName: 'evidence/iter-iteration-1',
    provisioningFailureSummary: null,
    admittedByUserId: 'user-1',
    admittedAt: timestamp,
    updatedAt: timestamp,
    story: { id: 'story-1' },
    ...overrides,
  };
}

function scenarioRow() {
  return {
    id: 'scenario-1',
    reference: 'SC-001',
    storyRevisionId: 'revision-2',
    sourceDraftId: 'draft-1',
    understandingDecisionId: 'understanding-1',
    position: 0,
    title: 'Run the local Tasking Analyst',
    givenSteps: ['A confirmed Story Scenario Set exists'],
    whenStep: 'The user runs Tasking in Desktop',
    thenSteps: ['A complete Candidate awaits Desk Check'],
    businessData: ['Story Revision v2', 'TEST-001'],
    confirmedAt: timestamp,
  };
}

function revisionRow() {
  return {
    id: 'revision-2',
    storyId: 'story-1',
    revisionNumber: 2,
    title: 'Plan one approved change',
    problem: 'Delivery lacks a reviewable Tasking plan.',
    role: 'Delivery lead',
    goal: 'Review one complete plan.',
    value: 'Coding starts from explicit authority.',
    cognitiveMode: 'complicated',
    contentSha256: storyRevisionSha256,
    createdByUserId: 'user-1',
    createdAt: timestamp,
    understandingDecisionId: 'understanding-1',
    citations: [],
    scenarios: [scenarioRow()],
  };
}

function storyRow() {
  return {
    id: 'story-1',
    workspaceId: 'workspace-1',
    iterationId: 'iteration-1',
    reference: 'US-001',
    latestRevisionId: 'revision-2',
    version: 2,
    createdAt: timestamp,
    updatedAt: timestamp,
    latestRevision: { ...revisionRow(), _count: { scenarios: 1 } },
    _count: { revisions: 2 },
  };
}

function noModelImpactRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'no-model-1',
    reference: 'NMI-001',
    workspaceId: 'workspace-1',
    iterationId: 'iteration-1',
    storyId: 'story-1',
    storyRevisionId: 'revision-2',
    storyRevisionSha256,
    reason: 'This Story changes only local workflow glue.',
    decidedByUserId: 'user-1',
    decidedAt: timestamp,
    contentSha256: noModelImpactSha256,
    ...overrides,
  };
}

function proposal(): ProposeTaskingInput {
  return {
    expectedIterationVersion: 4,
    storyId: 'story-1',
    storyRevisionId: 'revision-2',
    noModelImpactDecisionId: 'no-model-1',
    noModelImpactDecisionSha256: noModelImpactSha256,
    projectCatalog: {
      projects: [
        {
          id: '@evidence/desktop',
          root: 'apps/desktop',
          targets: ['lint', 'test', 'typecheck', 'package-smoke'],
        },
      ],
    },
    runtimes: [
      {
        id: 'RUNTIME-001',
        runtime: 'typescript',
        functionalContexts: ['delivery'],
        technicalBoundaries: ['electron-main', 'electron-preload'],
        projectIds: ['@evidence/desktop'],
      },
    ],
    tests: [
      {
        id: 'TEST-001',
        quadrant: 'Q1',
        intent: 'The Desktop boundary preserves local authority.',
        runtimePlanId: 'RUNTIME-001',
        stepId: 'electron-shell-q1',
        testFilter: 'tasking-shell',
        supportedBy: [],
        scenarioIds: ['SC-001'],
        businessData: ['Story Revision v2'],
        modelRefs: { entities: [], associations: [] },
      },
      {
        id: 'TEST-002',
        quadrant: 'Q2',
        intent: 'The confirmed Scenario reaches Desk Check.',
        runtimePlanId: 'RUNTIME-001',
        stepId: 'electron-package-q2',
        testFilter: 'tasking-package',
        supportedBy: ['TEST-001'],
        scenarioIds: ['SC-001'],
        scenarioOutcome: 'A complete Candidate awaits Desk Check',
        businessData: ['TEST-001'],
        modelRefs: { entities: [], associations: [] },
      },
    ],
    tasks: [
      {
        id: 'TASK-001',
        description: 'Drive the local Tasking boundary and package outcome.',
        testIds: ['TEST-001', 'TEST-002'],
        dependsOn: [],
      },
    ],
  };
}

function contextStore(): MockPrismaStore {
  const store = mockPrismaStore();
  store.iteration.findFirst.mockResolvedValue(iterationRow());
  store.story.findFirst.mockResolvedValue(storyRow());
  store.storyRevision.findUnique.mockResolvedValue(revisionRow());
  store.iteration.updateMany.mockResolvedValue({ count: 1 });
  return store;
}

describe('PrismaWorkspaceTasking', () => {
  it('records explicit tool/none/false authority before entering Tasking', async () => {
    const store = contextStore();
    store.iteration.findFirst.mockResolvedValue(
      iterationRow({ loop: 'understand', stage: 'modeling', version: 3 }),
    );
    store.noModelImpactDecision.findFirst.mockResolvedValue(null);
    store.noModelImpactDecision.count.mockResolvedValue(0);
    store.noModelImpactDecision.create.mockImplementation(async ({ data }) =>
      noModelImpactRow({ ...data }),
    );
    const tasking = new PrismaWorkspaceTasking(asStore(store), 'workspace-1');

    const decision = await tasking.recordNoModelImpact(
      'iteration-1',
      {
        expectedIterationVersion: 3,
        storyId: 'story-1',
        storyRevisionId: 'revision-2',
        storyRevisionSha256,
        reason: 'This Story changes only local workflow glue.',
      },
      'user-1',
    );

    expect(decision.description()).toMatchObject({
      subject: 'tool',
      method: 'none',
      modelChangeRequired: false,
      storyRevisionSha256,
    });
    expect(store.iteration.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          loop: 'understand',
          stage: { in: ['modeling'] },
          version: 3,
        }),
        data: expect.objectContaining({ loop: 'tasking', stage: 'drafting' }),
      }),
    );
  });

  it('persists a complete, baseline-locked Candidate and approves its exact snapshot', async () => {
    const store = contextStore();
    let stage = 'drafting';
    let version = 4;
    store.iteration.findFirst.mockImplementation(async () =>
      iterationRow({ stage, version }),
    );
    store.iteration.updateMany.mockImplementation(async ({ data }) => {
      if (typeof data.stage === 'string') stage = data.stage;
      if (typeof data.loop === 'string' && data.loop === 'understand') {
        stage = typeof data.stage === 'string' ? data.stage : stage;
      }
      version += 1;
      return { count: 1 };
    });
    store.noModelImpactDecision.findFirst.mockResolvedValue(noModelImpactRow());
    store.taskingCandidate.count.mockResolvedValue(0);
    let candidateRow: Record<string, unknown> | null = null;
    store.taskingCandidate.create.mockImplementation(async ({ data }) => {
      candidateRow = { ...data };
      return candidateRow;
    });
    store.taskingCandidate.findFirst.mockImplementation(
      async () => candidateRow,
    );
    store.deskCheckDecision.count.mockResolvedValue(0);
    store.deskCheckDecision.create.mockImplementation(async ({ data }) => ({
      ...data,
    }));
    store.approvedTaskingPlan.create.mockImplementation(async ({ data }) => ({
      ...data,
    }));
    const tasking = new PrismaWorkspaceTasking(asStore(store), 'workspace-1');

    const candidate = await tasking.proposeTasking('iteration-1', proposal());

    expect(candidate.description()).toMatchObject({
      planVersion: 2,
      baseCommitSha: 'd'.repeat(40),
      storyRevisionSha256,
      projectCatalogSha256: expect.stringMatching(/^sha256:/),
      tests: expect.arrayContaining([
        expect.objectContaining({ id: 'TEST-002', scenarioIds: ['SC-001'] }),
      ]),
      processes: [
        expect.objectContaining({
          processId: 'typescript-electron-shell',
          definitionSha256: hashCanonicalJson(
            TASKING_PROCESS_CATALOG[2] as never,
          ),
        }),
      ],
      executionBudget: expect.objectContaining({
        policyId: 'pair-default',
        maxAgentCalls: 10,
      }),
    });
    expect(stage).toBe('desk_check');

    const result = await tasking.decideTasking(
      'iteration-1',
      {
        expectedIterationVersion: 5,
        candidateId: candidate.identity(),
        candidateSha256: candidate.description().contentSha256,
        action: 'approve',
      },
      'user-1',
    );

    expect(result.iteration.description()).toMatchObject({
      loop: 'tasking',
      stage: 'approved',
      version: 6,
    });
    expect(result.approvedPlan?.description()).toMatchObject({
      taskingCandidate: expect.objectContaining({}),
      plan: {
        baseCommitSha: 'd'.repeat(40),
        contentSha256: candidate.description().contentSha256,
      },
      contentSha256: expect.stringMatching(/^sha256:/),
    });
    expect(store.approvedTaskingPlan.create).toHaveBeenCalledOnce();
  });
});
