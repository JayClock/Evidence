import { afterEach, describe, expect, it } from 'vitest';
import { statusMarkdown } from './status';
import { DEFAULT_STATE, IDLE_STATE } from '../workflow/phase-catalog';
import { writeState } from '../workflow/state-store';
import {
  cleanupWorkspaces,
  LEAN_STORY_CARD,
  workspace,
  writeIterationArtifact,
} from '../tests/support';

afterEach(cleanupWorkspaces);

describe('status', () => {
  it('reports an idle checkout without requiring an iteration root', () => {
    const cwd = workspace();
    writeState(cwd, IDLE_STATE);
    expect(statusMarkdown(cwd)).toContain('| Phase | idle |');
    expect(statusMarkdown(cwd)).toContain('Select a GitHub Issue');
  });

  it('reports the sole Story and pending TQA Question', () => {
    const cwd = workspace();
    writeIterationArtifact(cwd, '01-kickoff/story.md', LEAN_STORY_CARD);
    writeState(cwd, {
      ...DEFAULT_STATE,
      phase: 'discover',
      pending_clarification: {
        question_id: 'Q-001',
        story_id: 'US-001',
        thought: 'The outcome is unclear.',
        question: 'What is visible?',
        asked_at: '2026-01-01T00:00:00Z',
      },
    });
    const markdown = statusMarkdown(cwd);
    expect(markdown).toContain('| Single Story | US-001 |');
    expect(markdown).toContain('| Pending TQA | Q-001 · US-001 |');
    expect(markdown).not.toContain('Paused');
  });
});
