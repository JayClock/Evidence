import { readFileSync } from 'node:fs';
import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { unresolvedClarificationStoryIds } from '../requirements/clarifications';
import { artifactPath } from '../workflow/iteration-paths';
import { readState } from '../workflow/state-store';

export interface ClarificationStoryListItem {
  storyId: string;
  title: string;
}

type StoryPickerContext = Pick<ExtensionContext, 'cwd' | 'hasUI' | 'ui'>;

function storyTitle(markdown: string, storyId: string): string {
  const heading = markdown
    .split('\n')
    .map((line) => line.trim())
    .find((line) => /^#\s+\S/.test(line));
  if (!heading) return '未命名用户故事';
  const title = heading
    .replace(/^#\s+/, '')
    .replace(new RegExp(`^${storyId}\\s*[-—:：]?\\s*`, 'i'), '')
    .trim();
  return title || '未命名用户故事';
}

export function listSelectableClarificationStories(
  cwd: string,
): ClarificationStoryListItem[] {
  const state = readState(cwd);
  if (state.phase !== 'clarify') {
    throw new Error(
      `Cannot select a clarification story: current phase is ${state.phase}.`,
    );
  }
  if (state.active_clarification_story) {
    throw new Error(
      `Cannot select another story: ${state.active_clarification_story.story_id} is still active.`,
    );
  }
  return unresolvedClarificationStoryIds(cwd, state).map((storyId) => {
    const path = artifactPath(
      cwd,
      state,
      `artifacts/01-requirements/stories/${storyId}.md`,
    );
    return {
      storyId,
      title: storyTitle(readFileSync(path, 'utf8'), storyId),
    };
  });
}

export async function selectClarificationStoryInteractively(
  ctx: StoryPickerContext,
): Promise<string | undefined> {
  if (!ctx.hasUI) {
    throw new Error('Story selection requires an interactive mode.');
  }
  const stories = listSelectableClarificationStories(ctx.cwd);
  if (stories.length === 0) {
    throw new Error('No unselected clarification stories are available.');
  }
  const storyByOption = new Map(
    stories.map((story) => [
      `${story.storyId} · ${story.title}`,
      story.storyId,
    ]),
  );
  const selected = await ctx.ui.select('选择一张用户故事卡进行澄清', [
    ...storyByOption.keys(),
  ]);
  return selected ? storyByOption.get(selected) : undefined;
}
