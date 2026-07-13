import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_STATE, PHASE_META } from '../workflow/phase-catalog';
import { selectClarificationStory } from '../requirements/clarifications';
import { writeState } from '../workflow/state-store';
import { cleanupWorkspaces, workspace, write } from '../tests/support';
import {
  foregroundPhaseRequest,
  isCompletedIteration,
  preparePhaseRun,
} from './phase-dispatch';

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

describe('foreground phase dispatch', () => {
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
  });

  it('instructs the parent agent to call the visible phase tool and stop at decisions', () => {
    const request = foregroundPhaseRequest('Keep scope narrow.');

    expect(request).toContain('evidence_orchestrator_run_phase');
    expect(request).toContain('Keep scope narrow.');
    expect(request).toContain('TQA');
    expect(request).toContain('Gate');
  });
});
