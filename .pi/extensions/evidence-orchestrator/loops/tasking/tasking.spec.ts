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
  workspace,
  write,
} from '../../test-support/support';
import { prepareActivityRun } from '../../adapters/pi/activity/dispatch';
import { statusMarkdown } from '../../adapters/pi/status';
import { buildActivityTask } from '../../adapters/pi/activity/task';
import { executeTestStep } from '../../capabilities/execution-evidence/observation-log';
import { decideTasking } from './desk-check';
import { proposeTaskingDraft, type TaskingDraftInput } from './tasking-draft';

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

  it('requires human approval, supports edited-list regeneration, and locks the v2 plan', () => {
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
        command: 'node focused.js workspace_alpha',
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
      scenario_id: 'SC-001',
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
    revisedInput.runtimes[0] = {
      ...revisedInput.runtimes[0],
      testFilter: 'workspace_revised',
    };
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
    ).toThrow('outcome outside its confirmed Scenarios');
  });
});
