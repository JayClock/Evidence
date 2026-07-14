import { existsSync, readFileSync, statSync } from 'node:fs';
import { artifactPath } from '../workflow/iteration-paths';
import { readState } from '../workflow/state-store';
import type { WorkflowState } from '../workflow/types';

const STORY_HEADING = /^#\s+(US-\d{3,})(?:\s|$)/m;
const FORBIDDEN_SECTION =
  /^(?:故事元数据|优先级依据|非目标|待澄清问题|验收示例|实现方案)$/;
const MARKDOWN_TABLE_SEPARATOR = /^\s*\|(?:\s*:?-{3,}:?\s*\|)+\s*$/m;

function storyPath(cwd: string, state: WorkflowState): string {
  return artifactPath(cwd, state, 'artifacts/01-kickoff/story.md');
}

function storyMarkdown(cwd: string, state: WorkflowState): string {
  const path = storyPath(cwd, state);
  if (
    !existsSync(path) ||
    !statSync(path).isFile() ||
    statSync(path).size === 0
  ) {
    throw new Error(
      'Kickoff must produce exactly one non-empty story.md Card.',
    );
  }
  return readFileSync(path, 'utf8');
}

/** Return the only Story ID allowed to be active in this iteration. */
export function singleStoryId(
  cwd: string,
  state: WorkflowState = readState(cwd),
): string {
  const markdown = storyMarkdown(cwd, state);
  const storyId = STORY_HEADING.exec(markdown)?.[1];
  if (!storyId) {
    throw new Error(
      'Invalid story.md Card: heading must start with "# US-xxx".',
    );
  }
  return storyId;
}

/** Enforce a lean, single-Story Card at Kickoff. */
export function validateSingleStoryCard(
  cwd: string,
  state: WorkflowState = readState(cwd),
): void {
  const markdown = storyMarkdown(cwd, state);
  const storyId = singleStoryId(cwd, state);

  if (MARKDOWN_TABLE_SEPARATOR.test(markdown)) {
    throw new Error(
      `Invalid story Card ${storyId}: metadata tables are not allowed.`,
    );
  }
  const sections = [...markdown.matchAll(/^##\s+(.+?)\s*$/gm)].map(
    (match) => match[1] ?? '',
  );
  const forbidden = sections.find((section) => FORBIDDEN_SECTION.test(section));
  if (forbidden) {
    throw new Error(
      `Invalid story Card ${storyId}: forbidden section "${forbidden}".`,
    );
  }
  for (const marker of ['作为', '我希望', '从而', '成功信号']) {
    if (!markdown.includes(marker)) {
      throw new Error(
        `Invalid story Card ${storyId}: missing Card marker "${marker}".`,
      );
    }
  }
  if (!markdown.includes('kickoff.md')) {
    throw new Error(
      `Invalid story Card ${storyId}: missing kickoff.md context link.`,
    );
  }
}
