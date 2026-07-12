import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_STATE } from '../workflow/phase-catalog';
import { statusMarkdown } from './status';
import { writeState } from '../workflow/state-store';
import { cleanupWorkspaces, workspace } from '../tests/support';

afterEach(cleanupWorkspaces);

describe('status', () => {
  it('reports the iteration, phase, and pending clarification', () => {
    const cwd = workspace();
    writeState(cwd, {
      ...DEFAULT_STATE,
      phase: 'clarify',
      pending_clarification: {
        question_id: 'Q-001',
        story_id: 'US-001',
        question: 'Who approves?',
        target: 'history',
        asked_at: '2026-01-01T00:00:00.000Z',
      },
    });
    const status = statusMarkdown(cwd);
    expect(status).toContain('| Iteration | ITER-0001 |');
    expect(status).toContain('| Pending Clarification | Q-001 · US-001 |');
  });
});
