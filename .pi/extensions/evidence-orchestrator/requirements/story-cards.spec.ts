import { afterEach, describe, expect, it } from 'vitest';
import { singleStoryId, validateSingleStoryCard } from './story-cards';
import { DEFAULT_STATE } from '../workflow/phase-catalog';
import {
  cleanupWorkspaces,
  LEAN_STORY_CARD,
  workspace,
  writeIterationArtifact,
} from '../tests/support';

afterEach(cleanupWorkspaces);

describe('single Story Card', () => {
  it('accepts one lean Card and returns its stable ID', () => {
    const cwd = workspace();
    writeIterationArtifact(cwd, '01-kickoff/story.md', LEAN_STORY_CARD);
    expect(singleStoryId(cwd, DEFAULT_STATE)).toBe('US-001');
    expect(() => validateSingleStoryCard(cwd, DEFAULT_STATE)).not.toThrow();
  });

  it('requires the fixed story.md output instead of a Story queue', () => {
    const cwd = workspace();
    writeIterationArtifact(cwd, '01-kickoff/US-001.md', LEAN_STORY_CARD);
    expect(() => validateSingleStoryCard(cwd, DEFAULT_STATE)).toThrow(
      'exactly one non-empty story.md',
    );
  });

  it('rejects clarification and implementation content in the Card', () => {
    const cwd = workspace();
    writeIterationArtifact(
      cwd,
      '01-kickoff/story.md',
      `${LEAN_STORY_CARD}\n## 待澄清问题\n\n谁可以编辑？\n`,
    );
    expect(() => validateSingleStoryCard(cwd, DEFAULT_STATE)).toThrow(
      'forbidden section "待澄清问题"',
    );
  });

  it('requires a success signal and Kickoff context', () => {
    const cwd = workspace();
    writeIterationArtifact(
      cwd,
      '01-kickoff/story.md',
      '# US-001 标题\n\n作为用户，我希望保存，从而看到结果。\n',
    );
    expect(() => validateSingleStoryCard(cwd, DEFAULT_STATE)).toThrow(
      'missing Card marker "成功信号"',
    );
  });
});
