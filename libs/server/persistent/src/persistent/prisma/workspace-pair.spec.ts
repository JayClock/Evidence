import { describe, expect, it } from 'vitest';
import {
  PAIR_EXECUTION_POLICY,
  Ref,
  TASKING_PROCESS_CATALOG,
  materializePairExecutionBudget,
  type PairNextAction,
  type PairView,
  type TaskingCandidateDescription,
  type TaskingProcessSelection,
} from '@evidence/server-domain';
import { hashCanonicalJson } from '../workflow-content';
import {
  asStore,
  mockPrismaStore,
  timestamp,
  type MockFn,
} from './test-support';
import { PrismaWorkspacePair } from './workspace-pair';

const sha = (character: string) => `sha256:${character.repeat(64)}`;
const baseline = 'b'.repeat(40);

function iterationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'iteration-1',
    reference: 'ITER-0001',
    workspaceId: 'workspace-1',
    sourceCandidateId: 'source-candidate-1',
    sourceCandidateSha256: sha('c'),
    lifecycle: 'active',
    loop: 'tasking',
    stage: 'approved',
    lane: 'discovery',
    version: 6,
    baseCommitSha: baseline,
    branchName: 'evidence/iter-iteration-1',
    provisioningFailureSummary: null,
    admittedByUserId: 'user-1',
    admittedAt: timestamp,
    updatedAt: timestamp,
    story: { id: 'story-1' },
    ...overrides,
  };
}

function revisionRow() {
  return {
    id: 'revision-2',
    storyId: 'story-1',
    revisionNumber: 2,
    title: 'Execute one approved Pair plan',
    problem: 'Approved work lacks controlled Red and Green evidence.',
    role: 'Delivery lead',
    goal: 'Review one complete Story increment.',
    value: 'Coding remains tied to explicit authority.',
    cognitiveMode: 'complicated',
    contentSha256: sha('a'),
    createdByUserId: 'user-1',
    createdAt: timestamp,
    understandingDecisionId: 'understanding-1',
    citations: [],
    scenarios: [],
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
    iteration: {
      id: 'iteration-1',
      reference: 'ITER-0001',
      lifecycle: 'active',
      loop: 'pair',
      stage: 'plan_confirmed',
    },
    latestRevision: { ...revisionRow(), _count: { scenarios: 1 } },
    _count: { revisions: 2 },
  };
}

function planDescription(): TaskingCandidateDescription {
  const projectCatalog = {
    projects: [
      {
        id: '@evidence/desktop',
        root: 'apps/desktop',
        targets: ['test'],
      },
    ],
  };
  const projectCatalogSha256 = hashCanonicalJson(projectCatalog);
  const definition = TASKING_PROCESS_CATALOG.find(
    ({ id }) => id === 'typescript-electron-shell',
  );
  if (!definition) throw new Error('Electron process fixture is missing.');
  const process: Omit<TaskingProcessSelection, 'materializedSha256'> = {
    runtimePlanId: 'RUNTIME-001',
    processId: definition.id,
    processVersion: 3,
    definitionSha256: hashCanonicalJson(definition as never),
    functionalContexts: ['delivery'],
    technicalBoundaries: ['electron-main'],
    selectedStepIds: ['electron-shell-q1'],
    projectIds: ['@evidence/desktop'],
    projectCatalogSha256,
    focusedCommands: [
      {
        testId: 'TEST-001',
        stepId: 'electron-shell-q1',
        projectId: null,
        command:
          'pnpm nx test @evidence/desktop --run --testNamePattern=pair-authority',
      },
    ],
    qualityGates: [
      {
        projectId: '@evidence/desktop',
        target: 'test',
        command: 'pnpm nx test @evidence/desktop --run',
      },
    ],
  };
  return {
    planVersion: 2,
    reference: 'TASKING-001',
    iteration: new Ref('iteration-1'),
    story: new Ref('story-1'),
    storyRevision: new Ref('revision-2'),
    storyRevisionSha256: sha('a'),
    baseCommitSha: baseline,
    noModelImpactDecision: new Ref('no-model-1'),
    noModelImpactDecisionSha256: sha('d'),
    sequence: 1,
    projectCatalog,
    projectCatalogSha256,
    tests: [
      {
        id: 'TEST-001',
        quadrant: 'Q1',
        intent: 'Pair records one controlled Red and Green.',
        runtimePlanId: 'RUNTIME-001',
        processId: definition.id,
        stepId: 'electron-shell-q1',
        projectId: null,
        testFilter: 'pair-authority',
        supportedBy: [],
        scenarioIds: ['SC-001'],
        scenarioOutcome: null,
        businessData: ['US-001'],
        modelRefs: { entities: [], associations: [] },
      },
    ],
    tasks: [
      {
        id: 'TASK-001',
        description: 'Drive one controlled Pair increment.',
        testIds: ['TEST-001'],
        dependsOn: [],
        modelRefs: { entities: [], associations: [] },
      },
    ],
    processes: [
      {
        ...process,
        materializedSha256: hashCanonicalJson(process as never),
      },
    ],
    executionBudget: materializePairExecutionBudget({
      testCount: 1,
      processStepCount: 1,
      qualityGateCount: 1,
      policySha256: hashCanonicalJson(PAIR_EXECUTION_POLICY as never),
    }),
    contentSha256: sha('7'),
    proposedBy: 'tasking-analyst',
    proposedAt: timestamp.toISOString(),
  };
}

function approvedPlanRow() {
  const plan = planDescription();
  return {
    id: 'approved-plan-1',
    workspaceId: 'workspace-1',
    iterationId: 'iteration-1',
    storyId: 'story-1',
    storyRevisionId: 'revision-2',
    taskingCandidateId: 'tasking-1',
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
    contentSha256: sha('6'),
    approvedByUserId: 'user-1',
    approvedAt: timestamp,
  };
}

function statefulStore() {
  const store = mockPrismaStore();
  let iteration: Record<string, unknown> = iterationRow();
  let run: Record<string, unknown> | null = null;
  const attempts: Array<Record<string, unknown>> = [];
  const observations: Array<Record<string, unknown>> = [];
  const reviews: Array<Record<string, unknown>> = [];
  const exceptions: Array<Record<string, unknown>> = [];
  const decisions: Array<Record<string, unknown>> = [];
  let manifest: Record<string, unknown> | null = null;

  store.iteration.findFirst.mockImplementation(async () => iteration);
  store.iteration.updateMany.mockImplementation(async ({ data }) => {
    iteration = applyData(iteration, data);
    return { count: 1 };
  });
  store.story.findFirst.mockResolvedValue(storyRow());
  store.storyRevision.findUnique.mockResolvedValue(revisionRow());
  store.approvedTaskingPlan.findFirst.mockResolvedValue(approvedPlanRow());

  store.pairRun.findFirst.mockImplementation(async ({ where } = {}) => {
    if (!run) return null;
    if (where?.status?.in && !where.status.in.includes(run.status)) return null;
    if (where?.id && where.id !== run.id) return null;
    return run;
  });
  store.pairRun.count.mockResolvedValue(0);
  store.pairRun.create.mockImplementation(async ({ data }) => {
    run = { ...data };
    return run;
  });
  store.pairRun.updateMany.mockImplementation(async ({ data }) => {
    if (!run) return { count: 0 };
    run = applyData(run, data);
    return { count: 1 };
  });

  configureEvidenceDelegate(store.pairDriverAttempt, attempts, 'completedAt');
  configureEvidenceDelegate(
    store.pairCommandObservation,
    observations,
    'sequence',
  );
  configureEvidenceDelegate(store.pairRedReview, reviews, 'reviewedAt');
  configureEvidenceDelegate(
    store.pairAutomationException,
    exceptions,
    'raisedAt',
  );
  store.pairAutomationException.updateMany.mockImplementation(
    async ({ where, data }) => {
      const entry = exceptions.find((candidate) => candidate.id === where.id);
      if (entry) Object.assign(entry, data);
      return { count: entry ? 1 : 0 };
    },
  );
  store.pairExecutionManifest.findFirst.mockImplementation(
    async () => manifest,
  );
  store.pairExecutionManifest.create.mockImplementation(async ({ data }) => {
    manifest = { ...data };
    return manifest;
  });
  configureEvidenceDelegate(store.pairCodingDecision, decisions, 'decidedAt');

  return { store, currentRun: () => run };
}

function configureEvidenceDelegate(
  delegate: Record<string, MockFn>,
  rows: Array<Record<string, unknown>>,
  orderField: string,
) {
  delegate.findMany?.mockImplementation(async () => [...rows]);
  delegate.findFirst.mockImplementation(async ({ where } = {}) => {
    const matches = rows.filter((row) => matchesWhere(row, where));
    return matches.at(-1) ?? null;
  });
  delegate.count?.mockImplementation(async () => rows.length);
  delegate.create.mockImplementation(async ({ data }) => {
    const row = { ...data };
    rows.push(row);
    return row;
  });
  void orderField;
}

function matchesWhere(
  row: Record<string, unknown>,
  where: Record<string, unknown> | undefined,
): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, value]) => {
    if (value === undefined) return true;
    if (value === null) return row[key] === null;
    if (typeof value === 'object' && value && 'in' in value) {
      return (value.in as unknown[]).includes(row[key]);
    }
    return row[key] === value;
  });
}

function applyData(
  row: Record<string, unknown>,
  data: Record<string, unknown>,
): Record<string, unknown> {
  const updated = { ...row };
  for (const [key, value] of Object.entries(data)) {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      'increment' in value
    ) {
      updated[key] = Number(updated[key] ?? 0) + Number(value.increment);
    } else {
      updated[key] = value;
    }
  }
  return updated;
}

function machineInput(
  view: PairView,
  leaseToken: string,
): Pick<
  Parameters<PrismaWorkspacePair['recordPairDriverAttempt']>[1],
  'pairRunId' | 'actionId' | 'expectedPairVersion' | 'leaseToken'
> {
  const action = requireNext(view);
  return {
    pairRunId: view.run.identity(),
    actionId: action.actionId,
    expectedPairVersion: action.expectedPairVersion,
    leaseToken,
  };
}

function requireNext(view: PairView): PairNextAction {
  if (!view.nextAction) throw new Error('Pair next action is missing.');
  return view.nextAction;
}

async function driveToRefactorVerification(
  pair: PrismaWorkspacePair,
  initial: PairView,
  lease: string,
): Promise<PairView> {
  let view = (
    await pair.recordPairDriverAttempt('iteration-1', {
      ...machineInput(initial, lease),
      role: 'test',
      mode: 'write_test',
      summary: 'Added the focused Pair authority test.',
      changedPaths: ['apps/desktop/src/pair-authority.spec.ts'],
      beforeWorktreeSha256: sha('1'),
      afterWorktreeSha256: sha('2'),
      diffSha256: sha('3'),
      agentCallCount: 1,
    })
  ).view;
  view = (
    await pair.recordPairCommandObservation(
      'iteration-1',
      observationInput(view, lease, 1, sha('3')),
    )
  ).view;
  const red = requireNext(view);
  if (red.kind !== 'review_red') throw new Error('Expected Red review.');
  view = (
    await pair.recordPairRedReview('iteration-1', {
      ...machineInput(view, lease),
      observationId: red.observationId,
      classification: 'behavior',
      reason: 'The assertion reached the absent approved behavior.',
    })
  ).view;
  view = (
    await pair.recordPairDriverAttempt('iteration-1', {
      ...machineInput(view, lease),
      role: 'production',
      mode: 'implement',
      summary: 'Implemented the minimum approved behavior.',
      changedPaths: ['apps/desktop/src/pair-authority.ts'],
      beforeWorktreeSha256: sha('2'),
      afterWorktreeSha256: sha('4'),
      diffSha256: sha('5'),
      agentCallCount: 1,
    })
  ).view;
  view = (
    await pair.recordPairCommandObservation(
      'iteration-1',
      observationInput(view, lease, 0, sha('5')),
    )
  ).view;
  return (
    await pair.recordPairDriverAttempt('iteration-1', {
      ...machineInput(view, lease),
      role: 'refactor',
      mode: 'refactor',
      summary: 'No safe structural change was needed.',
      changedPaths: [],
      beforeWorktreeSha256: sha('4'),
      afterWorktreeSha256: sha('4'),
      diffSha256: sha('5'),
      agentCallCount: 1,
    })
  ).view;
}

async function driveToQualityGate(
  pair: PrismaWorkspacePair,
  initial: PairView,
  lease: string,
): Promise<PairView> {
  const view = await driveToRefactorVerification(pair, initial, lease);
  return (
    await pair.recordPairCommandObservation(
      'iteration-1',
      observationInput(view, lease, 0, sha('5')),
    )
  ).view;
}

describe('PrismaWorkspacePair', () => {
  it('releases exception authority so a human-routed Pair can be claimed immediately', async () => {
    const fixture = statefulStore();
    const pair = new PrismaWorkspacePair(asStore(fixture.store), 'workspace-1');
    const started = await pair.startPair('iteration-1', {
      expectedIterationVersion: 6,
      approvedTaskingPlanId: 'approved-plan-1',
      approvedTaskingPlanSha256: sha('6'),
      executorId: 'desktop-1',
    });
    const lease = started.leaseToken;
    let view = (
      await pair.recordPairDriverAttempt('iteration-1', {
        ...machineInput(started.view, lease),
        role: 'test',
        mode: 'write_test',
        summary: 'Added the focused Pair authority test.',
        changedPaths: ['apps/desktop/src/pair-authority.spec.ts'],
        beforeWorktreeSha256: sha('1'),
        afterWorktreeSha256: sha('2'),
        diffSha256: sha('3'),
        agentCallCount: 1,
      })
    ).view;
    view = (
      await pair.recordPairCommandObservation(
        'iteration-1',
        observationInput(view, lease, 0, sha('3')),
      )
    ).view;
    expect(view.run.description()).toMatchObject({
      status: 'exception',
      leaseOwnerId: null,
      leaseExpiresAt: null,
    });

    view = (
      await pair.decidePair(
        'iteration-1',
        {
          expectedPairVersion: view.run.description().version,
          action: 'back_test',
          reason: 'Repair the TEST so it observes an approved behavior Red.',
        },
        'user-1',
      )
    ).view;
    expect(view.run.description()).toMatchObject({
      status: 'running',
      checkpoint: 'plan_confirmed',
      leaseOwnerId: null,
      leaseExpiresAt: null,
    });
    expect(requireNext(view)).toMatchObject({
      kind: 'run_driver',
      role: 'test',
      mode: 'repair_test',
      diagnosticObservationId: expect.any(String),
    });

    const reclaimed = await pair.claimPairLease('iteration-1', {
      pairRunId: view.run.identity(),
      expectedPairVersion: view.run.description().version,
      executorId: 'desktop-2',
    });
    expect(reclaimed).toMatchObject({
      run: expect.objectContaining({}),
      leaseToken: expect.any(String),
    });
    view = (
      await pair.recordPairDriverAttempt('iteration-1', {
        ...machineInput(view, reclaimed.leaseToken),
        role: 'test',
        mode: 'repair_test',
        summary: 'Repaired the focused behavior assertion.',
        changedPaths: ['apps/desktop/src/pair-authority.spec.ts'],
        beforeWorktreeSha256: sha('2'),
        afterWorktreeSha256: sha('4'),
        diffSha256: sha('5'),
        agentCallCount: 1,
      })
    ).view;
    expect(requireNext(view)).toMatchObject({
      kind: 'execute_command',
      stage: 'red',
    });
  });

  it('resumes the exact Red Review after a transient reviewer failure', async () => {
    const fixture = statefulStore();
    const pair = new PrismaWorkspacePair(asStore(fixture.store), 'workspace-1');
    const started = await pair.startPair('iteration-1', {
      expectedIterationVersion: 6,
      approvedTaskingPlanId: 'approved-plan-1',
      approvedTaskingPlanSha256: sha('6'),
      executorId: 'desktop-1',
    });
    const lease = started.leaseToken;
    let view = (
      await pair.recordPairDriverAttempt('iteration-1', {
        ...machineInput(started.view, lease),
        role: 'test',
        mode: 'write_test',
        summary: 'Added the focused Pair authority test.',
        changedPaths: ['apps/desktop/src/pair-authority.spec.ts'],
        beforeWorktreeSha256: sha('1'),
        afterWorktreeSha256: sha('2'),
        diffSha256: sha('3'),
        agentCallCount: 1,
      })
    ).view;
    view = (
      await pair.recordPairCommandObservation(
        'iteration-1',
        observationInput(view, lease, 1, sha('3')),
      )
    ).view;
    const review = requireNext(view);
    if (review.kind !== 'review_red') throw new Error('Expected Red review.');
    const observation = view.commandObservations.find(
      (candidate) => candidate.identity() === review.observationId,
    );
    if (!observation) throw new Error('Expected the Red observation.');
    view = (
      await pair.recordPairException('iteration-1', {
        ...machineInput(view, lease),
        kind: 'runtime_failure',
        summary: 'The independent Red Reviewer stopped unexpectedly.',
        failureFingerprint: observation.description().failureFingerprint,
      })
    ).view;
    expect(view.currentException?.description().allowedRoutes).toEqual([
      'back_test',
      'back_tasking',
      'cancel',
    ]);

    view = (
      await pair.decidePair(
        'iteration-1',
        {
          expectedPairVersion: view.run.description().version,
          action: 'back_test',
          reason: 'Resume the exact pending Red Review.',
        },
        'user-1',
      )
    ).view;
    expect(requireNext(view)).toMatchObject({
      kind: 'review_red',
      observationId: review.observationId,
    });
  });

  it('resumes refactor verification without rerunning its Driver', async () => {
    const fixture = statefulStore();
    const pair = new PrismaWorkspacePair(asStore(fixture.store), 'workspace-1');
    const started = await pair.startPair('iteration-1', {
      expectedIterationVersion: 6,
      approvedTaskingPlanId: 'approved-plan-1',
      approvedTaskingPlanSha256: sha('6'),
      executorId: 'desktop-1',
    });
    const lease = started.leaseToken;
    let view = await driveToRefactorVerification(pair, started.view, lease);
    expect(requireNext(view)).toMatchObject({
      kind: 'execute_command',
      stage: 'refactor',
    });
    view = (
      await pair.recordPairException('iteration-1', {
        ...machineInput(view, lease),
        kind: 'runtime_failure',
        summary: 'The refactor verification command runner stopped.',
        failureFingerprint: null,
      })
    ).view;
    expect(view.currentException?.description().allowedRoutes).toEqual([
      'back_implementation',
      'back_tasking',
      'cancel',
    ]);

    view = (
      await pair.decidePair(
        'iteration-1',
        {
          expectedPairVersion: view.run.description().version,
          action: 'back_implementation',
          reason: 'Resume the exact refactor verification command.',
        },
        'user-1',
      )
    ).view;
    expect(requireNext(view)).toMatchObject({
      kind: 'execute_command',
      stage: 'refactor',
    });
  });

  it('persists evidence at and beyond the finite execution budget boundary', async () => {
    const fixture = statefulStore();
    const pair = new PrismaWorkspacePair(asStore(fixture.store), 'workspace-1');
    const started = await pair.startPair('iteration-1', {
      expectedIterationVersion: 6,
      approvedTaskingPlanId: 'approved-plan-1',
      approvedTaskingPlanSha256: sha('6'),
      executorId: 'desktop-1',
    });
    const run = fixture.currentRun();
    if (!run) throw new Error('Expected the Pair Run row.');
    run.executionBudget = {
      ...(run.executionBudget as Record<string, unknown>),
      maxAgentCalls: 1,
      maxCheckpoints: 1,
    };
    const lease = started.leaseToken;
    let view = (
      await pair.recordPairDriverAttempt('iteration-1', {
        ...machineInput(started.view, lease),
        role: 'test',
        mode: 'write_test',
        summary: 'Used the last approved Agent call.',
        changedPaths: ['apps/desktop/src/pair-authority.spec.ts'],
        beforeWorktreeSha256: sha('1'),
        afterWorktreeSha256: sha('2'),
        diffSha256: sha('3'),
        agentCallCount: 1,
      })
    ).view;
    expect(view.run.description()).toMatchObject({
      status: 'running',
      budgetUsage: { agentCalls: 1, checkpoints: 1 },
    });

    view = (
      await pair.recordPairCommandObservation(
        'iteration-1',
        observationInput(view, lease, 1, sha('3')),
      )
    ).view;
    expect(fixture.store.pairCommandObservation.create).toHaveBeenCalledTimes(
      1,
    );
    expect(view.currentException?.description()).toMatchObject({
      kind: 'budget_exhausted',
      allowedRoutes: ['back_tasking', 'cancel'],
    });
    expect(view.run.description().budgetUsage.checkpoints).toBe(2);
  });

  it('preserves a no-progress trigger before converting it to budget exhaustion', async () => {
    const fixture = statefulStore();
    const pair = new PrismaWorkspacePair(asStore(fixture.store), 'workspace-1');
    const started = await pair.startPair('iteration-1', {
      expectedIterationVersion: 6,
      approvedTaskingPlanId: 'approved-plan-1',
      approvedTaskingPlanSha256: sha('6'),
      executorId: 'desktop-1',
    });
    const run = fixture.currentRun();
    if (!run) throw new Error('Expected the Pair Run row.');
    run.executionBudget = {
      ...(run.executionBudget as Record<string, unknown>),
      maxNoProgressCheckpoints: 0,
    };

    const view = (
      await pair.recordPairException('iteration-1', {
        ...machineInput(started.view, started.leaseToken),
        kind: 'no_progress',
        summary: 'The Test Driver produced no observable change.',
        failureFingerprint: null,
      })
    ).view;
    expect(
      fixture.store.pairAutomationException.create,
    ).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({
        kind: 'no_progress',
        resolvedAt: expect.any(Date),
      }),
    });
    expect(
      fixture.store.pairAutomationException.create,
    ).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({
        kind: 'budget_exhausted',
        summary: expect.stringContaining('no_progress'),
        resolvedAt: null,
      }),
    });
    expect(view.currentException?.description().kind).toBe('budget_exhausted');
    expect(view.run.description().budgetUsage.noProgressCheckpoints).toBe(1);
  });

  it('runs a bounded quality repair and preserves superseded Manifests', async () => {
    const fixture = statefulStore();
    const pair = new PrismaWorkspacePair(asStore(fixture.store), 'workspace-1');
    const started = await pair.startPair('iteration-1', {
      expectedIterationVersion: 6,
      approvedTaskingPlanId: 'approved-plan-1',
      approvedTaskingPlanSha256: sha('6'),
      executorId: 'desktop-1',
    });
    const lease = started.leaseToken;
    let view = await driveToQualityGate(pair, started.view, lease);
    view = (
      await pair.recordPairCommandObservation(
        'iteration-1',
        observationInput(view, lease, 1, sha('5')),
      )
    ).view;
    expect(view.run.description().status).toBe('exception');

    view = (
      await pair.decidePair(
        'iteration-1',
        {
          expectedPairVersion: view.run.description().version,
          action: 'retry_quality',
          reason: 'Repair the production boundary before retrying its gate.',
        },
        'user-1',
      )
    ).view;
    expect(requireNext(view)).toMatchObject({
      kind: 'run_driver',
      role: 'production',
      mode: 'repair_quality_gate',
      diagnosticObservationId: expect.any(String),
    });
    const reclaimed = await pair.claimPairLease('iteration-1', {
      pairRunId: view.run.identity(),
      expectedPairVersion: view.run.description().version,
      executorId: 'desktop-2',
    });
    view = (
      await pair.recordPairDriverAttempt('iteration-1', {
        ...machineInput(view, reclaimed.leaseToken),
        role: 'production',
        mode: 'repair_quality_gate',
        summary: 'Repaired the quality-gate production issue.',
        changedPaths: ['apps/desktop/src/pair-authority.ts'],
        beforeWorktreeSha256: sha('4'),
        afterWorktreeSha256: sha('8'),
        diffSha256: sha('9'),
        agentCallCount: 1,
      })
    ).view;
    expect(requireNext(view)).toMatchObject({
      kind: 'execute_command',
      stage: 'quality_gate',
    });
    view = (
      await pair.recordPairCommandObservation(
        'iteration-1',
        observationInput(view, reclaimed.leaseToken, 0, sha('9')),
      )
    ).view;
    const firstManifest = view.manifest?.identity();
    expect(firstManifest).toBeDefined();

    view = (
      await pair.decidePair(
        'iteration-1',
        {
          expectedPairVersion: view.run.description().version,
          action: 'back_implementation',
          reason: 'The complete diff still needs one implementation repair.',
        },
        'user-1',
      )
    ).view;
    expect(view.manifest).toBeNull();
    expect(view.run.description().finalManifestSha256).toBeNull();
    expect(requireNext(view)).toMatchObject({
      kind: 'run_driver',
      mode: 'repair_implementation',
      repairDecisionId: expect.any(String),
      repairInstruction:
        'The complete diff still needs one implementation repair.',
    });
    const secondLease = await pair.claimPairLease('iteration-1', {
      pairRunId: view.run.identity(),
      expectedPairVersion: view.run.description().version,
      executorId: 'desktop-3',
    });
    view = (
      await pair.recordPairDriverAttempt('iteration-1', {
        ...machineInput(view, secondLease.leaseToken),
        role: 'production',
        mode: 'repair_implementation',
        summary: 'Repaired the reviewed implementation.',
        changedPaths: ['apps/desktop/src/pair-authority.ts'],
        beforeWorktreeSha256: sha('8'),
        afterWorktreeSha256: sha('a'),
        diffSha256: sha('b'),
        agentCallCount: 1,
      })
    ).view;
    view = (
      await pair.recordPairCommandObservation(
        'iteration-1',
        observationInput(view, secondLease.leaseToken, 0, sha('b')),
      )
    ).view;
    view = (
      await pair.recordPairDriverAttempt('iteration-1', {
        ...machineInput(view, secondLease.leaseToken),
        role: 'refactor',
        mode: 'refactor',
        summary: 'No further refactor was needed.',
        changedPaths: [],
        beforeWorktreeSha256: sha('a'),
        afterWorktreeSha256: sha('a'),
        diffSha256: sha('b'),
        agentCallCount: 1,
      })
    ).view;
    view = (
      await pair.recordPairCommandObservation(
        'iteration-1',
        observationInput(view, secondLease.leaseToken, 0, sha('b')),
      )
    ).view;
    view = (
      await pair.recordPairCommandObservation(
        'iteration-1',
        observationInput(view, secondLease.leaseToken, 0, sha('b')),
      )
    ).view;

    expect(view.run.description().status).toBe('approval_required');
    expect(view.manifest?.identity()).not.toBe(firstManifest);
    expect(fixture.store.pairExecutionManifest.create).toHaveBeenCalledTimes(2);

    const secondRevisionInput = {
      expectedPairVersion: view.run.description().version,
      action: 'back_implementation' as const,
      reason: 'The revised complete diff still needs one bounded repair.',
    };
    const secondRevision = await pair.decidePair(
      'iteration-1',
      secondRevisionInput,
      'user-1',
    );
    expect(requireNext(secondRevision.view)).toMatchObject({
      kind: 'run_driver',
      mode: 'repair_implementation',
    });
    expect(fixture.store.pairCodingDecision.create).toHaveBeenCalledTimes(3);

    const replay = await pair.decidePair(
      'iteration-1',
      secondRevisionInput,
      'user-1',
    );
    expect(replay.acceptedRecordId).toBe(secondRevision.acceptedRecordId);
    expect(fixture.store.pairCodingDecision.create).toHaveBeenCalledTimes(3);
    await expect(
      pair.decidePair(
        'iteration-1',
        {
          ...secondRevisionInput,
          reason: 'A different stale decision must not replay.',
        },
        'user-1',
      ),
    ).rejects.toThrow('Pair changed; reload before deciding');

    const repairAction = requireNext(secondRevision.view);
    if (repairAction.kind !== 'run_driver') {
      throw new Error('Expected the reviewed implementation repair.');
    }
    const repairLease = await pair.claimPairLease('iteration-1', {
      pairRunId: secondRevision.view.run.identity(),
      expectedPairVersion: secondRevision.view.run.description().version,
      executorId: 'desktop-repair-retry',
    });
    view = (
      await pair.recordPairException('iteration-1', {
        ...machineInput(secondRevision.view, repairLease.leaseToken),
        kind: 'runtime_failure',
        summary: 'The local Driver process stopped before producing evidence.',
        failureFingerprint: null,
      })
    ).view;
    view = (
      await pair.decidePair(
        'iteration-1',
        {
          expectedPairVersion: view.run.description().version,
          action: 'back_implementation',
          reason: 'Resume the already bounded human-requested repair.',
        },
        'user-1',
      )
    ).view;
    expect(requireNext(view)).toMatchObject({
      kind: 'run_driver',
      mode: 'repair_implementation',
      repairDecisionId: repairAction.repairDecisionId,
      repairInstruction: secondRevisionInput.reason,
    });
  });

  it('stops repeated quality failures at the approved fingerprint retry budget', async () => {
    const fixture = statefulStore();
    const pair = new PrismaWorkspacePair(asStore(fixture.store), 'workspace-1');
    const started = await pair.startPair('iteration-1', {
      expectedIterationVersion: 6,
      approvedTaskingPlanId: 'approved-plan-1',
      approvedTaskingPlanSha256: sha('6'),
      executorId: 'desktop-1',
    });
    let lease = started.leaseToken;
    let view = await driveToQualityGate(pair, started.view, lease);
    view = (
      await pair.recordPairCommandObservation(
        'iteration-1',
        observationInput(view, lease, 1, sha('5')),
      )
    ).view;

    const repairHashes = [
      { after: '8', diff: '9' },
      { after: 'a', diff: 'b' },
      { after: 'c', diff: 'd' },
    ] as const;
    let beforeHash = '4';
    for (const [retry, hashes] of repairHashes.entries()) {
      view = (
        await pair.decidePair(
          'iteration-1',
          {
            expectedPairVersion: view.run.description().version,
            action: 'retry_quality',
            reason: `Bounded quality repair ${String(retry + 1)}.`,
          },
          'user-1',
        )
      ).view;
      const claimed = await pair.claimPairLease('iteration-1', {
        pairRunId: view.run.identity(),
        expectedPairVersion: view.run.description().version,
        executorId: `desktop-${String(retry + 2)}`,
      });
      lease = claimed.leaseToken;
      view = (
        await pair.recordPairDriverAttempt('iteration-1', {
          ...machineInput(view, lease),
          role: 'production',
          mode: 'repair_quality_gate',
          summary: `Applied bounded quality repair ${String(retry + 1)}.`,
          changedPaths: ['apps/desktop/src/pair-authority.ts'],
          beforeWorktreeSha256: sha(beforeHash),
          afterWorktreeSha256: sha(hashes.after),
          diffSha256: sha(hashes.diff),
          agentCallCount: 1,
        })
      ).view;
      view = (
        await pair.recordPairCommandObservation(
          'iteration-1',
          observationInput(view, lease, 1, sha(hashes.diff)),
        )
      ).view;
      beforeHash = hashes.after;
    }

    expect(view.currentException?.description()).toMatchObject({
      kind: 'budget_exhausted',
      allowedRoutes: ['back_tasking', 'cancel'],
    });
    expect(view.run.description().budgetUsage.repeatedFingerprintCount).toBe(3);
  });

  it('persists the approved-plan Red/Green/Refactor/gate chain before human approval', async () => {
    const fixture = statefulStore();
    const pair = new PrismaWorkspacePair(asStore(fixture.store), 'workspace-1');

    const started = await pair.startPair('iteration-1', {
      expectedIterationVersion: 6,
      approvedTaskingPlanId: 'approved-plan-1',
      approvedTaskingPlanSha256: sha('6'),
      executorId: 'desktop-1',
    });
    let view = started.view;
    const lease = started.leaseToken;
    expect(view.run.description()).toMatchObject({
      status: 'running',
      checkpoint: 'plan_confirmed',
      approvedTaskingPlanSha256: sha('6'),
    });
    expect(requireNext(view)).toMatchObject({
      kind: 'run_driver',
      role: 'test',
      mode: 'write_test',
    });

    view = (
      await pair.recordPairDriverAttempt('iteration-1', {
        ...machineInput(view, lease),
        role: 'test',
        mode: 'write_test',
        summary: 'Added the focused Pair authority test.',
        changedPaths: ['apps/desktop/src/pair-authority.spec.ts'],
        beforeWorktreeSha256: sha('1'),
        afterWorktreeSha256: sha('2'),
        diffSha256: sha('3'),
        agentCallCount: 1,
      })
    ).view;
    expect(requireNext(view)).toMatchObject({
      kind: 'execute_command',
      stage: 'red',
    });

    view = (
      await pair.recordPairCommandObservation(
        'iteration-1',
        observationInput(view, lease, 1, sha('3')),
      )
    ).view;
    expect(requireNext(view)).toMatchObject({ kind: 'review_red' });

    const redAction = requireNext(view);
    if (redAction.kind !== 'review_red')
      throw new Error('Expected Red review.');
    view = (
      await pair.recordPairRedReview('iteration-1', {
        ...machineInput(view, lease),
        observationId: redAction.observationId,
        classification: 'behavior',
        reason: 'The focused test reached its assertion for absent behavior.',
      })
    ).view;
    expect(requireNext(view)).toMatchObject({
      kind: 'run_driver',
      role: 'production',
    });

    view = (
      await pair.recordPairDriverAttempt('iteration-1', {
        ...machineInput(view, lease),
        role: 'production',
        mode: 'implement',
        summary: 'Added the minimum Pair authority behavior.',
        changedPaths: ['apps/desktop/src/pair-authority.ts'],
        beforeWorktreeSha256: sha('2'),
        afterWorktreeSha256: sha('4'),
        diffSha256: sha('5'),
        agentCallCount: 1,
      })
    ).view;
    view = (
      await pair.recordPairCommandObservation(
        'iteration-1',
        observationInput(view, lease, 0, sha('5')),
      )
    ).view;
    expect(requireNext(view)).toMatchObject({
      kind: 'run_driver',
      role: 'refactor',
    });

    view = (
      await pair.recordPairDriverAttempt('iteration-1', {
        ...machineInput(view, lease),
        role: 'refactor',
        mode: 'refactor',
        summary: 'The process step needs no safe refactor.',
        changedPaths: [],
        beforeWorktreeSha256: sha('4'),
        afterWorktreeSha256: sha('4'),
        diffSha256: sha('5'),
        agentCallCount: 1,
      })
    ).view;
    view = (
      await pair.recordPairCommandObservation(
        'iteration-1',
        observationInput(view, lease, 0, sha('5')),
      )
    ).view;
    expect(requireNext(view)).toMatchObject({
      kind: 'execute_command',
      stage: 'quality_gate',
    });

    view = (
      await pair.recordPairCommandObservation(
        'iteration-1',
        observationInput(view, lease, 0, sha('5')),
      )
    ).view;
    expect(view.run.description()).toMatchObject({
      status: 'approval_required',
      checkpoint: 'quality_gates_passed',
      finalManifestSha256: expect.stringMatching(/^sha256:/),
    });
    expect(view.manifest?.description()).toMatchObject({
      completedTestIds: ['TEST-001'],
      completedStepKeys: ['RUNTIME-001:electron-shell-q1'],
      changedPaths: [
        'apps/desktop/src/pair-authority.spec.ts',
        'apps/desktop/src/pair-authority.ts',
      ],
      finalDiffSha256: sha('5'),
    });

    const manifestSha256 = view.manifest?.description().contentSha256;
    if (!manifestSha256) throw new Error('Pair Manifest is missing.');
    view = (
      await pair.decidePair(
        'iteration-1',
        {
          expectedPairVersion: view.run.description().version,
          action: 'approve',
          reason: 'The complete Story increment matches the approved plan.',
          manifestSha256,
          diffSha256: sha('5'),
          commitSha: 'f'.repeat(40),
        },
        'user-1',
      )
    ).view;

    expect(view.run.description()).toMatchObject({
      status: 'approved',
      checkpoint: 'approved',
      approvedCommitSha: 'f'.repeat(40),
    });
    expect(view.nextAction).toBeNull();
  });
});

function observationInput(
  view: PairView,
  leaseToken: string,
  exitCode: number,
  diffSha256: string,
) {
  const action = requireNext(view);
  if (action.kind !== 'execute_command') {
    throw new Error('Expected a command action.');
  }
  return {
    ...machineInput(view, leaseToken),
    stage: action.stage,
    command: action.command,
    termination: 'exited' as const,
    exitCode,
    durationMs: 20,
    stdoutSha256: sha('0'),
    stdoutBytes: 100,
    stdoutLines: 3,
    stderrSha256: sha('0'),
    stderrBytes: 0,
    stderrLines: 0,
    worktreeSha256: sha('4'),
    diffSha256,
  };
}
