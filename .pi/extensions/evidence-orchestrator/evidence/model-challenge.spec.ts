import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  cleanupWorkspaces,
  initializeGitRepository,
  workspace,
  write,
  writeIterationArtifact,
} from '../tests/support';
import { DEFAULT_STATE } from '../iteration/default-state';
import { writeState } from '../iteration/state-repository';
import { recordModelChallenge } from './model-challenge';
import {
  confirmModelingProfile,
  modelContentSha256,
  proposeModelingProfile,
  recordModelAnalysis,
} from './modeling';
import {
  prepareModelProjection,
  projectCandidateModel,
  validateModelRegressions,
} from './model-projection';

function commit(cwd: string): void {
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
      'canonical model and regression',
    ],
    { cwd },
  );
}

function prepareCandidate(
  cwd: string,
  options: { removeAssociation?: boolean } = {},
): void {
  initializeGitRepository(cwd);
  write(
    cwd,
    '.evidence/model.json',
    JSON.stringify({ version: 1, project_name: 'Evidence', purpose: 'Test' }),
  );
  write(
    cwd,
    '.evidence/entities/z-workspace.yaml',
    'id: z-workspace\nname: ZWorkspace\nlabel: Z 工作区\ntype: CONTEXT\nsubType: bounded_context\ndescription: |\n  后排序的工作区概念。\n',
  );
  write(
    cwd,
    '.evidence/entities/a-model.yaml',
    'id: a-model\nname: AModel\nlabel: A 模型\ntype: PARTICIPANT\nsubType: thing\ndescription: |\n  先排序的模型概念。\n',
  );
  write(
    cwd,
    '.evidence/associations/workspace-uses-model.yaml',
    'id: workspace-uses-model\nkind: association\nname: WorkspaceUsesModel\nlabel: 使用模型\nsource: z-workspace\ntarget: a-model\nrelationshipType: uses\ncardinality: one-to-one\nsummary: 工作区使用一个当前模型。\n',
  );
  write(
    cwd,
    '.evidence/scenarios/REG-001.json',
    JSON.stringify({
      version: 1,
      id: 'REG-001',
      title: '工作区使用当前模型',
      status: 'holdout',
      model_refs: {
        entities: ['z-workspace', 'a-model'],
        associations: ['workspace-uses-model'],
      },
      given: ['工作区存在'],
      when: '负责人打开当前模型',
      then: ['呈现关联模型'],
      business_data: ['工作区标识', '模型版本'],
      invariants: ['工作区最多有一个当前模型'],
      timeline: ['模型确认', '模型打开'],
    }),
  );
  commit(cwd);
  writeIterationArtifact(
    cwd,
    '01-requirements/examples/US-001-SC-001.md',
    '# Scenario',
  );
  writeState(cwd, {
    ...DEFAULT_STATE,
    workflow_version: 5,
    loop: 'understand',
    understand_stage: 'modeling',
    modeling_stage: 'profile',
    confirmed_scenario: {
      version: 1,
      story_id: 'US-001',
      scenario_id: 'SC-001',
      source_draft_id: 'DRAFT-001',
      title: '打开当前模型',
      given: ['工作区存在当前模型'],
      when: '负责人打开当前模型',
      then: ['呈现当前模型'],
      business_data: ['工作区标识'],
      artifact_path:
        'artifacts/iterations/ITER-0001/01-requirements/examples/US-001-SC-001.md',
      confirmed_by: 'human',
      confirmation_reason: '最小场景。',
      confirmed_at: '2026-01-01T00:00:00.000Z',
    },
  });
  proposeModelingProfile(cwd, {
    subject: 'domain',
    method: 'object',
    modelChangeRequired: Boolean(options.removeAssociation),
    reason: 'Use the object model.',
  });
  confirmModelingProfile(cwd, { reason: 'Confirmed by domain expert.' });
  const associationPath = join(
    cwd,
    '.evidence/associations/workspace-uses-model.yaml',
  );
  const operations = options.removeAssociation
    ? [
        {
          action: 'remove' as const,
          kind: 'association' as const,
          id: 'workspace-uses-model',
          path: '.evidence/associations/workspace-uses-model.yaml',
          expected_sha256: modelContentSha256(
            readFileSync(associationPath, 'utf8'),
          ),
        },
      ]
    : [];
  recordModelAnalysis(cwd, {
    reason: options.removeAssociation
      ? 'Candidate removes a relationship not used by the current Scenario.'
      : 'The current model explains the Scenario.',
    modelRefs: { entities: ['z-workspace', 'a-model'], associations: [] },
    given: { entities: ['Workspace'], relationships: [] },
    when: 'OpenCurrentModel',
    then: {
      createdEntities: [],
      changedEntities: ['Workspace'],
      createdRelationships: [],
      removedRelationships: [],
    },
    invariants: ['Only a confirmed model is current.'],
    timeline: ['Model confirmed', 'Model opened'],
    operations,
  });
}

afterEach(cleanupWorkspaces);

describe('independent model challenge', () => {
  it('generates stable Mermaid, Glossary, and context projections', () => {
    const cwd = workspace();
    prepareCandidate(cwd);

    const first = projectCandidateModel(cwd);
    const second = projectCandidateModel(cwd);
    const state = prepareModelProjection(cwd, '2026-01-01T00:01:00.000Z');

    expect(first).toEqual(second);
    expect(first.mermaid.indexOf('a-model')).toBeLessThan(
      first.mermaid.indexOf('z-workspace'),
    );
    expect(first.glossary).toContain('先排序的模型概念');
    expect(first.glossary).toContain('WorkspaceUsesModel');
    expect(first.context).toContain('"id": "REG-001"');
    expect(state.model_projection).toMatchObject({
      regression_ids: ['REG-001'],
      regression_failures: [],
    });
  });

  it('advances to Tasking only after an independent passing challenge', () => {
    const cwd = workspace();
    prepareCandidate(cwd);

    const state = recordModelChallenge(
      cwd,
      {
        outcome: 'pass',
        summary: 'Current and holdout Scenarios are explained.',
      },
      '2026-01-01T00:02:00.000Z',
    );

    expect(state).toMatchObject({
      loop: 'tasking',
      modeling_stage: 'challenged',
      tasking_stage: 'drafting',
    });
    expect(state.model_challenges?.at(-1)).toMatchObject({
      outcome: 'pass',
      checked_regression_ids: ['REG-001'],
      challenged_by: 'model-challenger',
    });
  });

  it('rejects an unknown regression model id and routes back to the Builder', () => {
    const cwd = workspace();
    prepareCandidate(cwd);
    const regressionPath = join(cwd, '.evidence/scenarios/REG-001.json');
    const regression = JSON.parse(readFileSync(regressionPath, 'utf8')) as {
      model_refs: { entities: string[] };
    };
    regression.model_refs.entities.push('unknown-concept');
    writeFileSync(regressionPath, JSON.stringify(regression));

    const projection = projectCandidateModel(cwd);
    expect(() => validateModelRegressions(projection)).toThrow(
      'unknown model entity id unknown-concept',
    );
    const state = recordModelChallenge(cwd, {
      outcome: 'pass',
      summary: 'The LLM believed the candidate passed.',
    });
    expect(state.loop).toBe('understand');
    expect(state.modeling_stage).toBe('profile');
    expect(state.model_challenges?.at(-1)).toEqual(
      expect.objectContaining({
        requested_outcome: 'pass',
        outcome: 'model_gap',
      }),
    );
  });

  it('prevents a candidate that removes an association used by a holdout', () => {
    const cwd = workspace();
    prepareCandidate(cwd, { removeAssociation: true });

    const state = recordModelChallenge(cwd, {
      outcome: 'pass',
      summary: 'The current Scenario does not use the removed association.',
    });

    expect(state.loop).toBe('understand');
    expect(state.modeling_stage).toBe('expansion');
    expect(state.model_challenges?.at(-1)?.summary).toContain(
      'REG-001 references unknown model association id workspace-uses-model',
    );
  });

  it('routes a Scenario gap back to single-Story TQA', () => {
    const cwd = workspace();
    prepareCandidate(cwd);

    const state = recordModelChallenge(cwd, {
      outcome: 'scenario_gap',
      summary: 'The Scenario does not identify who confirms the model.',
    });

    expect(state).toMatchObject({
      loop: 'understand',
      understand_stage: 'tqa',
      active_clarification_story: { story_id: 'US-001' },
    });
    expect(state.confirmed_scenario).toBeUndefined();
    expect(state.feedback_history?.at(-1)?.target).toBe('scenario');
  });
});
