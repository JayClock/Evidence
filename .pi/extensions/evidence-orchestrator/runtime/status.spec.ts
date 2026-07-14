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
      active_clarification_story: {
        story_id: 'US-001',
        selected_at: '2026-01-01T00:00:00.000Z',
      },
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
    expect(status).toContain('| Active Clarification Story | US-001 |');
    expect(status).toContain('| Pending Clarification | Q-001 · US-001 |');
  });

  it('reports paused clarification work across stories', () => {
    const cwd = workspace();
    writeState(cwd, {
      ...DEFAULT_STATE,
      phase: 'clarify',
      active_clarification_story: {
        story_id: 'US-002',
        selected_at: '2026-01-01T00:00:00.000Z',
      },
      paused_clarifications: [
        {
          question_id: 'Q-001',
          story_id: 'US-001',
          question: 'Who approves?',
          target: 'history',
          asked_at: '2026-01-01T00:01:00.000Z',
        },
      ],
      paused_clarification_story_outcome_proposals: [
        {
          story_id: 'US-003',
          outcome: 'deferred',
          summary: 'Wait.',
          proposed_at: '2026-01-01T00:02:00.000Z',
        },
      ],
    });

    const status = statusMarkdown(cwd);
    expect(status).toContain('| Pending Clarification | Q-001 · US-001 |');
    expect(status).toContain('| Pending Story Decision | US-003 · deferred |');
  });

  it('reports an outcome proposal awaiting human confirmation', () => {
    const cwd = workspace();
    writeState(cwd, {
      ...DEFAULT_STATE,
      phase: 'clarify',
      active_clarification_story: {
        story_id: 'US-001',
        selected_at: '2026-01-01T00:00:00.000Z',
      },
      proposed_clarification_story_outcome: {
        story_id: 'US-001',
        outcome: 'clarified',
        summary: 'Clear.',
        proposed_at: '2026-01-01T00:01:00.000Z',
      },
    });

    expect(statusMarkdown(cwd)).toContain(
      '| Pending Story Decision | US-001 · clarified |',
    );
  });
});
