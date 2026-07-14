import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_STATE, PHASE_META } from '../workflow/phase-catalog';
import {
  proposeClarificationStoryOutcome,
  selectClarificationStory,
} from '../requirements/clarifications';
import { proposeKickoffCandidate } from '../requirements/kickoff';
import { proposeScenarioDrafts } from '../requirements/scenarios';
import { proposeModelingProfile } from '../evidence/modeling';
import { writeState } from '../workflow/state-store';
import { cleanupWorkspaces, workspace, write } from '../tests/support';
import { isCompletedIteration, preparePhaseRun } from './phase-dispatch';

afterEach(cleanupWorkspaces);

function writeFrameInputs(cwd: string): void {
  for (const path of PHASE_META.frame.inputs) {
    const resolved = path.startsWith('artifacts/')
      ? `artifacts/iterations/ITER-0001/${path.slice('artifacts/'.length)}`
      : path;
    write(cwd, resolved, 'input');
  }
}

function issueBackedFrameState() {
  return {
    ...DEFAULT_STATE,
    requirement_source: {
      type: 'github_issue' as const,
      repository: 'owner/repo',
      issue_number: 1,
      url: 'https://example.test/issues/1',
      snapshot_path: 'artifacts/iterations/ITER-0001/00-user-input/issue.json',
      projection_path:
        'artifacts/iterations/ITER-0001/00-user-input/requirements.md',
      content_hash: 'sha256:test',
      issue_updated_at: '2026-01-01T00:00:00.000Z',
      fetched_at: '2026-01-01T00:00:00.000Z',
    },
  };
}

describe('phase dispatch', () => {
  it('requires an Issue-backed iteration before any phase can be dispatched', () => {
    const cwd = workspace();
    writeState(cwd, DEFAULT_STATE);

    expect(() => preparePhaseRun(cwd)).toThrow(
      'bootstrap iteration is archival',
    );
  });

  it('prepares the current issue-backed phase without starting a subagent', () => {
    const cwd = workspace();
    writeFrameInputs(cwd);
    writeState(cwd, issueBackedFrameState());

    const preparation = preparePhaseRun(cwd, {
      instructions: 'Keep the initial scope narrow.',
    });

    expect(isCompletedIteration(preparation)).toBe(false);
    if (isCompletedIteration(preparation))
      throw new Error('Unexpected completion.');
    expect(preparation.phase).toBe('frame');
    expect(preparation.task).toContain('Keep the initial scope narrow.');
  });

  it('blocks another v5 Kickoff run while its candidate awaits a human', () => {
    const cwd = workspace();
    writeFrameInputs(cwd);
    writeState(cwd, {
      ...issueBackedFrameState(),
      workflow_version: 5,
      loop: 'kickoff',
    });
    proposeKickoffCandidate(cwd, {
      title: '共享模型',
      problem: '协作者无法识别当前模型。',
      role: '领域建模负责人',
      goal: '确认当前有效模型',
      value: '让协作者依据同一模型讨论',
      cognitiveMode: 'complex',
      sourceRefs: ['docs/product/user-journeys.md#旅程-a'],
    });

    expect(() => preparePhaseRun(cwd)).toThrow('is awaiting a human decision');
    expect(() => preparePhaseRun(cwd)).toThrow('/evidence-kickoff');
  });

  it('runs v5 Understand without optional deltas and blocks on Scenario review', () => {
    const cwd = workspace();
    for (const path of [
      'artifacts/iterations/ITER-0001/00-user-input/requirements.md',
      'artifacts/iterations/ITER-0001/01-requirements/problem-statement.md',
      'artifacts/iterations/ITER-0001/01-requirements/stories/US-001.md',
      'docs/product/business-context.md',
      'docs/product/user-journeys.md',
    ]) {
      write(cwd, path, 'input');
    }
    writeState(cwd, {
      ...issueBackedFrameState(),
      workflow_version: 5,
      loop: 'understand',
      phase: 'clarify',
      understand_stage: 'tqa',
      active_clarification_story: {
        story_id: 'US-001',
        selected_at: '2026-01-01T00:00:00.000Z',
      },
    });

    const prepared = preparePhaseRun(cwd);
    if (isCompletedIteration(prepared)) throw new Error('Unexpected complete.');
    expect(prepared.task).toContain('v5 Understand TQA');

    proposeScenarioDrafts(cwd, 'US-001', [
      {
        title: '确认当前模型',
        given: ['v3 已确认'],
        when: '负责人打开模型',
        then: ['显示 v3'],
        businessData: ['版本：v3'],
      },
    ]);
    expect(() => preparePhaseRun(cwd)).toThrow(
      'Scenario draft(s) await a human decision',
    );
    expect(() => preparePhaseRun(cwd)).toThrow('/evidence-scenario');
  });

  it('prepares v5 model routing and blocks while its Profile awaits a human', () => {
    const cwd = workspace();
    for (const path of [
      'artifacts/iterations/ITER-0001/01-requirements/examples/US-001-SC-001.md',
      '.evidence/model.json',
      '.evidence/entities/workspace.yaml',
      '.evidence/associations/workspace-self.yaml',
    ]) {
      write(cwd, path, 'input');
    }
    writeState(cwd, {
      ...issueBackedFrameState(),
      workflow_version: 5,
      loop: 'understand',
      phase: 'domain_model',
      understand_stage: 'modeling',
      modeling_stage: 'profile',
      confirmed_scenario: {
        version: 1,
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
        confirmed_by: 'human',
        confirmation_reason: '最小价值。',
        confirmed_at: '2026-01-01T00:00:00.000Z',
      },
    });

    const prepared = preparePhaseRun(cwd);
    if (isCompletedIteration(prepared)) throw new Error('Unexpected complete.');
    expect(prepared.task).toContain(
      'evidence_orchestrator_propose_modeling_profile',
    );

    proposeModelingProfile(cwd, {
      subject: 'domain',
      method: 'object',
      modelChangeRequired: false,
      reason: 'Use the existing model.',
    });
    expect(() => preparePhaseRun(cwd)).toThrow('/evidence-modeling-profile');
  });

  it('dispatches a candidate-ready model to the isolated Challenger', () => {
    const cwd = workspace();
    const scenarioPath =
      'artifacts/iterations/ITER-0001/01-requirements/examples/US-001-SC-001.md';
    const expansionPath =
      'artifacts/iterations/ITER-0001/02-domain-model/model-expansions/US-001-SC-001.json';
    write(cwd, scenarioPath, '# Scenario');
    write(cwd, expansionPath, JSON.stringify({ version: 2 }));
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
    write(
      cwd,
      '.evidence/associations/workspace-self.yaml',
      'id: workspace-self\nname: WorkspaceSelf\nsource: workspace\ntarget: workspace\nkind: association\n',
    );
    write(
      cwd,
      '.evidence/scenarios/REG-001.json',
      JSON.stringify({
        version: 1,
        id: 'REG-001',
        title: 'Workspace remains addressable',
        status: 'regression',
        model_refs: {
          entities: ['workspace'],
          associations: ['workspace-self'],
        },
        given: ['Workspace exists'],
        when: 'It is addressed',
        then: ['Workspace remains available'],
        business_data: ['Workspace id'],
        invariants: ['Identity is stable'],
        timeline: ['Created', 'Addressed'],
      }),
    );
    writeState(cwd, {
      ...issueBackedFrameState(),
      workflow_version: 5,
      loop: 'understand',
      phase: 'domain_model',
      understand_stage: 'modeling',
      modeling_stage: 'candidate_ready',
      confirmed_scenario: {
        version: 1,
        story_id: 'US-001',
        scenario_id: 'SC-001',
        source_draft_id: 'DRAFT-001',
        title: 'Workspace remains addressable',
        given: ['Workspace exists'],
        when: 'It is addressed',
        then: ['Workspace remains available'],
        business_data: ['Workspace id'],
        artifact_path: scenarioPath,
        confirmed_by: 'human',
        confirmation_reason: 'Regression fixture.',
        confirmed_at: '2026-01-01T00:00:00.000Z',
      },
      modeling_profile: {
        version: 1,
        subject: 'domain',
        method: 'object',
        model_change_required: false,
        reason: 'Existing model.',
        confirmed_by: 'human',
        confirmed_at: '2026-01-01T00:01:00.000Z',
      },
      model_expansion_path: expansionPath,
      model_git_baseline: 'abc123',
    });

    const prepared = preparePhaseRun(cwd);
    if (isCompletedIteration(prepared)) throw new Error('Unexpected complete.');
    expect(prepared.agentName).toBe('model-challenger');
    expect(prepared.task).toContain('独立 Model Challenge');
    expect(prepared.state.model_projection?.regression_ids).toEqual([
      'REG-001',
    ]);
  });

  it('blocks clarification until one generated story is selected', () => {
    const cwd = workspace();
    for (const path of PHASE_META.clarify.inputs) {
      write(
        cwd,
        path.startsWith('artifacts/')
          ? `artifacts/iterations/ITER-0001/${path.slice('artifacts/'.length)}`
          : path,
        'input',
      );
    }
    write(
      cwd,
      'artifacts/iterations/ITER-0001/01-requirements/stories/US-001.md',
      '# story',
    );
    writeState(cwd, { ...issueBackedFrameState(), phase: 'clarify' });

    expect(() => preparePhaseRun(cwd)).toThrow(
      'Select one clarification story',
    );

    selectClarificationStory(cwd, 'US-001');
    const preparation = preparePhaseRun(cwd);
    if (isCompletedIteration(preparation))
      throw new Error('Unexpected completion.');
    expect(preparation.task).toContain('当前澄清故事：US-001');

    proposeClarificationStoryOutcome(cwd, 'US-001', 'clarified', 'Clear.');
    expect(() => preparePhaseRun(cwd)).toThrow('awaiting a human decision');
    expect(() => preparePhaseRun(cwd)).toThrow('/evidence-story-complete');

    write(
      cwd,
      'artifacts/iterations/ITER-0001/01-requirements/stories/US-002.md',
      '# another story',
    );
    const switched = preparePhaseRun(cwd, { storyId: 'US-002' });
    if (isCompletedIteration(switched))
      throw new Error('Unexpected completion.');
    expect(switched.state.active_clarification_story?.story_id).toBe('US-002');
    expect(switched.state.proposed_clarification_story_outcome).toBeUndefined();
    expect(
      switched.state.paused_clarification_story_outcome_proposals?.[0]
        ?.story_id,
    ).toBe('US-001');
  });
});
