import { afterEach, describe, expect, it } from 'vitest';
import {
  cleanupWorkspaces,
  LEAN_STORY_CARD,
  workspace,
  writeIterationArtifact,
} from '../tests/support';
import { DEFAULT_STATE } from '../workflow/phase-catalog';
import { validateStoryCards } from './story-cards';

afterEach(cleanupWorkspaces);

describe('lean story cards', () => {
  it('accepts a concise Card with context linkage', () => {
    const cwd = workspace();
    writeIterationArtifact(
      cwd,
      '01-requirements/stories/US-001.md',
      LEAN_STORY_CARD,
    );

    expect(() => validateStoryCards(cwd, DEFAULT_STATE)).not.toThrow();
  });

  it.each(['故事元数据', '优先级依据', '非目标', '待澄清问题'])(
    'rejects the redundant %s section',
    (section) => {
      const cwd = workspace();
      writeIterationArtifact(
        cwd,
        '01-requirements/stories/US-001.md',
        `${LEAN_STORY_CARD}\n## ${section}\n\ncontent\n`,
      );

      expect(() => validateStoryCards(cwd, DEFAULT_STATE)).toThrow(
        `forbidden section "${section}"`,
      );
    },
  );

  it('rejects metadata tables and incomplete three-part stories', () => {
    const cwd = workspace();
    writeIterationArtifact(
      cwd,
      '01-requirements/stories/US-001.md',
      `# US-001 编辑工作区\n\n| 字段 | 值 |\n| --- | --- |\n| Story ID | US-001 |\n`,
    );

    expect(() => validateStoryCards(cwd, DEFAULT_STATE)).toThrow(
      'metadata tables are not allowed',
    );
  });
});
