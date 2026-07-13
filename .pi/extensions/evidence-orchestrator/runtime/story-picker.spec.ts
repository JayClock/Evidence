import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_STATE } from '../workflow/phase-catalog';
import { writeState } from '../workflow/state-store';
import {
  cleanupWorkspaces,
  workspace,
  writeIterationArtifact,
} from '../tests/support';
import {
  listSelectableClarificationStories,
  selectClarificationStoryInteractively,
} from './story-picker';

describe('clarification story picker', () => {
  it('lists unresolved story cards with their Markdown titles', () => {
    const cwd = workspace();
    writeState(cwd, {
      ...DEFAULT_STATE,
      phase: 'clarify',
      clarification_story_outcomes: [
        {
          story_id: 'US-002',
          outcome: 'deferred',
          summary: 'Not in this iteration.',
          completed_at: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    writeIterationArtifact(
      cwd,
      '01-requirements/stories/US-001.md',
      '# 编辑工作区信息\n',
    );
    writeIterationArtifact(
      cwd,
      '01-requirements/stories/US-002.md',
      '# 删除工作区\n',
    );

    expect(listSelectableClarificationStories(cwd)).toEqual([
      { storyId: 'US-001', title: '编辑工作区信息' },
    ]);
  });

  it('returns the story manually selected by the user', async () => {
    const cwd = workspace();
    writeState(cwd, { ...DEFAULT_STATE, phase: 'clarify' });
    writeIterationArtifact(
      cwd,
      '01-requirements/stories/US-001.md',
      '# 编辑工作区信息\n',
    );
    const select = vi.fn().mockResolvedValue('US-001 · 编辑工作区信息');

    await expect(
      selectClarificationStoryInteractively({
        cwd,
        hasUI: true,
        ui: { select },
      } as never),
    ).resolves.toBe('US-001');
    expect(select).toHaveBeenCalledWith('选择一张用户故事卡进行澄清', [
      'US-001 · 编辑工作区信息',
    ]);
  });
});

afterEach(cleanupWorkspaces);
