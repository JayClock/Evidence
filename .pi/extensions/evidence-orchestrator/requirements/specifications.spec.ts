import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_STATE } from '../workflow/phase-catalog';
import { completePhase } from '../workflow/gates';
import { writeState } from '../workflow/state-store';
import {
  cleanupWorkspaces,
  workspace,
  writeIterationArtifact,
} from '../tests/support';
import {
  confirmedSpecificationStoryIds,
  validateConfirmedStoriesSpecified,
} from './specifications';

const CONFIRMED_AT = '2026-01-01T00:00:00.000Z';

afterEach(cleanupWorkspaces);

describe('specification coverage', () => {
  it('requires acceptance examples for every confirmed clarified Story', () => {
    const cwd = workspace();
    const state = writeState(cwd, {
      ...DEFAULT_STATE,
      phase: 'specify',
      clarification_story_outcomes: [
        {
          story_id: 'US-001',
          outcome: 'clarified',
          summary: '编辑边界已经明确。',
          completed_at: CONFIRMED_AT,
          decided_by: 'human',
          confirmed_at: CONFIRMED_AT,
        },
        {
          story_id: 'US-002',
          outcome: 'clarified',
          summary: '归档边界已经明确。',
          completed_at: CONFIRMED_AT,
          decided_by: 'human',
          confirmed_at: CONFIRMED_AT,
        },
        {
          story_id: 'US-003',
          outcome: 'deferred',
          summary: '等待新的合规政策。',
          completed_at: CONFIRMED_AT,
          decided_by: 'human',
          confirmed_at: CONFIRMED_AT,
        },
      ],
    });
    writeIterationArtifact(
      cwd,
      '01-requirements/examples/US-001-SC-001.md',
      'Given 一个工作区\nWhen 管理员编辑名称\nThen 新名称可见\n',
    );

    expect(confirmedSpecificationStoryIds(state)).toEqual(['US-001', 'US-002']);
    expect(() => validateConfirmedStoriesSpecified(cwd, state)).toThrow(
      'missing acceptance examples for confirmed stories: US-002',
    );
    expect(() => completePhase(cwd, 'specify')).toThrow(
      'missing acceptance examples for confirmed stories: US-002',
    );

    writeIterationArtifact(
      cwd,
      '01-requirements/examples/US-002-SC-001.md',
      'Given 一个工作区\nWhen 管理员归档工作区\nThen 工作区显示为已归档\n',
    );

    expect(() => validateConfirmedStoriesSpecified(cwd, state)).not.toThrow();
    expect(completePhase(cwd, 'specify').phase).toBe('validate');
  });
});
