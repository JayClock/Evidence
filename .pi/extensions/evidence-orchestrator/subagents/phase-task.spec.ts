import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_STATE } from '../workflow/phase-catalog';
import { readState, writeState } from '../workflow/state-store';
import { buildPhaseTask } from './phase-task';
import {
  cleanupWorkspaces,
  workspace,
  writeIterationArtifact,
} from '../tests/support';

afterEach(cleanupWorkspaces);

describe('phase tasks', () => {
  it('resolves phase paths without referring to legacy skills', () => {
    const cwd = workspace();
    writeState(cwd, DEFAULT_STATE);
    writeIterationArtifact(cwd, '00-user-input/requirements.md');

    const task = buildPhaseTask(cwd);

    expect(task).toContain(
      'artifacts/iterations/ITER-0001/00-user-input/requirements.md',
    );
    expect(task).not.toContain('.pi/skills/');
    expect(task).toContain('stories/US-xxx.md');
  });

  it('prepares one unnumbered v5 Kickoff candidate for human review', () => {
    const cwd = workspace();
    writeState(cwd, {
      ...DEFAULT_STATE,
      workflow_version: 5,
      loop: 'kickoff',
    });

    const task = buildPhaseTask(cwd);

    expect(task).toContain('evidence_orchestrator_propose_kickoff');
    expect(task).toContain('不分配 US-xxx');
    expect(task).toContain('不得调用 evidence_orchestrator_complete_phase');
    expect(task).not.toContain('必须产出');
  });

  it('keeps v5 TQA and Scenario drafting in one Understand task', () => {
    const cwd = workspace();
    writeState(cwd, {
      ...DEFAULT_STATE,
      workflow_version: 5,
      loop: 'understand',
      phase: 'clarify',
      understand_stage: 'tqa',
      active_clarification_story: {
        story_id: 'US-001',
        selected_at: '2026-01-01T00:00:00.000Z',
      },
    });

    const task = buildPhaseTask(cwd);

    expect(task).toContain('.pi/skills/evidence-story-tqa/SKILL.md');
    expect(task).toContain('evidence_orchestrator_ask_question');
    expect(task).toContain('evidence_orchestrator_propose_scenarios');
    expect(task).toContain('/evidence-scenario');
    expect(task).not.toContain('Specify 的完整批处理范围');
    expect(task).toContain('不写 requirements-validation.md');
  });

  it('routes v5 modeling through a human Profile before candidate expansion', () => {
    const cwd = workspace();
    const confirmedScenario = {
      version: 1 as const,
      story_id: 'US-001',
      scenario_id: 'SC-001',
      source_draft_id: 'DRAFT-001',
      title: '确认当前模型',
      given: ['v3 已确认'],
      when: '负责人打开模型',
      then: ['显示 v3'],
      business_data: ['版本：v3'],
      artifact_path:
        'artifacts/iterations/ITER-0001/01-requirements/examples/US-001-SC-001.md',
      confirmed_by: 'human' as const,
      confirmation_reason: '最小价值。',
      confirmed_at: '2026-01-01T00:00:00.000Z',
    };
    writeState(cwd, {
      ...DEFAULT_STATE,
      workflow_version: 5,
      loop: 'understand',
      phase: 'domain_model',
      understand_stage: 'modeling',
      modeling_stage: 'profile',
      confirmed_scenario: confirmedScenario,
    });

    const profileTask = buildPhaseTask(cwd);
    expect(profileTask).toContain(
      'evidence_orchestrator_propose_modeling_profile',
    );
    expect(profileTask).toContain(
      '.pi/skills/evidence-modeling-router/SKILL.md',
    );
    expect(profileTask).toContain('不得编辑 .evidence');

    writeState(cwd, {
      ...readState(cwd),
      modeling_stage: 'expansion',
      modeling_profile: {
        version: 1,
        subject: 'domain',
        method: 'object',
        model_change_required: false,
        reason: 'Confirmed.',
        confirmed_by: 'human',
        confirmed_at: '2026-01-01T00:01:00.000Z',
      },
    });
    const expansionTask = buildPhaseTask(cwd);
    expect(expansionTask).toContain(
      'evidence_orchestrator_record_model_analysis',
    );
    expect(expansionTask).toContain(
      '.pi/skills/evidence-model-expansion/SKILL.md',
    );
    expect(expansionTask).toContain('不得直接 edit/write .evidence');

    writeState(cwd, {
      ...readState(cwd),
      modeling_stage: 'candidate_ready',
      model_expansion_path:
        'artifacts/iterations/ITER-0001/02-domain-model/model-expansions/US-001-SC-001.json',
      model_git_baseline: 'abc123',
      model_projection: {
        version: 1,
        model_sha256: 'sha256:model',
        mermaid_path:
          'artifacts/iterations/ITER-0001/02-domain-model/projections/model.mmd',
        glossary_path:
          'artifacts/iterations/ITER-0001/02-domain-model/projections/glossary.md',
        context_path:
          'artifacts/iterations/ITER-0001/02-domain-model/projections/model-context.json',
        regression_ids: ['REG-001'],
        regression_failures: [],
        method_failures: [],
        generated_at: '2026-01-01T00:02:00.000Z',
      },
    });
    const challengeTask = buildPhaseTask(cwd);
    expect(challengeTask).toContain('独立 Model Challenge');
    expect(challengeTask).toContain(
      '.pi/skills/evidence-model-expansion/SKILL.md',
    );
    expect(challengeTask).toContain(
      'evidence_orchestrator_record_model_challenge',
    );
    expect(challengeTask).toContain('不得修改 .evidence');
  });

  it('uses v5 Tasking instead of Scrum planning and waits for Desk Check', () => {
    const cwd = workspace();
    writeState(cwd, {
      ...DEFAULT_STATE,
      workflow_version: 5,
      loop: 'tasking',
      phase: 'architecture',
      understand_stage: 'modeling',
      confirmed_scenario: {
        version: 1,
        story_id: 'US-001',
        scenario_id: 'SC-001',
        source_draft_id: 'DRAFT-001',
        title: 'Create workspace',
        given: ['No Alpha workspace exists'],
        when: 'The owner creates Alpha',
        then: ['Alpha is available'],
        business_data: ['name=Alpha'],
        artifact_path: 'examples/US-001-SC-001.md',
        confirmed_by: 'human',
        confirmation_reason: 'Smallest value.',
        confirmed_at: '2026-01-01T00:00:00.000Z',
      },
      modeling_stage: 'challenged',
      modeling_profile: {
        version: 1,
        subject: 'domain',
        method: 'object',
        model_change_required: false,
        reason: 'Existing model.',
        confirmed_by: 'human',
        confirmed_at: '2026-01-01T00:01:00.000Z',
      },
      model_expansion_path: 'expansions/US-001-SC-001.json',
      model_git_baseline: 'abc123',
      model_challenges: [
        {
          version: 1,
          requested_outcome: 'pass',
          outcome: 'pass',
          summary: 'Model passes.',
          checked_regression_ids: ['REG-001'],
          projection_sha256: 'projection',
          artifact_path: 'challenges/CHALLENGE-001.json',
          challenged_by: 'model-challenger',
          challenged_at: '2026-01-01T00:02:00.000Z',
        },
      ],
      tasking_stage: 'drafting',
    });

    const task = buildPhaseTask(cwd);

    expect(task).toContain('.pi/skills/evidence-test-process/SKILL.md');
    expect(task).toContain('evidence_orchestrator_propose_tasking');
    expect(task).toContain('/evidence-desk-check');
    expect(task).toContain('不得从非目标反推测试');
    expect(task).toContain('不得生成 sprint-plan.md');
    expect(task).toContain('不得调用 evidence_orchestrator_complete_phase');
  });

  it('scopes clarification work to the selected story', () => {
    const cwd = workspace();
    writeState(cwd, {
      ...DEFAULT_STATE,
      phase: 'clarify',
      active_clarification_story: {
        story_id: 'US-007',
        selected_at: '2026-01-01T00:00:00.000Z',
      },
    });

    const task = buildPhaseTask(cwd);

    expect(task).toContain('当前澄清故事：US-007');
    expect(task).toContain('只处理当前选中的故事');
    expect(task).toContain('evidence_orchestrator_propose_story_outcome');
    expect(task).toContain('/evidence-story-complete');
    expect(task).not.toContain('evidence_orchestrator_complete_story');
  });

  it('instructs coding to select a test process before implementation', () => {
    const cwd = workspace();
    writeState(cwd, { ...DEFAULT_STATE, phase: 'coding' });
    expect(buildPhaseTask(cwd)).toContain(
      'evidence_orchestrator_select_test_process',
    );
  });
});
