import { afterEach, describe, expect, it } from 'vitest';
import {
  isCompletedIteration,
  PhaseRunBlockedError,
  preparePhaseRun,
} from './phase-dispatch';
import {
  PHASE_META,
  DEFAULT_STATE,
  IDLE_STATE,
} from '../workflow/phase-catalog';
import { writeState } from '../workflow/state-store';
import {
  cleanupWorkspaces,
  LEAN_STORY_CARD,
  workspace,
  write,
  writeIterationArtifact,
} from '../tests/support';

afterEach(cleanupWorkspaces);

const SOURCE = {
  type: 'github_issue' as const,
  repository: 'owner/evidence',
  issue_number: 42,
  url: 'https://github.com/owner/evidence/issues/42',
  snapshot_path: 'snapshot',
  projection_path: 'projection',
  content_hash: 'sha256:test',
  issue_updated_at: '2026-01-01T00:00:00Z',
  fetched_at: '2026-01-01T00:00:00Z',
};

function writeInputs(cwd: string, phase: keyof typeof PHASE_META): void {
  for (const path of PHASE_META[phase].inputs) {
    const resolved = path.startsWith('artifacts/')
      ? `artifacts/iterations/ITER-0001/${path.slice('artifacts/'.length)}`
      : path;
    if (resolved.endsWith('/')) write(cwd, `${resolved}input.md`);
    else write(cwd, resolved);
  }
}

describe('phase dispatch', () => {
  it('returns a terminal instruction while idle', () => {
    const cwd = workspace();
    writeState(cwd, IDLE_STATE);
    const preparation = preparePhaseRun(cwd);
    expect(isCompletedIteration(preparation)).toBe(true);
    expect(preparation.task).toContain('选择 GitHub Issue');
  });

  it('requires a frozen Issue for an active phase', () => {
    const cwd = workspace();
    writeState(cwd, DEFAULT_STATE);
    expect(() => preparePhaseRun(cwd)).toThrow('no frozen GitHub Issue');
  });

  it('prepares the current Kickoff without starting an agent', () => {
    const cwd = workspace();
    writeInputs(cwd, 'kickoff');
    writeState(cwd, { ...DEFAULT_STATE, requirement_source: SOURCE });
    const preparation = preparePhaseRun(cwd);
    expect(isCompletedIteration(preparation)).toBe(false);
    if (isCompletedIteration(preparation)) return;
    expect(preparation.phase).toBe('kickoff');
    expect(preparation.task).toContain('单 Story Kickoff');
  });

  it('blocks Discover while one TQA Question awaits the domain expert', () => {
    const cwd = workspace();
    writeInputs(cwd, 'discover');
    writeIterationArtifact(cwd, '01-kickoff/story.md', LEAN_STORY_CARD);
    writeState(cwd, {
      ...DEFAULT_STATE,
      phase: 'discover',
      requirement_source: SOURCE,
      pending_clarification: {
        question_id: 'Q-001',
        story_id: 'US-001',
        thought: 'The result is unclear.',
        question: 'What is visible?',
        asked_at: '2026-01-01T00:00:00Z',
      },
    });
    expect(() => preparePhaseRun(cwd)).toThrow(PhaseRunBlockedError);
    expect(() => preparePhaseRun(cwd)).toThrow('awaiting the domain expert');
  });
});
