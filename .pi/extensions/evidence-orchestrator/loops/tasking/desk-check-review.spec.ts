import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { completeNoModelImpact } from '../../capabilities/modeling-evidence/no-model-impact';
import {
  createNxProjectCatalog,
  type NxWorkspaceProject,
} from '../../capabilities/test-process/project-catalog';
import { DEFAULT_STATE } from '../../iteration/default-state';
import { readState, writeState } from '../../iteration/state-repository';
import {
  cleanupWorkspaces,
  initializeGitRepository,
  TEST_EXECUTION_BUDGET_POLICY,
  testIntakeSnapshot,
  workspace,
  write,
} from '../../test-support/support';
import { proposeTaskingDraft, type TaskingDraftInput } from './tasking-draft';
import {
  assertDeskCheckApprovalReady,
  inspectDeskCheck,
  type ProjectCatalogLoader,
} from './desk-check-review';

afterEach(cleanupWorkspaces);

function processDefinition(options: { nx?: boolean } = {}) {
  const focused = options.nx
    ? 'pnpm nx test {{project}} --run --testNamePattern={{test_filter}}'
    : 'node focused.js {{test_filter}}';
  const allowedVariables = options.nx
    ? ['project', 'test_filter']
    : ['test_filter'];
  const step = (id: string, quadrant: 'Q1' | 'Q2') => ({
    id,
    purpose: `Drive ${id}.`,
    quadrant,
    functional_contexts: ['workspace'],
    real_boundaries: [options.nx ? 'react-feature' : 'rust-domain'],
    replaced_boundaries: [],
    nearest_test: {
      rule: 'Use the nearest behavior test.',
      roots: [options.nx ? 'apps/web/src' : 'domain'],
    },
    focused_command: {
      template: focused,
      allowed_variables: allowedVariables,
    },
    red: {
      expected_failure_kind: 'behavior',
      expected_failure: 'The behavior assertion fails.',
    },
    green: { done_when: 'The behavior assertion passes.' },
    refactor: { done_when: 'The behavior remains green.' },
  });
  return {
    version: 3,
    id: options.nx ? 'typescript-web' : 'rust-workspace',
    owner: options.nx ? 'web-platform' : 'server-platform',
    runtime: options.nx ? 'typescript' : 'rust',
    applies_to: {
      capabilities: ['workspace'],
      technical_boundaries: [options.nx ? 'react-feature' : 'rust-domain'],
      when: 'A workspace Scenario uses this runtime.',
    },
    steps: [step('domain-q1', 'Q1'), step('acceptance-q2', 'Q2')],
    quality_gates: options.nx
      ? [
          {
            scope: 'planned_projects',
            required_target: 'test',
            template: 'pnpm nx test {{project}} --run',
            allowed_variables: ['project'],
          },
        ]
      : [
          {
            scope: 'process',
            template: 'node quality.js',
            allowed_variables: [],
          },
        ],
  };
}

function draftInput(options: { nx?: boolean } = {}): TaskingDraftInput {
  const projectId = options.nx ? '@evidence/web' : undefined;
  return {
    runtimes: [
      {
        id: 'RUNTIME-001',
        runtime: options.nx ? 'typescript' : 'rust',
        functionalContexts: ['workspace'],
        technicalBoundaries: [options.nx ? 'react-feature' : 'rust-domain'],
        ...(projectId ? { projectIds: [projectId] } : {}),
      },
    ],
    tests: [
      {
        id: 'TEST-001',
        quadrant: 'Q1',
        intent: 'The owner receives workspace Alpha in the domain.',
        runtimePlanId: 'RUNTIME-001',
        stepId: 'domain-q1',
        ...(projectId ? { projectId } : {}),
        testFilter: 'workspace_domain_alpha',
        supportedBy: [],
        scenarioIds: ['SC-001'],
        businessData: ['name=Alpha', 'owner=desktop-user'],
        modelRefs: { entities: [], associations: [] },
      },
      {
        id: 'TEST-002',
        quadrant: 'Q2',
        intent: 'Creating Alpha exposes an owner-visible workspace.',
        runtimePlanId: 'RUNTIME-001',
        stepId: 'acceptance-q2',
        ...(projectId ? { projectId } : {}),
        testFilter: 'workspace_acceptance_alpha',
        supportedBy: ['TEST-001'],
        scenarioIds: ['SC-001'],
        scenarioOutcome: 'Workspace Alpha is available to the owner',
        businessData: ['name=Alpha', 'owner=desktop-user'],
        modelRefs: { entities: [], associations: [] },
      },
    ],
    tasks: [
      {
        id: 'TASK-001',
        description: 'Drive workspace domain behavior.',
        testIds: ['TEST-001'],
        dependsOn: [],
      },
      {
        id: 'TASK-002',
        description: 'Confirm the owner-visible acceptance behavior.',
        testIds: ['TEST-002'],
        dependsOn: ['TASK-001'],
      },
    ],
  };
}

function prepareDeskCheck(
  cwd: string,
  options: { nx?: boolean; loadProjectCatalog?: ProjectCatalogLoader } = {},
): void {
  initializeGitRepository(cwd);
  const scenarioPath =
    'artifacts/iterations/ITER-0001/01-requirements/examples/US-001-SC-001.md';
  write(cwd, scenarioPath, '# Create workspace Alpha\n');
  writeState(cwd, {
    ...DEFAULT_STATE,
    loop: 'understand',
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
        artifact_path: scenarioPath,
        confirmed_by: 'human',
        confirmation_reason: 'This is the smallest valuable outcome.',
        confirmed_at: '2026-01-01T00:00:00.000Z',
      },
    ],
    modeling_stage: 'expansion',
    modeling_profile: {
      version: 1,
      subject: 'tool',
      method: 'none',
      model_change_required: false,
      reason: 'The Story does not change canonical semantics.',
      confirmed_by: 'human',
      confirmed_at: '2026-01-01T00:01:00.000Z',
    },
  });
  completeNoModelImpact(cwd, readState(cwd));
  const processPath = options.nx
    ? 'engineering/evidence-orchestrator/test-processes/web.json'
    : 'engineering/evidence-orchestrator/test-processes/rust.json';
  write(cwd, processPath, JSON.stringify(processDefinition(options)));
  proposeTaskingDraft(
    cwd,
    draftInput(options),
    '2026-01-01T00:02:00.000Z',
    options.loadProjectCatalog,
  );
}

function repositorySnapshot(cwd: string): string {
  const files: string[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory)) {
      if (entry === '.git') continue;
      const path = join(directory, entry);
      if (statSync(path).isDirectory()) visit(path);
      else files.push(path);
    }
  };
  visit(cwd);
  return files
    .sort()
    .map((path) => {
      const sha256 = createHash('sha256')
        .update(readFileSync(path))
        .digest('hex');
      return `${relative(cwd, path)}:${sha256}`;
    })
    .join('\n');
}

function projectCatalogLoader(
  projects: NxWorkspaceProject[],
): ProjectCatalogLoader {
  const catalog = createNxProjectCatalog(projects);
  return () => catalog;
}

const webProjects: NxWorkspaceProject[] = [
  {
    name: '@evidence/web',
    root: 'apps/web',
    sourceRoot: 'apps/web/src',
    targetNames: ['test'],
  },
];

describe('Desk Check review', () => {
  it('projects the complete approval boundary and reusable preflight values', () => {
    const cwd = workspace();
    prepareDeskCheck(cwd);

    const review = inspectDeskCheck(cwd);
    const repeated = inspectDeskCheck(cwd);
    const preflight = assertDeskCheckApprovalReady(cwd);

    expect(review).toMatchObject({
      version: 1,
      iteration_id: 'ITER-0001',
      story_id: 'US-001',
      scenario_ids: ['SC-001'],
      draft_id: 'DRAFT-001',
      model: {
        profile: 'tool/none',
        model_change_required: false,
      },
      traceability: {
        scenario_outcome_count: 1,
        q1_count: 1,
        q2_count: 1,
        test_count: 2,
        task_count: 2,
        every_then_has_q2: true,
        every_test_has_one_task: true,
      },
      processes: [
        {
          id: 'rust-workspace',
          runtime: 'rust',
          process_version: 3,
          selected_step_ids: ['domain-q1', 'acceptance-q2'],
          focused_command_count: 2,
          quality_gate_count: 1,
        },
      ],
      budget_preview: {
        mode: 'shadow',
        expected_pair_agent_calls: 8,
        max_pair_agent_calls: null,
      },
    });
    expect(review.checks.map(({ id, status }) => [id, status])).toEqual([
      ['candidate', 'pass'],
      ['model', 'pass'],
      ['git_baseline', 'pass'],
      ['budget_policy', 'warning'],
    ]);
    expect(review.subject_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(repeated.subject_sha256).toBe(review.subject_sha256);
    expect(review.evidence_refs.map(({ label }) => label)).toEqual(
      expect.arrayContaining([
        'Tasking candidate',
        'Test list',
        'Task list',
        'Scenario SC-001',
        'Model expansion',
        'Process rust-workspace',
        'Execution budget policy',
      ]),
    );
    expect(preflight.git_baseline).toHaveLength(40);
    expect(preflight.budget_preview).toEqual(review.budget_preview);
  });

  it('does not write files or workflow state while inspecting', () => {
    const cwd = workspace();
    prepareDeskCheck(cwd);
    const beforeFiles = repositorySnapshot(cwd);
    const beforeState = JSON.stringify(readState(cwd));

    inspectDeskCheck(cwd);

    expect(repositorySnapshot(cwd)).toBe(beforeFiles);
    expect(JSON.stringify(readState(cwd))).toBe(beforeState);
  });

  it.each([
    [
      'test list',
      (cwd: string) =>
        write(
          cwd,
          'artifacts/iterations/ITER-0001/04-planning/test-list.md',
          '# Human edit\n',
        ),
      'candidate',
      'must be regenerated',
    ],
    [
      'process definition',
      (cwd: string) =>
        write(
          cwd,
          'engineering/evidence-orchestrator/test-processes/rust.json',
          JSON.stringify({ ...processDefinition(), owner: 'other-owner' }),
        ),
      'candidate',
      'definition drifted',
    ],
    [
      'model evidence',
      (cwd: string) => {
        const path = readState(cwd).model_expansion_path;
        if (!path) throw new Error('Missing no-model evidence fixture.');
        write(cwd, path, JSON.stringify({ drifted: true }));
      },
      'model',
      'no-model-impact decision drifted',
    ],
  ])(
    'turns %s drift into a visible blocker and keeps approval fail-closed',
    (_name, mutate, checkId, message) => {
      const cwd = workspace();
      prepareDeskCheck(cwd);
      mutate(cwd);

      expect(inspectDeskCheck(cwd).checks).toContainEqual(
        expect.objectContaining({ id: checkId, status: 'blocked' }),
      );
      expect(() => assertDeskCheckApprovalReady(cwd)).toThrow(message);
    },
  );

  it('blocks a dirty coding baseline without hiding other review facts', () => {
    const cwd = workspace();
    prepareDeskCheck(cwd);
    write(cwd, 'apps/web/src/pre-existing.ts', 'export const dirty = true;\n');

    const review = inspectDeskCheck(cwd);

    expect(review.traceability.every_then_has_q2).toBe(true);
    expect(review.checks).toContainEqual(
      expect.objectContaining({
        id: 'git_baseline',
        status: 'blocked',
        detail: expect.stringContaining('pre-existing code changes'),
      }),
    );
    expect(() => assertDeskCheckApprovalReady(cwd)).toThrow(
      'pre-existing code changes',
    );
  });

  it('binds budget policy changes into freshness and distinguishes enforced mode', () => {
    const cwd = workspace();
    prepareDeskCheck(cwd);
    const shadow = inspectDeskCheck(cwd);
    write(
      cwd,
      'engineering/evidence-orchestrator/execution-budget.json',
      `${JSON.stringify({
        ...TEST_EXECUTION_BUDGET_POLICY,
        pair: {
          ...TEST_EXECUTION_BUDGET_POLICY.pair,
          max_no_progress_checkpoints: 10,
          extra_agent_call_ratio: 0.5,
        },
        iteration: {
          ...TEST_EXECUTION_BUDGET_POLICY.iteration,
          max_duration_ms: 3_600_000,
          max_input_tokens: 100_000,
          max_output_tokens: 20_000,
          max_reported_cost_usd: 10,
        },
      })}\n`,
    );

    const enforced = inspectDeskCheck(cwd);

    expect(enforced.subject_sha256).not.toBe(shadow.subject_sha256);
    expect(enforced.budget_preview).toMatchObject({
      mode: 'enforced',
      expected_pair_agent_calls: 8,
      max_pair_agent_calls: 12,
      max_no_progress_checkpoints: 10,
    });
    expect(enforced.checks).toContainEqual(
      expect.objectContaining({ id: 'budget_policy', status: 'pass' }),
    );
  });

  it('detects Nx project catalog drift in both checks and the subject hash', () => {
    const cwd = workspace();
    const originalLoader = projectCatalogLoader(webProjects);
    prepareDeskCheck(cwd, { nx: true, loadProjectCatalog: originalLoader });
    const original = inspectDeskCheck(cwd, {
      loadProjectCatalog: originalLoader,
    });
    const webProject = webProjects[0];
    if (!webProject) throw new Error('Missing Web project fixture.');
    const driftedLoader = projectCatalogLoader([
      { ...webProject, targetNames: ['test', 'build'] },
    ]);

    const drifted = inspectDeskCheck(cwd, {
      loadProjectCatalog: driftedLoader,
    });

    expect(drifted.subject_sha256).not.toBe(original.subject_sha256);
    expect(drifted.checks).toContainEqual(
      expect.objectContaining({
        id: 'candidate',
        status: 'blocked',
        detail: expect.stringContaining('Nx project catalog drifted'),
      }),
    );
    expect(() =>
      assertDeskCheckApprovalReady(cwd, {
        loadProjectCatalog: driftedLoader,
      }),
    ).toThrow('Nx project catalog drifted');
  });
});
