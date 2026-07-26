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

    await expect(
      pair.claimPairLease('iteration-1', {
        pairRunId: view.run.identity(),
        expectedPairVersion: view.run.description().version,
        executorId: 'desktop-2',
      }),
    ).resolves.toMatchObject({
      run: expect.objectContaining({}),
      leaseToken: expect.any(String),
    });
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
