import { existsSync, readFileSync, readdirSync } from 'node:fs';
import type { WorkflowState } from '../workflow/types';
import { artifactPath } from '../workflow/iteration-paths';

const STORY_FILE = /^US-\d{3,}\.md$/;
const FORBIDDEN_SECTION = /^(?:故事元数据|优先级依据|非目标|待澄清问题)$/;
const MARKDOWN_TABLE_SEPARATOR = /^\s*\|(?:\s*:?-{3,}:?\s*\|)+\s*$/m;

function validateStoryCard(storyId: string, markdown: string): void {
  if (MARKDOWN_TABLE_SEPARATOR.test(markdown)) {
    throw new Error(
      `Invalid story card ${storyId}: metadata tables are not allowed.`,
    );
  }

  const section = markdown.match(/^##\s+(.+?)\s*$/m)?.[1];
  if (section) {
    if (FORBIDDEN_SECTION.test(section)) {
      throw new Error(
        `Invalid story card ${storyId}: forbidden section "${section}".`,
      );
    }
    throw new Error(
      `Invalid story card ${storyId}: additional section "${section}" is not allowed.`,
    );
  }

  if (!new RegExp(`^#\\s+${storyId}(?:\\s|$)`, 'm').test(markdown)) {
    throw new Error(
      `Invalid story card ${storyId}: heading must start with "# ${storyId}".`,
    );
  }

  for (const marker of ['作为', '我希望', '从而']) {
    if (!markdown.includes(marker)) {
      throw new Error(
        `Invalid story card ${storyId}: missing three-part story marker "${marker}".`,
      );
    }
  }

  if (!markdown.includes('problem-statement.md')) {
    throw new Error(
      `Invalid story card ${storyId}: missing problem-statement.md context link.`,
    );
  }
}

/** Enforce Card/Conversation/Confirmation separation for Frame outputs. */
export function validateStoryCards(cwd: string, state: WorkflowState): void {
  const directory = artifactPath(
    cwd,
    state,
    'artifacts/01-requirements/stories',
  );
  const entries = existsSync(directory)
    ? readdirSync(directory, { withFileTypes: true })
        .filter((entry) => entry.isFile() && STORY_FILE.test(entry.name))
        .sort((left, right) => left.name.localeCompare(right.name))
    : [];

  if (entries.length === 0) {
    throw new Error('No US-xxx story cards were found for Frame validation.');
  }

  for (const entry of entries) {
    const storyId = entry.name.replace(/\.md$/, '');
    validateStoryCard(
      storyId,
      readFileSync(`${directory}/${entry.name}`, 'utf8'),
    );
  }
}
