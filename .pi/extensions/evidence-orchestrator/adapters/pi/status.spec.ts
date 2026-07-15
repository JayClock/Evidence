import { writeFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_STATE } from '../../iteration/default-state';
import { statePath, writeState } from '../../iteration/state-repository';
import { cleanupWorkspaces, workspace, write } from '../../tests/support';
import { statusMarkdown } from './status';

afterEach(cleanupWorkspaces);

describe('status', () => {
  it('reports native loop state without phase or gate controls', () => {
    const cwd = workspace();
    writeState(cwd, {
      ...DEFAULT_STATE,
      loop: 'understand',
      understand_stage: 'tqa',
      active_clarification_story: {
        story_id: 'US-001',
        selected_at: '2026-01-01T00:00:00.000Z',
      },
      pending_clarification: {
        question_id: 'Q-001',
        story_id: 'US-001',
        question: 'Who confirms the model?',
        target: 'history',
        asked_at: '2026-01-01T00:01:00.000Z',
      },
    });

    const status = statusMarkdown(cwd);

    expect(status).toContain('| Schema | v5 native |');
    expect(status).toContain('| Loop | understand |');
    expect(status).toContain('Q-001 · Who confirms the model?');
    expect(status).not.toContain('| Phase |');
    expect(status).not.toContain('| Pending Gate |');
  });

  it('reports terminal v4 state and historical files as read-only', () => {
    const cwd = workspace();
    writeFileSync(
      statePath(cwd),
      `${JSON.stringify({
        iteration_id: 'ITER-0001',
        phase: 'complete',
        pi: { enabled: true, version: 4 },
      })}\n`,
    );
    write(
      cwd,
      'artifacts/iterations/ITER-0001/05-code/US-001/SC-001.json',
      '{}',
    );

    const status = statusMarkdown(cwd);

    expect(status).toContain('v4 legacy · immutable/read-only');
    expect(status).toContain('| Legacy Phase | complete |');
    expect(status).toContain('SC-001.json');
    expect(status).toContain('/evidence-new only');
  });
});
