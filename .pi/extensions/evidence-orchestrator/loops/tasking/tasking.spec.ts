import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { readState, writeState } from '../../iteration/state-repository';
import { transitionLoopState } from '../../iteration/transition-graph';
import { DEFAULT_STATE } from '../../iteration/default-state';
import {
  cleanupWorkspaces,
  initializeGitRepository,
  testIntakeSnapshot,
  workspace,
  write,
} from '../../test-support/support';
import { prepareActivityRun } from '../../adapters/pi/activity/dispatch';
import { statusMarkdown } from '../../adapters/pi/status';
import { buildActivityTask } from '../../adapters/pi/activity/task';
import { executeTestStep } from '../../capabilities/execution-evidence/observation-log';
import { completeNoModelImpact } from '../../capabilities/modeling-evidence/no-model-impact';
import {
  createNxProjectCatalog,
  type NxWorkspaceProject,
} from '../../capabilities/test-process/project-catalog';
import { decideTasking } from './desk-check';
import { proposeTaskingDraft, type TaskingDraftInput } from './tasking-draft';

afterEach(cleanupWorkspaces);

function processDefinition(id = 'rust-workspace') {
  return {
    version: 3,
    id,
    owner: 'server-platform',
    runtime: 'rust',
    applies_to: {
      capabilities: ['workspace'],
      technical_boundaries: ['rust-domain', 'seaorm-store', 'axum-api'],
      when: 'A workspace Scenario belongs to Rust.',
    },
    steps: [
      {
        id: 'domain-q1',
        purpose: 'Drive the domain rule.',
        quadrant: 'Q1',
        functional_contexts: ['workspace'],
        real_boundaries: ['rust-domain'],
        replaced_boundaries: [],
        nearest_test: { rule: 'Nearest domain test.', roots: ['domain'] },
        focused_command: {
          template: 'node focused.js {{test_filter}}',
          allowed_variables: ['test_filter'],
        },
        red: {
          expected_failure_kind: 'behavior',
          expected_failure: 'Business assertion fails.',
        },
        green: { done_when: 'Business assertion passes.' },
        refactor: { done_when: 'Business assertion stays green.' },
      },
      {
        id: 'api-q2',
        purpose: 'Confirm the Scenario through Axum.',
        quadrant: 'Q2',
        functional_contexts: ['workspace'],
        real_boundaries: ['axum-api', 'rust-domain'],
        replaced_boundaries: [
          { boundary: 'seaorm-store', test_double: 'fake' },
        ],
        nearest_test: { rule: 'Nearest API test.', roots: ['api'] },
        focused_command: {
          template: 'node focused.js {{test_filter}}',
          allowed_variables: ['test_filter'],
        },
        red: {
          expected_failure_kind: 'behavior',
          expected_failure: 'Acceptance assertion fails.',
        },
        green: { done_when: 'Acceptance assertion passes.' },
        refactor: { done_when: 'Acceptance assertion stays green.' },
      },
    ],
    quality_gates: [
      {
        scope: 'process',
        template: 'node quality.js',
        allowed_variables: [],
      },
    ],
  };
}

function prepare(cwd: string): void {
  initializeGitRepository(cwd);
  write(
    cwd,
    'engineering/evidence-orchestrator/test-processes/rust.json',
    JSON.stringify(processDefinition()),
  );
  write(
    cwd,
    'artifacts/iterations/ITER-0001/01-requirements/examples/US-001-SC-001.md',
    '# Scenario',
  );
  write(
    cwd,
    'artifacts/iterations/ITER-0001/02-domain-model/model-expansions/US-001-SC-001.json',
    JSON.stringify({
      model_refs: { entities: ['workspace'], associations: [] },
    }),
  );
  const baseline = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd,
    encoding: 'utf8',
  }).trim();
  const modelChallenge = {
    version: 1 as const,
    requested_outcome: 'pass' as const,
    outcome: 'pass' as const,
    summary: 'The model explains the confirmed Scenario.',
    checked_regression_ids: ['REG-001'],
    projection_sha256: 'projection-sha',
    artifact_path: 'challenge.json',
    challenged_by: 'model-challenger' as const,
    challenged_at: '2026-01-01T00:02:00.000Z',
  };
  const challengeContent = JSON.stringify(modelChallenge);
  write(cwd, modelChallenge.artifact_path, challengeContent);
  const modelDecision = {
    version: 1 as const,
    action: 'confirm' as const,
    reason: 'The model and language are shared.',
    challenge_artifact_path: modelChallenge.artifact_path,
    challenge_artifact_sha256: createHash('sha256')
      .update(challengeContent)
      .digest('hex'),
    projection_sha256: 'projection-sha',
    model_expansion_sha256: createHash('sha256')
      .update(
        readFileSync(
          `${cwd}/artifacts/iterations/ITER-0001/02-domain-model/model-expansions/US-001-SC-001.json`,
        ),
      )
      .digest('hex'),
    artifact_path: 'model-decision.json',
    decided_by: 'human' as const,
    decided_at: '2026-01-01T00:03:00.000Z',
  };
  write(cwd, modelDecision.artifact_path, JSON.stringify(modelDecision));
  writeState(cwd, {
    ...DEFAULT_STATE,
    loop: 'tasking',
    intake_snapshot: testIntakeSnapshot(),
    understand_stage: 'modeling',
    confirmed_scenarios: [
      {
        version: 1,
        story_id: 'US-001',
        scenario_id: 'SC-001',
        source_draft_id: 'DRAFT-001',
        title: 'Create a workspace',
        given: ['The owner has no workspace named Alpha'],
        when: 'The owner creates workspace Alpha',
        then: ['Workspace Alpha is available to the owner'],
        business_data: ['name=Alpha', 'owner=desktop-user'],
        artifact_path:
          'artifacts/iterations/ITER-0001/01-requirements/examples/US-001-SC-001.md',
        confirmed_by: 'human',
        confirmation_reason: 'This is the smallest valuable outcome.',
        confirmed_at: '2026-01-01T00:00:00.000Z',
      },
    ],
    modeling_stage: 'model_confirmed',
    modeling_profile: {
      version: 1,
      subject: 'domain',
      method: 'object',
      model_change_required: false,
      reason: 'Existing workspace model applies.',
      confirmed_by: 'human',
      confirmed_at: '2026-01-01T00:01:00.000Z',
    },
    model_expansion_path:
      'artifacts/iterations/ITER-0001/02-domain-model/model-expansions/US-001-SC-001.json',
    model_git_baseline: baseline,
    model_projection: {
      version: 1,
      model_sha256: 'projection-sha',
      mermaid_path: 'model.mmd',
      glossary_path: 'glossary.md',
      context_path: 'model-context.json',
      regression_ids: ['REG-001'],
      regression_failures: [],
      method_failures: [],
      generated_at: '2026-01-01T00:01:30.000Z',
    },
    model_challenges: [modelChallenge],
    model_decisions: [modelDecision],
    tasking_stage: 'drafting',
  });
}

function draftInput(
  outcome = 'Workspace Alpha is available to the owner',
): TaskingDraftInput {
  return {
    runtimes: [
      {
        id: 'RUNTIME-001',
        runtime: 'rust' as const,
        functionalContexts: ['workspace'],
        technicalBoundaries: ['rust-domain', 'axum-api'],
      },
    ],
    tests: [
      {
        id: 'TEST-001',
        quadrant: 'Q1' as const,
        intent: 'The owner receives the created workspace in the domain.',
        runtimePlanId: 'RUNTIME-001',
        stepId: 'domain-q1',
        testFilter: 'workspace_domain_alpha',
        supportedBy: [],
        scenarioIds: ['SC-001'],
        businessData: ['name=Alpha', 'owner=desktop-user'],
        modelRefs: { entities: ['workspace'], associations: [] },
      },
      {
        id: 'TEST-002',
        quadrant: 'Q2' as const,
        intent:
          'Creating Alpha returns an owner-visible workspace through Axum.',
        runtimePlanId: 'RUNTIME-001',
        stepId: 'api-q2',
        testFilter: 'workspace_api_alpha',
        supportedBy: ['TEST-001'],
        scenarioIds: ['SC-001'],
        scenarioOutcome: outcome,
        businessData: ['name=Alpha', 'owner=desktop-user'],
        modelRefs: { entities: ['workspace'], associations: [] },
      },
    ],
    tasks: [
      {
        id: 'TASK-001',
        description: 'Drive the workspace domain behavior from TEST-001.',
        testIds: ['TEST-001'],
        dependsOn: [],
      },
      {
        id: 'TASK-002',
        description: 'Expose the confirmed behavior through Axum for TEST-002.',
        testIds: ['TEST-002'],
        dependsOn: ['TASK-001'],
      },
    ],
  };
}

function webProcessDefinition() {
  const step = (id: string, quadrant: 'Q1' | 'Q2', roots: string[]) => ({
    id,
    purpose: `Drive ${id}.`,
    quadrant,
    functional_contexts: ['workspace'],
    real_boundaries: ['react-feature'],
    replaced_boundaries: [],
    nearest_test: { rule: 'Use the owning project test.', roots },
    focused_command: {
      template:
        'pnpm nx test {{project}} --run --testNamePattern={{test_filter}}',
      allowed_variables: ['project', 'test_filter'],
    },
    red: {
      expected_failure_kind: 'behavior',
      expected_failure: 'The selected behavior assertion fails.',
    },
    green: { done_when: 'The focused behavior passes.' },
    refactor: { done_when: 'The focused behavior remains green.' },
  });
  return {
    version: 3,
    id: 'typescript-web-projects',
    owner: 'web-platform',
    runtime: 'typescript',
    applies_to: {
      capabilities: ['workspace'],
      technical_boundaries: ['react-feature'],
      when: 'The Scenario belongs to Web.',
    },
    steps: [
      step('feature-q1', 'Q1', ['libs/web']),
      step('route-q2', 'Q2', ['apps/web/src']),
    ],
    quality_gates: [
      {
        scope: 'test_projects',
        required_target: 'test',
        template: 'pnpm nx test {{project}} --run',
        allowed_variables: ['project'],
      },
      {
        scope: 'planned_projects',
        required_target: 'typecheck',
        template: 'pnpm nx typecheck {{project}}',
        allowed_variables: ['project'],
      },
      {
        scope: 'planned_projects',
        required_target: 'lint',
        template: 'pnpm nx lint {{project}}',
        allowed_variables: ['project'],
      },
    ],
  };
}

function nestProcessDefinition() {
  const source = webProcessDefinition();
  const step = (
    id: string,
    quadrant: 'Q1' | 'Q2',
    roots: string[],
    boundary: string,
  ) => ({
    ...source.steps[0],
    id,
    quadrant,
    purpose: `Drive ${id}.`,
    real_boundaries: [boundary],
    nearest_test: { rule: 'Use the owning Nest test.', roots },
  });
  return {
    ...source,
    id: 'typescript-nest-projects',
    owner: 'server-platform',
    applies_to: {
      capabilities: ['workspace'],
      technical_boundaries: ['nest-domain', 'prisma-store', 'nest-api'],
      when: 'The Scenario belongs to Nest.',
    },
    steps: [
      step(
        'nest-domain-q1',
        'Q1',
        ['libs/server-nest/domain/src'],
        'nest-domain',
      ),
      step(
        'nest-persistent-q1',
        'Q1',
        ['libs/server-nest/persistent/src'],
        'prisma-store',
      ),
      step('nest-api-q2', 'Q2', ['apps/server-nest/src'], 'nest-api'),
    ],
  };
}

function projectCatalogLoader(projects: NxWorkspaceProject[]) {
  const catalog = createNxProjectCatalog(projects);
  return (_cwd: string, projectIds: string[]) => {
    const expected = catalog.projects.map(({ name }) => name);
    if (JSON.stringify([...projectIds].sort()) !== JSON.stringify(expected)) {
      throw new Error('Fixture project selection drifted.');
    }
    return catalog;
  };
}

function webProjectDraftInput(): TaskingDraftInput {
  return {
    runtimes: [
      {
        id: 'RUNTIME-001',
        runtime: 'typescript',
        functionalContexts: ['workspace'],
        technicalBoundaries: ['react-feature'],
        projectIds: [
          '@evidence/web-feature-diagrams',
          'api-client',
          '@evidence/web',
        ],
      },
    ],
    tests: [
      {
        id: 'TEST-001',
        quadrant: 'Q1',
        intent: 'The diagram feature exposes workspace Alpha.',
        runtimePlanId: 'RUNTIME-001',
        stepId: 'feature-q1',
        projectId: '@evidence/web-feature-diagrams',
        testFilter: 'diagram_workspace_alpha',
        supportedBy: [],
        scenarioIds: ['SC-001'],
        businessData: ['name=Alpha', 'owner=desktop-user'],
        modelRefs: { entities: ['workspace'], associations: [] },
      },
      {
        id: 'TEST-002',
        quadrant: 'Q1',
        intent: 'The API client maps workspace Alpha.',
        runtimePlanId: 'RUNTIME-001',
        stepId: 'feature-q1',
        projectId: 'api-client',
        testFilter: 'api_workspace_alpha',
        supportedBy: [],
        scenarioIds: ['SC-001'],
        businessData: ['name=Alpha', 'owner=desktop-user'],
        modelRefs: { entities: ['workspace'], associations: [] },
      },
      {
        id: 'TEST-003',
        quadrant: 'Q2',
        intent: 'The Web route shows workspace Alpha.',
        runtimePlanId: 'RUNTIME-001',
        stepId: 'route-q2',
        projectId: '@evidence/web',
        testFilter: 'route_workspace_alpha',
        supportedBy: ['TEST-001', 'TEST-002'],
        scenarioIds: ['SC-001'],
        scenarioOutcome: 'Workspace Alpha is available to the owner',
        businessData: ['name=Alpha', 'owner=desktop-user'],
        modelRefs: { entities: ['workspace'], associations: [] },
      },
    ],
    tasks: [
      {
        id: 'TASK-001',
        description: 'Drive Web library support.',
        testIds: ['TEST-001', 'TEST-002'],
        dependsOn: [],
      },
      {
        id: 'TASK-002',
        description: 'Confirm Web route composition.',
        testIds: ['TEST-003'],
        dependsOn: ['TASK-001'],
      },
    ],
  };
}

const webProjects: NxWorkspaceProject[] = [
  {
    name: '@evidence/web-feature-diagrams',
    root: 'libs/web/web-feature-diagrams',
    sourceRoot: 'libs/web/web-feature-diagrams/src',
    targetNames: ['test', 'typecheck', 'lint'],
  },
  {
    name: 'api-client',
    root: 'libs/web/api-client',
    sourceRoot: 'libs/web/api-client/src',
    targetNames: ['test', 'typecheck', 'lint'],
  },
  {
    name: '@evidence/web',
    root: 'apps/web',
    sourceRoot: 'apps/web/src',
    targetNames: ['test', 'typecheck', 'lint'],
  },
];

describe('Tasking and Desk Check', () => {
  it('builds one deduplicated plan that covers every Scenario outcome', () => {
    const cwd = workspace();
    prepare(cwd);
    const current = readState(cwd);
    const first = current.confirmed_scenarios?.[0];
    if (!first) throw new Error('Fixture Scenario is missing.');
    writeState(cwd, {
      ...current,
      confirmed_scenarios: [
        first,
        {
          ...first,
          scenario_id: 'SC-002',
          source_draft_id: 'DRAFT-002',
          title: 'Reject a duplicate workspace',
          when: 'The owner creates another workspace named Alpha',
          then: ['The duplicate workspace name is rejected'],
          artifact_path:
            'artifacts/iterations/ITER-0001/01-requirements/examples/US-001-SC-002.md',
        },
      ],
    });
    const input = draftInput();
    const q1 = input.tests[0];
    const q2 = input.tests[1];
    if (!q1 || !q2) throw new Error('Fixture tests are missing.');
    q1.scenarioIds = ['SC-001', 'SC-002'];
    q2.scenarioIds = ['SC-001'];
    input.tests.push({
      ...q2,
      id: 'TEST-003',
      intent: 'Creating duplicate Alpha is rejected through Axum.',
      scenarioIds: ['SC-002'],
      scenarioOutcome: 'The duplicate workspace name is rejected',
    });
    input.tasks.push({
      id: 'TASK-003',
      description: 'Confirm duplicate rejection through Axum.',
      testIds: ['TEST-003'],
      dependsOn: ['TASK-002'],
    });

    const state = proposeTaskingDraft(cwd, input);

    expect(state.tasking_candidate?.scenario_ids).toEqual(['SC-001', 'SC-002']);
    expect(state.tasking_candidate?.tests).toHaveLength(3);
    expect(
      state.tasking_candidate?.tests.find(({ id }) => id === 'TEST-001')
        ?.scenario_ids,
    ).toEqual(['SC-001', 'SC-002']);
  });

  it('tasks and approves a human-confirmed no-model-impact Story', () => {
    const cwd = workspace();
    prepare(cwd);
    const prepared = readState(cwd);
    writeState(cwd, {
      ...prepared,
      loop: 'understand',
      understand_stage: 'modeling',
      modeling_stage: 'expansion',
      modeling_profile: {
        version: 1,
        subject: 'tool',
        method: 'none',
        model_change_required: false,
        reason:
          'The Story changes product behavior without canonical semantics.',
        confirmed_by: 'human',
        confirmed_at: '2026-01-01T00:01:00.000Z',
      },
      model_expansion_path: undefined,
      model_git_baseline: undefined,
      model_change_proposal: undefined,
      model_change_application: undefined,
      model_projection: undefined,
      model_challenges: undefined,
      model_decisions: undefined,
      tasking_stage: undefined,
    });

    const routed = completeNoModelImpact(cwd, readState(cwd));
    const input = draftInput();
    const noModelInput = {
      ...input,
      tests: input.tests.map((test) => ({
        ...test,
        modelRefs: { entities: [], associations: [] },
      })),
    };
    proposeTaskingDraft(cwd, noModelInput);
    const approved = decideTasking(cwd, 'approve');

    expect(routed).toMatchObject({
      loop: 'tasking',
      modeling_stage: 'model_confirmed',
      tasking_stage: 'drafting',
    });
    expect(approved).toMatchObject({
      loop: 'pair',
      tasking_stage: 'approved',
    });
    expect(approved.model_change_application).toBeUndefined();
    expect(approved.desk_check_decisions?.at(-1)).not.toHaveProperty('reason');
    const approvedPlan = JSON.parse(
      readFileSync(`${cwd}/${approved.approved_test_plan_path}`, 'utf8'),
    ) as Record<string, unknown>;
    expect(approvedPlan).not.toHaveProperty('approval_reason');
  });

  it('requires human approval, supports edited-list regeneration, and locks the v3 process plan', () => {
    const cwd = workspace();
    prepare(cwd);

    const draft = proposeTaskingDraft(cwd, draftInput());

    expect(draft.tasking_stage).toBe('desk_check');
    expect(() => prepareActivityRun(cwd)).toThrow('/evidence-desk-check');
    expect(statusMarkdown(cwd)).toContain('human:/evidence-desk-check');
    expect(
      readFileSync(`${cwd}/${draft.tasking_candidate?.test_list_path}`, 'utf8'),
    ).toContain('Workspace Alpha is available to the owner');
    expect(() => transitionLoopState(draft, { to: 'pair' })).toThrow(
      'human-approved Desk Check',
    );
    write(
      cwd,
      'artifacts/iterations/ITER-0001/04-planning/test-list.md',
      '# Human edited test list\n',
    );
    expect(() =>
      decideTasking(cwd, 'approve', 'The trace is correct.'),
    ).toThrow('must be regenerated');
    decideTasking(cwd, 'revise', 'Use the human-edited acceptance wording.');
    const regenerated = proposeTaskingDraft(cwd, draftInput());
    expect(regenerated.tasking_candidate?.draft_id).toBe('DRAFT-002');

    const approved = decideTasking(
      cwd,
      'approve',
      'Q2, Q1, boundaries, and task order are accurate.',
      '2026-01-01T00:05:00.000Z',
    );

    expect(approved).toMatchObject({
      loop: 'pair',
      tasking_stage: 'approved',
      active_work_item: {
        story_id: 'US-001',
        scenario_ids: ['SC-001'],
        test_plan: {
          version: 2,
          processes: [
            {
              id: 'rust-workspace',
              definition_sha256: expect.any(String),
              process_version: 3,
              focused_commands: [
                {
                  test_id: 'TEST-001',
                  step_id: 'domain-q1',
                  command: 'node focused.js workspace_domain_alpha',
                },
                {
                  test_id: 'TEST-002',
                  step_id: 'api-q2',
                  command: 'node focused.js workspace_api_alpha',
                },
              ],
              quality_gate_commands: [{ command: 'node quality.js' }],
            },
          ],
        },
      },
    });
    const approvedPlanPath = `${cwd}/artifacts/iterations/ITER-0001/04-planning/test-plan.json`;
    expect(existsSync(approvedPlanPath)).toBe(true);
    const approvedPlan = JSON.parse(readFileSync(approvedPlanPath, 'utf8')) as {
      execution_budget: Record<string, unknown>;
    };
    expect(approvedPlan.execution_budget).toEqual(
      approved.pair_session?.execution_budget,
    );
    expect(approved.pair_session?.execution_budget).toMatchObject({
      expected_pair_agent_calls: 8,
      max_pair_agent_calls: null,
      emergency_max_checkpoints: 200,
      max_retries_per_failure_fingerprint: 2,
      max_no_progress_checkpoints: null,
      activity_timeout_ms: 900_000,
      command_timeout_ms: 600_000,
      approved_at: '2026-01-01T00:05:00.000Z',
    });
    const lockedBudget = approved.pair_session?.execution_budget;
    write(
      cwd,
      'engineering/evidence-orchestrator/execution-budget.json',
      JSON.stringify({ version: 1, drifted: true }),
    );
    expect(readState(cwd).pair_session?.execution_budget).toEqual(lockedBudget);
    expect(buildActivityTask(cwd)).toContain(
      '一个且仅一个 Test Driver checkpoint',
    );
    expect(
      existsSync(
        `${cwd}/artifacts/iterations/ITER-0001/03-architecture/selected-test-processes/rust-workspace.json`,
      ),
    ).toBe(true);
    write(cwd, 'focused.js', 'process.exit(1);');
    expect(
      executeTestStep(cwd, {
        processId: 'rust-workspace',
        stage: 'red',
        stepId: 'domain-q1',
        taskId: 'TASK-001',
        testId: 'TEST-001',
        command: 'node focused.js workspace_domain_alpha',
      }).expected_failure,
    ).toBe(true);
  });

  it('blocks Desk Check when the human-confirmed model expansion drifts', () => {
    const cwd = workspace();
    prepare(cwd);
    proposeTaskingDraft(cwd, draftInput());
    write(
      cwd,
      'artifacts/iterations/ITER-0001/02-domain-model/model-expansions/US-001-SC-001.json',
      JSON.stringify({
        model_refs: { entities: ['workspace', 'unreviewed'], associations: [] },
      }),
    );

    expect(() =>
      decideTasking(cwd, 'approve', 'The visible list appears correct.'),
    ).toThrow('model decision or its reviewed evidence drifted');
  });

  it('applies a human-confirmed model proposal on the Desk-Checked Pair baseline', () => {
    const cwd = workspace();
    prepare(cwd);
    write(cwd, '.evidence/model.json', JSON.stringify({ version: 1 }));
    write(
      cwd,
      '.evidence/entities/workspace.yaml',
      'id: workspace\nname: Workspace\ntype: CONTEXT\nsubType: bounded_context\n',
    );
    execFileSync('git', ['add', '.'], { cwd });
    execFileSync(
      'git',
      [
        '-c',
        'user.name=Evidence Orchestrator Test',
        '-c',
        'user.email=workflow@example.test',
        'commit',
        '--quiet',
        '-m',
        'model proposal baseline',
      ],
      { cwd },
    );
    const baseline = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd,
      encoding: 'utf8',
    }).trim();
    const proposalPath =
      'artifacts/iterations/ITER-0001/02-domain-model/model-change-proposal.json';
    const operation = {
      action: 'add' as const,
      kind: 'entity' as const,
      id: 'model-version',
      path: '.evidence/entities/model-version.yaml',
      content:
        'id: model-version\nname: ModelVersion\ntype: EVIDENCE\nsubType: other_evidence\n',
    };
    const proposal = {
      version: 1 as const,
      story_id: 'US-001',
      scenario_ids: ['SC-001'],
      git_baseline: baseline,
      reason: 'The Scenario needs an explicit model version.',
      operations: [operation],
      artifact_path: proposalPath,
      proposed_at: '2026-01-01T00:02:30.000Z',
    };
    write(cwd, proposalPath, `${JSON.stringify(proposal, null, 2)}\n`);
    write(
      cwd,
      'artifacts/iterations/ITER-0001/02-domain-model/model-expansions/US-001-SC-001.json',
      JSON.stringify({
        model_refs: {
          entities: ['workspace', 'model-version'],
          associations: [],
        },
      }),
    );
    const prepared = readState(cwd);
    const decisions = prepared.model_decisions?.map((decision, index, all) =>
      index === all.length - 1
        ? {
            ...decision,
            model_expansion_sha256: createHash('sha256')
              .update(
                readFileSync(
                  `${cwd}/artifacts/iterations/ITER-0001/02-domain-model/model-expansions/US-001-SC-001.json`,
                ),
              )
              .digest('hex'),
            model_change_proposal_sha256: createHash('sha256')
              .update(`${JSON.stringify(proposal, null, 2)}\n`)
              .digest('hex'),
          }
        : decision,
    );
    const latestDecision = decisions?.at(-1);
    if (!latestDecision) throw new Error('Missing model decision fixture.');
    write(cwd, latestDecision.artifact_path, JSON.stringify(latestDecision));
    writeState(cwd, {
      ...prepared,
      model_git_baseline: baseline,
      modeling_profile: prepared.modeling_profile
        ? { ...prepared.modeling_profile, model_change_required: true }
        : undefined,
      model_change_proposal: proposal,
      model_decisions: decisions,
    });
    const input = draftInput();
    input.tests = input.tests.map((test) => ({
      ...test,
      modelRefs: {
        entities: ['workspace', 'model-version'],
        associations: [],
      },
    }));
    proposeTaskingDraft(cwd, input);

    const approved = decideTasking(
      cwd,
      'approve',
      'The test, task, model, and process trace is correct.',
      '2026-01-01T00:04:00.000Z',
    );

    expect(existsSync(`${cwd}/.evidence/entities/model-version.yaml`)).toBe(
      true,
    );
    expect(approved.model_change_application).toEqual({
      git_baseline: baseline,
      changed_paths: ['.evidence/entities/model-version.yaml'],
      applied_at: '2026-01-01T00:04:00.000Z',
    });
    expect(approved.active_work_item?.git_baseline).toBe(baseline);
  });

  it('versions immutable approved plans after feedback returns to Tasking', () => {
    const cwd = workspace();
    prepare(cwd);
    proposeTaskingDraft(cwd, draftInput());
    const first = decideTasking(cwd, 'approve', 'Initial plan is approved.');
    writeState(cwd, {
      ...first,
      loop: 'tasking',
      tasking_stage: 'drafting',
      tasking_candidate: undefined,
      approved_test_plan_path: undefined,
      approved_test_plan_sha256: undefined,
      active_work_item: undefined,
      pair_session: undefined,
      feedback_history: [
        ...(first.feedback_history ?? []),
        {
          target: 'test_process',
          from_loop: 'showcase',
          to_loop: 'tasking',
          reason: 'The focused filter must change.',
          decided_by: 'human',
          recorded_at: '2026-01-02T00:00:00.000Z',
        },
      ],
    });
    const revisedInput = draftInput();
    const revisedTest = revisedInput.tests[0];
    if (!revisedTest) throw new Error('Missing revised TEST fixture.');
    revisedTest.testFilter = 'workspace_revised';
    proposeTaskingDraft(cwd, revisedInput);

    const revised = decideTasking(
      cwd,
      'approve',
      'The revised focused process is approved.',
    );

    expect(revised.approved_test_plan_path).toContain(
      'US-001-DRAFT-002.approved.json',
    );
    expect(
      revised.active_work_item?.test_plan?.processes[0]?.materialized_plan_path,
    ).toContain('US-001-DRAFT-002-rust-workspace.json');
    expect(
      existsSync(
        `${cwd}/artifacts/iterations/ITER-0001/04-planning/test-plan.json`,
      ),
    ).toBe(true);
  });

  it('routes a Scenario gap back to Understand', () => {
    const cwd = workspace();
    prepare(cwd);
    proposeTaskingDraft(cwd, draftInput());

    const state = decideTasking(
      cwd,
      'scenario_gap',
      'The actor authorized to create Alpha is still unclear.',
    );

    expect(state).toMatchObject({
      loop: 'understand',
      understand_stage: 'tqa',
      active_clarification_story: { story_id: 'US-001' },
    });
    expect(state.confirmed_scenarios).toBeUndefined();
    expect(state.feedback_history?.at(-1)).toMatchObject({
      target: 'scenario',
      decided_by: 'human',
    });
  });

  it.each([
    ['architecture_gap', 'architecture'],
    ['process_gap', 'test_process'],
  ] as const)(
    'keeps %s in the Tasking learning branch',
    (action, feedbackTarget) => {
      const cwd = workspace();
      prepare(cwd);
      proposeTaskingDraft(cwd, draftInput());

      const state = decideTasking(
        cwd,
        action,
        'The selected boundary hides an integration risk.',
      );

      expect(state).toMatchObject({
        loop: 'tasking',
        tasking_stage: 'knowledge_gap',
        tasking_gap: { kind: action },
      });
      expect(state.feedback_history?.at(-1)).toMatchObject({
        target: feedbackTarget,
        to_loop: 'tasking',
      });
    },
  );

  it('locks each Web TEST to its owning Nx project and complete project gates', () => {
    const cwd = workspace();
    prepare(cwd);
    write(
      cwd,
      'engineering/evidence-orchestrator/test-processes/web.json',
      JSON.stringify(webProcessDefinition()),
    );

    const draft = proposeTaskingDraft(
      cwd,
      webProjectDraftInput(),
      '2026-01-01T00:04:00.000Z',
      projectCatalogLoader(webProjects),
    );
    const process = draft.tasking_candidate?.processes[0];

    expect(process).toMatchObject({
      process_version: 3,
      project_ids: [
        '@evidence/web',
        '@evidence/web-feature-diagrams',
        'api-client',
      ],
      focused_commands: [
        {
          test_id: 'TEST-001',
          project_id: '@evidence/web-feature-diagrams',
          command:
            'pnpm nx test @evidence/web-feature-diagrams --run --testNamePattern=diagram_workspace_alpha',
        },
        {
          test_id: 'TEST-002',
          project_id: 'api-client',
          command:
            'pnpm nx test api-client --run --testNamePattern=api_workspace_alpha',
        },
        {
          test_id: 'TEST-003',
          project_id: '@evidence/web',
          command:
            'pnpm nx test @evidence/web --run --testNamePattern=route_workspace_alpha',
        },
      ],
    });
    expect(process?.quality_gate_commands).toHaveLength(9);
    expect(process?.quality_gate_commands).toEqual(
      expect.arrayContaining([
        {
          project_id: 'api-client',
          target: 'test',
          command: 'pnpm nx test api-client --run',
        },
        {
          project_id: '@evidence/web-feature-diagrams',
          target: 'typecheck',
          command: 'pnpm nx typecheck @evidence/web-feature-diagrams',
        },
        {
          project_id: '@evidence/web',
          target: 'lint',
          command: 'pnpm nx lint @evidence/web',
        },
      ]),
    );

    const approved = decideTasking(
      cwd,
      'approve',
      'Every TEST owner and final gate is explicit.',
      '2026-01-01T00:05:00.000Z',
      projectCatalogLoader(webProjects),
    );
    const locked = approved.active_work_item?.test_plan.processes[0];
    expect(locked?.project_catalog_path).toContain(
      '03-architecture/project-catalogs',
    );
    expect(existsSync(`${cwd}/${locked?.project_catalog_path}`)).toBe(true);
  });

  it('binds Nest domain, persistence, and app tests without testing the API library project', () => {
    const cwd = workspace();
    prepare(cwd);
    write(
      cwd,
      'engineering/evidence-orchestrator/test-processes/nest.json',
      JSON.stringify(nestProcessDefinition()),
    );
    const projects: NxWorkspaceProject[] = [
      {
        name: '@evidence/server-nest-domain',
        root: 'libs/server-nest/domain',
        targetNames: ['test', 'typecheck', 'lint'],
      },
      {
        name: '@evidence/server-nest-persistent',
        root: 'libs/server-nest/persistent',
        targetNames: ['test', 'typecheck', 'lint'],
      },
      {
        name: '@evidence/server-nest',
        root: 'apps/server-nest',
        targetNames: ['test', 'typecheck', 'lint'],
      },
      {
        name: '@evidence/server-nest-api',
        root: 'libs/server-nest/api',
        targetNames: ['typecheck', 'lint'],
      },
    ];
    const input: TaskingDraftInput = {
      runtimes: [
        {
          id: 'RUNTIME-001',
          runtime: 'typescript',
          functionalContexts: ['workspace'],
          technicalBoundaries: ['nest-domain', 'prisma-store', 'nest-api'],
          projectIds: projects.map(({ name }) => name),
        },
      ],
      tests: [
        {
          id: 'TEST-001',
          quadrant: 'Q1',
          intent: 'The Nest domain creates workspace Alpha.',
          runtimePlanId: 'RUNTIME-001',
          stepId: 'nest-domain-q1',
          projectId: '@evidence/server-nest-domain',
          testFilter: 'nest_domain_alpha',
          supportedBy: [],
          scenarioIds: ['SC-001'],
          businessData: ['name=Alpha', 'owner=desktop-user'],
          modelRefs: { entities: ['workspace'], associations: [] },
        },
        {
          id: 'TEST-002',
          quadrant: 'Q1',
          intent: 'The Nest store retains workspace Alpha.',
          runtimePlanId: 'RUNTIME-001',
          stepId: 'nest-persistent-q1',
          projectId: '@evidence/server-nest-persistent',
          testFilter: 'nest_store_alpha',
          supportedBy: [],
          scenarioIds: ['SC-001'],
          businessData: ['name=Alpha', 'owner=desktop-user'],
          modelRefs: { entities: ['workspace'], associations: [] },
        },
        {
          id: 'TEST-003',
          quadrant: 'Q2',
          intent: 'The Nest app returns workspace Alpha.',
          runtimePlanId: 'RUNTIME-001',
          stepId: 'nest-api-q2',
          projectId: '@evidence/server-nest',
          testFilter: 'nest_api_alpha',
          supportedBy: ['TEST-001', 'TEST-002'],
          scenarioIds: ['SC-001'],
          scenarioOutcome: 'Workspace Alpha is available to the owner',
          businessData: ['name=Alpha', 'owner=desktop-user'],
          modelRefs: { entities: ['workspace'], associations: [] },
        },
      ],
      tasks: [
        {
          id: 'TASK-001',
          description: 'Drive the Nest domain.',
          testIds: ['TEST-001'],
          dependsOn: [],
        },
        {
          id: 'TASK-002',
          description: 'Drive Nest persistence.',
          testIds: ['TEST-002'],
          dependsOn: ['TASK-001'],
        },
        {
          id: 'TASK-003',
          description: 'Confirm Nest API composition.',
          testIds: ['TEST-003'],
          dependsOn: ['TASK-002'],
        },
      ],
    };

    const draft = proposeTaskingDraft(
      cwd,
      input,
      '2026-01-01T00:04:00.000Z',
      projectCatalogLoader(projects),
    );
    const gates = draft.tasking_candidate?.processes[0]?.quality_gate_commands;
    expect(gates).toHaveLength(11);
    expect(gates).toContainEqual({
      project_id: '@evidence/server-nest',
      target: 'test',
      command: 'pnpm nx test @evidence/server-nest --run',
    });
    expect(gates).not.toContainEqual(
      expect.objectContaining({
        project_id: '@evidence/server-nest-api',
        target: 'test',
      }),
    );
    expect(gates).toContainEqual({
      project_id: '@evidence/server-nest-api',
      target: 'typecheck',
      command: 'pnpm nx typecheck @evidence/server-nest-api',
    });

    const invalidCwd = workspace();
    prepare(invalidCwd);
    write(
      invalidCwd,
      'engineering/evidence-orchestrator/test-processes/nest.json',
      JSON.stringify(nestProcessDefinition()),
    );
    const invalid = structuredClone(input);
    const q2 = invalid.tests.find(({ quadrant }) => quadrant === 'Q2');
    if (!q2) throw new Error('Missing Nest Q2 fixture.');
    q2.projectId = '@evidence/server-nest-api';
    expect(
      proposeTaskingDraft(
        invalidCwd,
        invalid,
        '2026-01-01T00:04:00.000Z',
        projectCatalogLoader(projects),
      ),
    ).toMatchObject({
      tasking_stage: 'knowledge_gap',
      tasking_gap: {
        kind: 'process_gap',
        reason: expect.stringContaining('has no test target'),
      },
    });
  });

  it('rejects Desk Check when the resolved Nx catalog drifts', () => {
    const cwd = workspace();
    prepare(cwd);
    write(
      cwd,
      'engineering/evidence-orchestrator/test-processes/web.json',
      JSON.stringify(webProcessDefinition()),
    );
    proposeTaskingDraft(
      cwd,
      webProjectDraftInput(),
      '2026-01-01T00:04:00.000Z',
      projectCatalogLoader(webProjects),
    );
    const drifted = webProjects.map((project) =>
      project.name === 'api-client'
        ? { ...project, targetNames: [...project.targetNames, 'build'] }
        : project,
    );

    expect(() =>
      decideTasking(
        cwd,
        'approve',
        'The visible draft is unchanged.',
        '2026-01-01T00:05:00.000Z',
        projectCatalogLoader(drifted),
      ),
    ).toThrow('Nx project catalog drifted before Desk Check');
  });

  it('routes zero or multiple process matches instead of guessing', () => {
    const zeroCwd = workspace();
    prepare(zeroCwd);
    const zeroInput = draftInput();
    zeroInput.runtimes[0].functionalContexts = ['logical-model'];

    expect(proposeTaskingDraft(zeroCwd, zeroInput)).toMatchObject({
      tasking_stage: 'knowledge_gap',
      tasking_gap: { kind: 'process_gap' },
    });

    const multipleCwd = workspace();
    prepare(multipleCwd);
    write(
      multipleCwd,
      'engineering/evidence-orchestrator/test-processes/rust-copy.json',
      JSON.stringify(processDefinition('rust-workspace-copy')),
    );
    expect(proposeTaskingDraft(multipleCwd, draftInput())).toMatchObject({
      tasking_stage: 'knowledge_gap',
      tasking_gap: {
        kind: 'process_gap',
        reason: expect.stringContaining('Multiple v3 test processes'),
      },
    });
  });

  it('rejects tests inferred from an outcome outside the confirmed Scenario', () => {
    const cwd = workspace();
    prepare(cwd);

    expect(() =>
      proposeTaskingDraft(cwd, draftInput('A non-goal feature is absent')),
    ).toThrow('outcome outside its confirmed Scenarios');
  });
});
