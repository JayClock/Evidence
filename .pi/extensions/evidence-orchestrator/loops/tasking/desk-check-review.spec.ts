import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readState } from '../../iteration/state-repository';
import {
  fixtureProjectCatalogLoader,
  prepareDeskCheckFixture,
  WEB_PROJECTS,
} from '../../test-support/desk-check-fixture';
import {
  cleanupWorkspaces,
  TEST_EXECUTION_BUDGET_POLICY,
  workspace,
  write,
} from '../../test-support/support';
import {
  assertDeskCheckApprovalReady,
  inspectDeskCheck,
} from './desk-check-review';

afterEach(cleanupWorkspaces);

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

describe('Desk Check review', () => {
  it('projects the complete approval boundary and reusable preflight values', () => {
    const cwd = workspace();
    prepareDeskCheckFixture(cwd);

    const review = inspectDeskCheck(cwd);
    const repeated = inspectDeskCheck(cwd);
    const preflight = assertDeskCheckApprovalReady(cwd);

    expect(review).toMatchObject({
      version: 1,
      iteration_id: 'ITER-0001',
      story_id: 'US-001',
      scenario_ids: ['SC-001'],
      draft_id: 'DRAFT-001',
      acceptance: {
        scenarios: [
          {
            scenario_id: 'SC-001',
            title: 'Create a workspace',
            then: ['Workspace Alpha is available to the owner'],
            business_data: ['name=Alpha', 'owner=desktop-user'],
          },
        ],
      },
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
    prepareDeskCheckFixture(cwd);
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
      (cwd: string) => {
        const path =
          'engineering/evidence-orchestrator/test-processes/rust.json';
        const definition = JSON.parse(
          readFileSync(join(cwd, path), 'utf8'),
        ) as Record<string, unknown>;
        write(
          cwd,
          path,
          JSON.stringify({ ...definition, owner: 'other-owner' }),
        );
      },
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
      prepareDeskCheckFixture(cwd);
      mutate(cwd);

      expect(inspectDeskCheck(cwd).checks).toContainEqual(
        expect.objectContaining({ id: checkId, status: 'blocked' }),
      );
      expect(() => assertDeskCheckApprovalReady(cwd)).toThrow(message);
    },
  );

  it('blocks a dirty coding baseline without hiding other review facts', () => {
    const cwd = workspace();
    prepareDeskCheckFixture(cwd);
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
    prepareDeskCheckFixture(cwd);
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
    const originalLoader = fixtureProjectCatalogLoader(WEB_PROJECTS);
    prepareDeskCheckFixture(cwd, {
      nx: true,
      loadProjectCatalog: originalLoader,
    });
    const original = inspectDeskCheck(cwd, {
      loadProjectCatalog: originalLoader,
    });
    const webProject = WEB_PROJECTS[0];
    if (!webProject) throw new Error('Missing Web project fixture.');
    const driftedLoader = fixtureProjectCatalogLoader([
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
