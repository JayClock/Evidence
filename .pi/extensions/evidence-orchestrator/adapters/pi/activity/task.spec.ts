import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_STATE } from '../../../iteration/default-state';
import { readState, writeState } from '../../../iteration/state-repository';
import { buildActivityTask, MAX_ACTIVITY_CAPSULE_BYTES } from './task';
import { cleanupWorkspaces, workspace } from '../../../test-support/support';

const scenario = {
  version: 1 as const,
  story_id: 'US-001',
  scenario_id: 'SC-001',
  source_draft_id: 'DRAFT-001',
  title: 'Confirm current model',
  given: ['v3 is confirmed'],
  when: 'The lead opens the workspace',
  then: ['v3 is shown as current'],
  business_data: ['version=v3'],
  artifact_path:
    'artifacts/iterations/ITER-0001/01-requirements/examples/US-001-SC-001.md',
  confirmed_by: 'human' as const,
  confirmation_reason: 'Smallest value.',
  confirmed_at: '2026-01-01T00:00:00.000Z',
};

afterEach(cleanupWorkspaces);

describe('activity tasks', () => {
  it('prepares one unnumbered Kickoff candidate', () => {
    const cwd = workspace();
    writeState(cwd, DEFAULT_STATE);

    const task = buildActivityTask(cwd);

    expect(task).toMatch(/^# Evidence Activity Context Capsule v1/);
    expect(task).toContain(
      'artifacts/iterations/ITER-0001/00-user-input/requirements.md',
    );
    expect(task).toContain('evidence_orchestrator_propose_kickoff');
    expect(task).toContain('不分配 US-xxx');
  });

  it('loads Story TQA progressively for one worktree-local Story', () => {
    const cwd = workspace();
    writeState(cwd, {
      ...DEFAULT_STATE,
      loop: 'understand',
      understand_stage: 'tqa',
      active_clarification_story: {
        story_id: 'US-001',
        selected_at: '2026-01-01T00:00:00.000Z',
      },
      understanding_decisions: [
        {
          action: 'continue',
          reason: 'Cover the concurrent-edit boundary.',
          decided_by: 'human',
          decided_at: '2026-01-01T00:01:00.000Z',
        },
      ],
    });

    const task = buildActivityTask(cwd);

    expect(task).toContain('.pi/skills/evidence-story-tqa/SKILL.md');
    expect(task).toContain(
      'artifacts/iterations/ITER-0001/01-requirements/clarifications/US-001.json (read if present; canonical clarification history)',
    );
    expect(task).toContain('evidence_orchestrator_ask_question');
    expect(task).toContain('evidence_orchestrator_propose_scenarios');
    expect(task).toContain('Cover the concurrent-edit boundary.');
  });

  it('routes Profile and Expansion through their Skills', () => {
    const cwd = workspace();
    writeState(cwd, {
      ...DEFAULT_STATE,
      loop: 'understand',
      understand_stage: 'modeling',
      modeling_stage: 'profile',
      confirmed_scenarios: [scenario],
    });
    expect(buildActivityTask(cwd)).toContain(
      '.pi/skills/evidence-modeling-router/SKILL.md',
    );

    writeState(cwd, {
      ...readState(cwd),
      modeling_stage: 'expansion',
      modeling_profile: {
        version: 1,
        subject: 'domain',
        method: 'object',
        model_change_required: false,
        reason: 'Existing model.',
        confirmed_by: 'human',
        confirmed_at: '2026-01-01T00:01:00.000Z',
      },
    });
    const expansion = buildActivityTask(cwd);
    expect(expansion).toContain('.pi/skills/evidence-model-expansion/SKILL.md');
    expect(expansion).toContain('evidence_orchestrator_record_model_analysis');

    writeState(cwd, {
      ...readState(cwd),
      modeling_profile: {
        version: 1,
        subject: 'tool',
        method: 'none',
        model_change_required: false,
        confirmed_by: 'human',
        confirmed_at: '2026-01-01T00:02:00.000Z',
      },
    });
    const noModel = buildActivityTask(cwd);
    expect(noModel).toContain('无模型影响确认');
    expect(noModel).not.toContain('evidence-model-expansion/SKILL.md');
    expect(noModel).not.toContain(
      'evidence_orchestrator_record_model_analysis',
    );
  });

  it('keeps Tasking contextual and waits for human Desk Check', () => {
    const cwd = workspace();
    writeState(cwd, {
      ...DEFAULT_STATE,
      loop: 'tasking',
      understand_stage: 'modeling',
      confirmed_scenarios: [scenario],
      modeling_stage: 'model_confirmed',
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
      model_git_baseline: 'baseline',
      model_challenges: [
        {
          version: 1,
          requested_outcome: 'pass',
          outcome: 'pass',
          summary: 'The model explains the Scenario.',
          checked_regression_ids: ['REG-001'],
          projection_sha256: 'projection-sha',
          artifact_path: 'challenge.json',
          challenged_by: 'model-challenger',
          challenged_at: '2026-01-01T00:01:30.000Z',
        },
      ],
      model_decisions: [
        {
          version: 1,
          action: 'confirm',
          reason: 'The model language is shared.',
          challenge_artifact_path: 'challenge.json',
          challenge_artifact_sha256: 'challenge-sha',
          projection_sha256: 'projection-sha',
          model_expansion_sha256: 'expansion-sha',
          artifact_path: 'model-decision.json',
          decided_by: 'human',
          decided_at: '2026-01-01T00:02:00.000Z',
        },
      ],
      tasking_stage: 'drafting',
    });

    const task = buildActivityTask(cwd);

    expect(task).toContain('.pi/skills/evidence-test-process/SKILL.md');
    expect(task).toContain('evidence_orchestrator_propose_tasking');
    expect(task).toContain('/evidence-desk-check');
    expect(task).not.toContain('Sprint backlog');
  });

  it('includes one requested outcome, enforced boundaries, and no global inventory', () => {
    const cwd = workspace();
    writeState(cwd, DEFAULT_STATE);

    const task = buildActivityTask(
      cwd,
      'Prefer the smallest reviewable value.',
    );

    expect(task.match(/requested_outcome=/g)).toHaveLength(1);
    expect(task).toContain(
      'additional_instruction=Prefer the smallest reviewable value.',
    );
    expect(task).toContain('tools=read,evidence_orchestrator_propose_kickoff');
    expect(task).toContain('write_roots=none');
    expect(task).toContain('call exactly once');
    expect(task).not.toContain('evidence_orchestrator_status');
    expect(task).not.toContain('Code Files');
    expect(task).not.toContain('Activity by Agent');
  });

  it('fails closed when the deterministic Capsule exceeds 16 KiB', () => {
    const cwd = workspace();
    writeState(cwd, DEFAULT_STATE);

    expect(() => buildActivityTask(cwd, '界'.repeat(6_000))).toThrow(
      `maximum is ${MAX_ACTIVITY_CAPSULE_BYTES}`,
    );
  });
});
