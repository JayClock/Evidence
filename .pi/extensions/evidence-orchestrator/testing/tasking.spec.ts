import { existsSync, readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import {
  selectWorkItem,
  transitionWorkflowLoop,
  writeState,
} from '../workflow/state-store';
import { DEFAULT_STATE } from '../workflow/phase-catalog';
import { completePhase } from '../workflow/gates';
import {
  cleanupWorkspaces,
  initializeGitRepository,
  workspace,
  write,
} from '../tests/support';
import { preparePhaseRun } from '../runtime/phase-dispatch';
import { statusMarkdown } from '../runtime/status';
import { buildPhaseTask } from '../subagents/phase-task';
import { executeTestStep } from './execution-recorder';
import { decideTasking, proposeTaskingDraft } from './tasking';

afterEach(cleanupWorkspaces);

function processDefinition(id = 'rust-workspace') {
  return {
    version: 2,
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
        test_list_template: 'evidence-test-list-v1',
        nearest_test: { rule: 'Nearest domain test.', roots: ['domain'] },
        focused_command: {
          template: 'node focused.js {{test_filter}}',
          allowed_variables: ['test_filter'],
        },
        red: { expected_failure: 'Business assertion fails.' },
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
        test_list_template: 'evidence-test-list-v1',
        nearest_test: { rule: 'Nearest API test.', roots: ['api'] },
        focused_command: {
          template: 'node focused.js {{test_filter}}',
          allowed_variables: ['test_filter'],
        },
        red: { expected_failure: 'Acceptance assertion fails.' },
        green: { done_when: 'Acceptance assertion passes.' },
        refactor: { done_when: 'Acceptance assertion stays green.' },
      },
    ],
    quality_gates: ['node quality.js'],
  };
}

function prepare(cwd: string): void {
  initializeGitRepository(cwd);
  write(
    cwd,
    'engineering/evidence-orchestrator/test-processes/rust.json',
    JSON.stringify(processDefinition()),
  );
  writeState(cwd, {
    ...DEFAULT_STATE,
    workflow_version: 5,
    loop: 'tasking',
    requirement_source: {
      type: 'github_issue',
      repository: 'owner/repo',
      issue_number: 9,
      url: 'https://example.test/issues/9',
      snapshot_path: 'artifacts/iterations/ITER-0001/00-user-input/issue.json',
      projection_path:
        'artifacts/iterations/ITER-0001/00-user-input/requirements.md',
      content_hash: 'sha256:test',
      issue_updated_at: '2026-01-01T00:00:00.000Z',
      fetched_at: '2026-01-01T00:00:00.000Z',
    },
    phase: 'architecture',
    understand_stage: 'modeling',
    confirmed_scenario: {
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
    modeling_stage: 'challenged',
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
    model_git_baseline: 'abc123',
    model_challenges: [
      {
        version: 1,
        requested_outcome: 'pass',
        outcome: 'pass',
        summary: 'The model explains the confirmed Scenario.',
        checked_regression_ids: ['REG-001'],
        projection_sha256: 'projection-sha',
        artifact_path:
          'artifacts/iterations/ITER-0001/02-domain-model/model-challenges/CHALLENGE-001.json',
        challenged_by: 'model-challenger',
        challenged_at: '2026-01-01T00:02:00.000Z',
      },
    ],
    tasking_stage: 'drafting',
  });
}

function draftInput(outcome = 'Workspace Alpha is available to the owner') {
  return {
    runtimes: [
      {
        id: 'RUNTIME-001',
        runtime: 'rust' as const,
        functionalContexts: ['workspace'],
        technicalBoundaries: ['rust-domain', 'axum-api'],
        testFilter: 'workspace_alpha',
      },
    ],
    tests: [
      {
        id: 'TEST-001',
        quadrant: 'Q1' as const,
        intent: 'The owner receives the created workspace in the domain.',
        runtimePlanId: 'RUNTIME-001',
        stepId: 'domain-q1',
        supportedBy: [],
        businessData: ['name=Alpha', 'owner=desktop-user'],
      },
      {
        id: 'TEST-002',
        quadrant: 'Q2' as const,
        intent:
          'Creating Alpha returns an owner-visible workspace through Axum.',
        runtimePlanId: 'RUNTIME-001',
        stepId: 'api-q2',
        supportedBy: ['TEST-001'],
        scenarioOutcome: outcome,
        businessData: ['name=Alpha', 'owner=desktop-user'],
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

describe('v5 Tasking and Desk Check', () => {
  it('requires human approval, supports edited-list regeneration, and locks the v2 plan', () => {
    const cwd = workspace();
    prepare(cwd);

    expect(() => completePhase(cwd, 'architecture')).toThrow(
      '/evidence-desk-check',
    );
    const draft = proposeTaskingDraft(cwd, draftInput());

    expect(draft.tasking_stage).toBe('desk_check');
    expect(() => preparePhaseRun(cwd)).toThrow('/evidence-desk-check');
    expect(statusMarkdown(cwd)).toContain('human:/evidence-desk-check');
    expect(
      readFileSync(`${cwd}/${draft.tasking_candidate?.test_list_path}`, 'utf8'),
    ).toContain('Workspace Alpha is available to the owner');
    expect(() => transitionWorkflowLoop(cwd, { to: 'pair' })).toThrow(
      'human-approved Desk Check',
    );
    expect(
      existsSync(
        `${cwd}/artifacts/iterations/ITER-0001/04-planning/sprint-plan.md`,
      ),
    ).toBe(false);

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
      phase: 'coding',
      tasking_stage: 'approved',
      active_work_item: {
        story_id: 'US-001',
        scenario_id: 'SC-001',
        test_plan: {
          version: 2,
          processes: [
            {
              id: 'rust-workspace',
              definition_sha256: expect.any(String),
              focused_commands: [
                {
                  step_id: 'domain-q1',
                  command: 'node focused.js workspace_alpha',
                },
                {
                  step_id: 'api-q2',
                  command: 'node focused.js workspace_alpha',
                },
              ],
            },
          ],
        },
      },
    });
    expect(
      existsSync(
        `${cwd}/artifacts/iterations/ITER-0001/04-planning/test-plan.json`,
      ),
    ).toBe(true);
    expect(buildPhaseTask(cwd)).toContain(
      '尚未启用交互式 Test/Production Driver',
    );
    expect(buildPhaseTask(cwd)).not.toContain(
      'evidence_orchestrator_select_test_process',
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
        command: 'node focused.js workspace_alpha',
      }).expected_failure,
    ).toBe(true);
    expect(selectWorkItem(cwd, 'US-001', 'SC-001')).toEqual(approved);
    expect(() => selectWorkItem(cwd, 'US-002', 'SC-002')).toThrow(
      'human-approved v5 work item is immutable',
    );
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
      phase: 'clarify',
      understand_stage: 'tqa',
      active_clarification_story: { story_id: 'US-001' },
    });
    expect(state.confirmed_scenario).toBeUndefined();
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
        phase: 'architecture',
        tasking_stage: 'knowledge_gap',
        tasking_gap: { kind: action },
      });
      expect(state.feedback_history?.at(-1)).toMatchObject({
        target: feedbackTarget,
        to_loop: 'tasking',
      });
    },
  );

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
        reason: expect.stringContaining('Multiple v2 test processes'),
      },
    });
  });

  it('rejects tests inferred from an outcome outside the confirmed Scenario', () => {
    const cwd = workspace();
    prepare(cwd);

    expect(() =>
      proposeTaskingDraft(cwd, draftInput('A non-goal feature is absent')),
    ).toThrow('outcome outside the confirmed Scenario');
  });
});
