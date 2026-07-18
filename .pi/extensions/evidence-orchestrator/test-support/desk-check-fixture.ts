import { completeNoModelImpact } from '../capabilities/modeling-evidence/no-model-impact';
import {
  createNxProjectCatalog,
  type NxWorkspaceProject,
} from '../capabilities/test-process/project-catalog';
import { DEFAULT_STATE } from '../iteration/default-state';
import { readState, writeState } from '../iteration/state-repository';
import type { ProjectCatalogLoader } from '../loops/tasking/desk-check-review';
import {
  proposeTaskingDraft,
  type TaskingDraftInput,
} from '../loops/tasking/tasking-draft';
import { initializeGitRepository, testIntakeSnapshot, write } from './support';

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

export function prepareDeskCheckFixture(
  cwd: string,
  options: {
    nx?: boolean;
    loadProjectCatalog?: ProjectCatalogLoader;
    initializeGit?: boolean;
    iterationId?: string;
  } = {},
): void {
  if (options.initializeGit !== false) initializeGitRepository(cwd);
  const iterationId = options.iterationId ?? 'ITER-0001';
  const scenarioPath = `artifacts/iterations/${iterationId}/01-requirements/examples/US-001-SC-001.md`;
  const baseIntake = testIntakeSnapshot();
  const iterationPath = (path: string) =>
    path.replace('ITER-0001', iterationId);
  const intakeSnapshot = {
    ...baseIntake,
    candidate_snapshot_path: iterationPath(baseIntake.candidate_snapshot_path),
    source_revisions: baseIntake.source_revisions.map((source) => ({
      ...source,
      snapshot_path: iterationPath(source.snapshot_path),
    })),
    manifest_path: iterationPath(baseIntake.manifest_path),
    projection_path: iterationPath(baseIntake.projection_path),
  };
  write(cwd, scenarioPath, '# Create workspace Alpha\n');
  writeState(cwd, {
    ...DEFAULT_STATE,
    iteration_id: iterationId,
    loop: 'understand',
    intake_snapshot: intakeSnapshot,
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

export function fixtureProjectCatalogLoader(
  projects: NxWorkspaceProject[],
): ProjectCatalogLoader {
  const catalog = createNxProjectCatalog(projects);
  return () => catalog;
}

export const WEB_PROJECTS: NxWorkspaceProject[] = [
  {
    name: '@evidence/web',
    root: 'apps/web',
    sourceRoot: 'apps/web/src',
    targetNames: ['test'],
  },
];
