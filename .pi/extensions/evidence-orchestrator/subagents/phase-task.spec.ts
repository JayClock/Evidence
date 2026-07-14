import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_STATE, IDLE_STATE } from '../workflow/phase-catalog';
import { writeState } from '../workflow/state-store';
import { buildPhaseTask } from './phase-task';
import {
  cleanupWorkspaces,
  LEAN_STORY_CARD,
  workspace,
  writeIterationArtifact,
} from '../tests/support';

afterEach(cleanupWorkspaces);

describe('phase tasks', () => {
  it('resolves Kickoff paths into the active iteration namespace', () => {
    const cwd = workspace();
    writeState(cwd, DEFAULT_STATE);
    const task = buildPhaseTask(cwd);
    expect(task).toContain(
      'artifacts/iterations/ITER-0001/00-input/requirements.md',
    );
    expect(task).toContain(
      'artifacts/iterations/ITER-0001/01-kickoff/story.md',
    );
    expect(task).not.toContain('stories/');
  });

  it('scopes Discover to the sole Story and one TQA Question', () => {
    const cwd = workspace();
    writeIterationArtifact(cwd, '01-kickoff/story.md', LEAN_STORY_CARD);
    writeState(cwd, { ...DEFAULT_STATE, phase: 'discover' });
    const task = buildPhaseTask(cwd);
    expect(task).toContain('本轮唯一 Story：US-001');
    expect(task).toContain('先记录 Thought');
    expect(task).not.toContain('evidence_orchestrator_select_story');
  });

  it('instructs Build to select one work item and test processes', () => {
    const cwd = workspace();
    writeIterationArtifact(cwd, '01-kickoff/story.md', LEAN_STORY_CARD);
    writeState(cwd, { ...DEFAULT_STATE, phase: 'build' });
    const task = buildPhaseTask(cwd);
    expect(task).toContain('evidence_orchestrator_select_work_item');
    expect(task).toContain('evidence_orchestrator_select_test_process');
  });

  it('does not create an executable task while idle', () => {
    const cwd = workspace();
    writeState(cwd, IDLE_STATE);
    expect(buildPhaseTask(cwd)).toContain('选择 GitHub Issue');
  });
});
