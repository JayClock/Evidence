import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { completeNoModelImpact } from '../../capabilities/modeling-evidence/no-model-impact';
import { DEFAULT_STATE } from '../../iteration/default-state';
import { readState, writeState } from '../../iteration/state-repository';
import {
  cleanupWorkspaces,
  initializeGitRepository,
  testIntakeSnapshot,
  workspace,
  write,
} from '../../test-support/support';
import { proposeTaskingDraft } from './tasking-draft';
import { assertDeskCheckApprovalReady } from './desk-check-review';

afterEach(cleanupWorkspaces);

function prepareDeskCheck(cwd: string): void {
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
        business_data: ['name=Alpha'],
        artifact_path: scenarioPath,
        confirmed_by: 'human',
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
  write(
    cwd,
    'engineering/evidence-orchestrator/test-processes/rust.json',
    JSON.stringify({
      version: 3,
      id: 'rust-workspace',
      owner: 'server-platform',
      runtime: 'rust',
      applies_to: {
        capabilities: ['workspace'],
        technical_boundaries: ['rust-domain'],
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
          nearest_test: { rule: 'Use the nearest test.', roots: ['domain'] },
          focused_command: {
            template: 'node focused.js {{test_filter}}',
            allowed_variables: ['test_filter'],
          },
          red: {
            expected_failure_kind: 'behavior',
            expected_failure: 'The domain assertion fails.',
          },
          green: { done_when: 'The domain assertion passes.' },
          refactor: { done_when: 'The domain assertion remains green.' },
        },
        {
          id: 'acceptance-q2',
          purpose: 'Confirm the Scenario.',
          quadrant: 'Q2',
          functional_contexts: ['workspace'],
          real_boundaries: ['rust-domain'],
          replaced_boundaries: [],
          nearest_test: { rule: 'Use the nearest test.', roots: ['domain'] },
          focused_command: {
            template: 'node focused.js {{test_filter}}',
            allowed_variables: ['test_filter'],
          },
          red: {
            expected_failure_kind: 'behavior',
            expected_failure: 'The acceptance assertion fails.',
          },
          green: { done_when: 'The acceptance assertion passes.' },
          refactor: { done_when: 'The acceptance assertion remains green.' },
        },
      ],
      quality_gates: [
        {
          scope: 'process',
          template: 'node quality.js',
          allowed_variables: [],
        },
      ],
    }),
  );
  proposeTaskingDraft(cwd, {
    runtimes: [
      {
        id: 'RUNTIME-001',
        runtime: 'rust',
        functionalContexts: ['workspace'],
        technicalBoundaries: ['rust-domain'],
      },
    ],
    tests: [
      {
        id: 'TEST-001',
        quadrant: 'Q1',
        intent: 'The owner receives workspace Alpha in the domain.',
        runtimePlanId: 'RUNTIME-001',
        stepId: 'domain-q1',
        testFilter: 'workspace_domain_alpha',
        supportedBy: [],
        scenarioIds: ['SC-001'],
        businessData: ['name=Alpha'],
        modelRefs: { entities: [], associations: [] },
      },
      {
        id: 'TEST-002',
        quadrant: 'Q2',
        intent: 'Creating Alpha exposes an owner-visible workspace.',
        runtimePlanId: 'RUNTIME-001',
        stepId: 'acceptance-q2',
        testFilter: 'workspace_acceptance_alpha',
        supportedBy: ['TEST-001'],
        scenarioIds: ['SC-001'],
        scenarioOutcome: 'Workspace Alpha is available to the owner',
        businessData: ['name=Alpha'],
        modelRefs: { entities: [], associations: [] },
      },
    ],
    tasks: [
      {
        id: 'TASK-001',
        description: 'Confirm the owner-visible acceptance behavior.',
        testIds: ['TEST-001', 'TEST-002'],
        dependsOn: [],
      },
    ],
  });
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

describe('Desk Check approval preflight', () => {
  it('returns verified Git, process, and budget values without writing', () => {
    const cwd = workspace();
    prepareDeskCheck(cwd);
    const beforeFiles = repositorySnapshot(cwd);
    const beforeState = JSON.stringify(readState(cwd));

    const preflight = assertDeskCheckApprovalReady(cwd);

    expect(preflight.git_baseline).toHaveLength(40);
    expect(preflight.project_catalogs).toEqual({});
    expect(preflight.budget_preview).toMatchObject({
      mode: 'shadow',
      expected_pair_agent_calls: 8,
      max_pair_agent_calls: null,
    });
    expect(repositorySnapshot(cwd)).toBe(beforeFiles);
    expect(JSON.stringify(readState(cwd))).toBe(beforeState);
  });

  it('fails before approval writes when a reviewed list drifts', () => {
    const cwd = workspace();
    prepareDeskCheck(cwd);
    const testList = readState(cwd).tasking_candidate?.test_list_path;
    if (!testList) throw new Error('Missing test-list fixture.');
    write(cwd, testList, '# Human edit\n');
    const afterEdit = repositorySnapshot(cwd);

    expect(() => assertDeskCheckApprovalReady(cwd)).toThrow(
      'must be regenerated before approval',
    );
    expect(repositorySnapshot(cwd)).toBe(afterEdit);
    expect(readState(cwd)).toMatchObject({
      loop: 'tasking',
      tasking_stage: 'desk_check',
    });
  });
});
