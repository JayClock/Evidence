import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  cleanupWorkspaces,
  initializeGitRepository,
  workspace,
  write,
  writeIterationArtifact,
} from '../../../test-support/support';
import { DEFAULT_STATE } from '../../../iteration/default-state';
import { writeState } from '../../../iteration/state-repository';
import type { ModelingMethod, ModelingSubject } from '../../../iteration/state';
import {
  applyModelChangeProposal,
  recordModelAnalysis,
} from './candidate-model';
import { confirmModelingProfile, proposeModelingProfile } from './profile';

function commit(cwd: string, message: string): void {
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
      message,
    ],
    { cwd },
  );
}

function prepareModeling(cwd: string): void {
  initializeGitRepository(cwd);
  write(
    cwd,
    '.evidence/model.json',
    JSON.stringify({ version: 1, project_name: 'Evidence', purpose: 'Test' }),
  );
  write(
    cwd,
    '.evidence/entities/workspace.yaml',
    'id: workspace\nname: Workspace\ntype: CONTEXT\nsubType: bounded_context\n',
  );
  commit(cwd, 'canonical model');
  writeIterationArtifact(
    cwd,
    '01-requirements/examples/US-001-SC-001.md',
    '# confirmed scenario\n',
  );
  writeState(cwd, {
    ...DEFAULT_STATE,
    loop: 'understand',
    understand_stage: 'modeling',
    modeling_stage: 'profile',
    confirmed_scenario: {
      version: 1,
      story_id: 'US-001',
      scenario_id: 'SC-001',
      source_draft_id: 'DRAFT-001',
      title: '确认当前模型',
      given: ['工作区存在模型 v3'],
      when: '负责人打开模型',
      then: ['显示 v3'],
      business_data: ['版本：v3'],
      artifact_path:
        'artifacts/iterations/ITER-0001/01-requirements/examples/US-001-SC-001.md',
      confirmed_by: 'human',
      confirmation_reason: '最小业务价值。',
      confirmed_at: '2026-01-01T00:00:00.000Z',
    },
  });
}

function confirmProfile(
  cwd: string,
  subject: ModelingSubject,
  method: ModelingMethod,
  required: boolean,
): void {
  proposeModelingProfile(cwd, {
    subject,
    method,
    modelChangeRequired: required,
    reason: 'The Scenario determines this modeling approach.',
  });
  confirmModelingProfile(cwd, {
    reason: 'The domain expert confirms this modeling boundary.',
  });
}

function expansion(
  operations: Parameters<typeof recordModelAnalysis>[1]['operations'] = [],
) {
  return {
    reason: operations.length
      ? 'The canonical model lacks the required concept.'
      : 'The canonical model already explains the Scenario.',
    modelRefs: {
      entities: operations.length
        ? ['workspace', 'model-version']
        : ['workspace'],
      associations: [],
    },
    given: { entities: ['Workspace'], relationships: [] },
    when: 'OpenCurrentModel',
    then: {
      createdEntities: [],
      changedEntities: ['Workspace'],
      createdRelationships: [],
      removedRelationships: [],
    },
    invariants: ['Only a confirmed version is current.'],
    timeline: ['Model confirmed', 'Model opened'],
    operations,
  };
}

afterEach(cleanupWorkspaces);

describe('modeling method routing', () => {
  it.each([
    ['business', 'eight_x_flow', true],
    ['domain', 'object', false],
    ['tool', 'none', false],
  ] as const)(
    'requires human confirmation for %s/%s',
    (subject, method, required) => {
      const cwd = workspace();
      prepareModeling(cwd);

      const proposed = proposeModelingProfile(cwd, {
        subject,
        method,
        modelChangeRequired: required,
        reason: 'Selected for the confirmed Scenario.',
      });
      expect(proposed.modeling_stage).toBe('profile_review');
      expect(proposed.modeling_profile).toBeUndefined();

      const confirmed = confirmModelingProfile(cwd, {
        reason: 'Confirmed by the domain expert.',
      });
      expect(confirmed.modeling_profile).toMatchObject({
        subject,
        method,
        model_change_required: required,
        confirmed_by: 'human',
      });
      expect(confirmed.modeling_stage).toBe('expansion');
    },
  );

  it('requires a human decision when the AI cannot determine model change need', () => {
    const cwd = workspace();
    prepareModeling(cwd);
    proposeModelingProfile(cwd, {
      subject: 'domain',
      method: 'event',
      modelChangeRequired: 'unknown',
      reason: 'The lifecycle boundary needs a human decision.',
    });

    expect(() => confirmModelingProfile(cwd, { reason: 'Confirm.' })).toThrow(
      'must explicitly set true or false',
    );
    expect(
      confirmModelingProfile(cwd, {
        subject: 'domain',
        method: 'event',
        modelChangeRequired: false,
        reason: 'The existing event model is sufficient.',
      }).modeling_profile?.model_change_required,
    ).toBe(false);
  });

  it('records an existing-model expansion without creating a false delta', () => {
    const cwd = workspace();
    prepareModeling(cwd);
    confirmProfile(cwd, 'domain', 'object', false);
    const modelBefore = readFileSync(
      join(cwd, '.evidence/entities/workspace.yaml'),
      'utf8',
    );

    const state = recordModelAnalysis(cwd, expansion());

    expect(state.modeling_stage).toBe('candidate_ready');
    expect(state.model_change_proposal).toBeUndefined();
    expect(state.model_expansion_path).toContain('US-001-SC-001.json');
    expect(
      existsSync(
        join(
          cwd,
          'artifacts/iterations/ITER-0001/02-domain-model/model-change-proposal.json',
        ),
      ),
    ).toBe(false);
    expect(
      readFileSync(join(cwd, '.evidence/entities/workspace.yaml'), 'utf8'),
    ).toBe(modelBefore);
  });

  it('records a structured candidate and applies it only through the explicit function', () => {
    const cwd = workspace();
    prepareModeling(cwd);
    confirmProfile(cwd, 'domain', 'object', true);
    const operation = {
      action: 'add' as const,
      kind: 'entity' as const,
      id: 'model-version',
      path: '.evidence/entities/model-version.yaml',
      content:
        'id: model-version\nname: ModelVersion\ntype: EVIDENCE\nsubType: other_evidence\n',
    };

    const proposed = recordModelAnalysis(cwd, expansion([operation]));

    expect(proposed.model_change_proposal).toMatchObject({
      git_baseline: execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd,
        encoding: 'utf8',
      }).trim(),
      operations: [expect.objectContaining({ id: 'model-version' })],
    });
    expect(existsSync(join(cwd, operation.path))).toBe(false);

    const applied = applyModelChangeProposal(cwd, '2026-01-01T00:03:00.000Z');
    expect(existsSync(join(cwd, operation.path))).toBe(true);
    expect(applied.model_change_application).toEqual({
      git_baseline: proposed.model_git_baseline,
      changed_paths: [operation.path],
      applied_at: '2026-01-01T00:03:00.000Z',
    });
  });

  it('runs method-specific validation for a confirmed 8X Profile', () => {
    const cwd = workspace();
    prepareModeling(cwd);
    confirmProfile(cwd, 'business', 'eight_x_flow', true);

    expect(() =>
      recordModelAnalysis(
        cwd,
        expansion([
          {
            action: 'add',
            kind: 'entity',
            id: 'delivery-confirmation',
            path: '.evidence/entities/delivery-confirmation.yaml',
            content:
              'id: delivery-confirmation\nname: DeliveryConfirmation\ntype: EVIDENCE\nsubType: fulfillment_confirmation\n',
          },
        ]),
      ),
    ).toThrow('8X Flow 业务模型校验失败');
  });

  it('rejects method misuse and operations that contradict the human Profile', () => {
    const cwd = workspace();
    prepareModeling(cwd);
    expect(() =>
      proposeModelingProfile(cwd, {
        subject: 'domain',
        method: 'eight_x_flow',
        modelChangeRequired: false,
        reason: 'Invalid method.',
      }),
    ).toThrow('only valid for a business system');

    confirmProfile(cwd, 'domain', 'object', false);
    expect(() =>
      recordModelAnalysis(
        cwd,
        expansion([
          {
            action: 'add',
            kind: 'entity',
            id: 'model-version',
            path: '.evidence/entities/model-version.yaml',
            content: 'id: model-version\nname: ModelVersion\n',
          },
        ]),
      ),
    ).toThrow('do not match the human-confirmed model_change_required=false');
  });
});
