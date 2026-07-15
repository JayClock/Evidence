import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_STATE } from '../../iteration/default-state';
import { writeState } from '../../iteration/state-repository';
import { cleanupWorkspaces, workspace } from '../../test-support/support';
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

    expect(status).toContain('| Loop | understand |');
    expect(status).toContain('Q-001 · Who confirms the model?');
    expect(status).toContain('## 下一步');
    expect(status).toContain('直接回答 Q-001');
    expect(status).not.toContain('| Schema |');
    expect(status).not.toContain('| Phase |');
    expect(status).not.toContain('| Pending Gate |');
  });

  it('reports an idle repository without inventing an iteration', () => {
    const cwd = workspace();

    const status = statusMarkdown(cwd);

    expect(status).toContain('| Iteration | none |');
    expect(status).toContain('| Loop | idle |');
    expect(status).toContain('| Allowed Actions | /evidence-new |');
    expect(status).toContain('运行 /evidence-new');
  });
});
