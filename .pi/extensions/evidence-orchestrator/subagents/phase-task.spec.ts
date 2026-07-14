import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_STATE } from '../workflow/phase-catalog';
import { writeState } from '../workflow/state-store';
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
