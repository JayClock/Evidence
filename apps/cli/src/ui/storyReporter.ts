import {
  describeStoryExpectation,
  type BusinessStoryProjection,
  type DocumentCardField,
  type StoryScene,
} from '@evidence-poc/evidence-agent';

const emptyMessage = '当前模型中尚无领域故事。';
const inline = (value: string): string =>
  value
    .replace(/\r\n?|\n/gu, ' / ')
    // Strip control characters before adding our own terminal styling.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f]/gu, '');
const markdown = (value: string): string =>
  inline(value)
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/\\/gu, '\\\\')
    .replace(/([`*_{}[\]()#+.!|~=-])/gu, '\\$1');

const handoff = ({
  activity: { actor, recipient },
  timing,
}: StoryScene): string =>
  `${timing.displayDate} · ${actor.roleLabel}${recipient ? ` → ${recipient.roleLabel}` : ''}`;
const groups = ({ documentCard }: StoryScene) =>
  [
    ['核心商业要素', documentCard.keyAttributes],
    ['业务归档要素', documentCard.generalAttributes],
  ] as const;
const detail = ({ label, value, sourceOrigin }: DocumentCardField) =>
  `${label}：${value}${sourceOrigin ? `（据${sourceOrigin}）` : ''}`;
const paragraphs = (prose: string) => prose.trim().split(/\r?\n\s*\r?\n/u);
const nextHeading = (scene: StoryScene) =>
  scene.expectation?.isControlGap ? '协同闭环待补' : '协同待办';

function lineage(
  stories: readonly BusinessStoryProjection[],
  format: (text: string) => string,
): string[] {
  const children = new Map<string, BusinessStoryProjection[]>();
  const ids = new Set(stories.map((story) => story.flowId));
  const roots: BusinessStoryProjection[] = [];
  for (const story of stories) {
    const parent = story.forkedFrom?.storyId;
    if (!parent || !ids.has(parent)) roots.push(story);
    else {
      const siblings = children.get(parent) ?? [];
      siblings.push(story);
      children.set(parent, siblings);
    }
  }
  const pending = roots.reverse().map((story) => ({ story, depth: 0 }));
  const lines: string[] = [];
  while (pending.length) {
    const { story, depth } = pending.pop()!;
    const anchor = story.forkedFrom;
    const source = anchor ? ` ← ${anchor.storyId}#${anchor.stepId}` : '';
    lines.push(
      `${'  '.repeat(depth)}- ${format(`${story.storyTitle} (${story.flowId})${source}`)}`,
    );
    for (const child of (children.get(story.flowId) ?? []).reverse())
      pending.push({ story: child, depth: depth + 1 });
  }
  return lines;
}

export function renderStoryMarkdown(
  stories: readonly BusinessStoryProjection[],
  options: { readonly compact?: boolean } = {},
): string {
  if (stories.length === 0) return emptyMessage;
  const lines = ['# 业务故事', '', '> 业务示例 · 非真实凭证', ''];
  lines.push('## 故事列表与分支', '', ...lineage(stories, markdown), '');
  for (const story of stories) {
    lines.push(`## ${markdown(story.storyTitle)}`, '');
    if (!options.compact)
      lines.push(`**业务目标**：${markdown(story.businessGoal)}`, '');
    for (const scene of story.scenes) {
      lines.push(
        `### ${scene.stepIndex}. ${markdown(scene.narrative.headline)}`,
        '',
        markdown(handoff(scene)),
        '',
      );
      for (const { businessSummary, previousStepIndex } of scene.prerequisites)
        lines.push(
          `- **承接第 ${previousStepIndex} 步**：${markdown(businessSummary)}`,
        );
      if (scene.prerequisites.length) lines.push('');
      if (!options.compact)
        for (const paragraph of paragraphs(scene.narrative.prose))
          lines.push(markdown(paragraph), '');
      lines.push(`#### ${markdown(scene.documentCard.title)}`, '');
      for (const [label, fields] of groups(scene)) {
        if (!fields.length) continue;
        lines.push(
          `**${label}**`,
          '',
          ...fields.map((field) => `- ${markdown(detail(field))}`),
          '',
        );
      }
      if (scene.documentCard.clauseRef)
        lines.push(`条款依据：${markdown(scene.documentCard.clauseRef)}`, '');
      if (scene.expectation)
        lines.push(
          `> **${nextHeading(scene)}**：${markdown(describeStoryExpectation(scene.expectation))}`,
          '',
        );
    }
  }
  return lines.join('\n').trimEnd();
}

/** Color is only enabled for interactive text, never Markdown/JSON or files. */
export function renderStoryText(
  stories: readonly BusinessStoryProjection[],
  options: { readonly compact?: boolean; readonly color: boolean },
): string {
  if (stories.length === 0) return emptyMessage;
  const paint = (code: number, value: string) =>
    options.color ? `\u001b[${code}m${value}\u001b[0m` : value;
  const lines = ['业务故事 · 业务示例', ''];
  lines.push('故事列表与分支', ...lineage(stories, inline), '');
  for (const story of stories) {
    lines.push(paint(36, inline(story.storyTitle)));
    if (!options.compact) lines.push(`业务目标：${inline(story.businessGoal)}`);
    for (const scene of story.scenes) {
      lines.push(
        '',
        paint(1, `${scene.stepIndex}. ${inline(scene.narrative.headline)}`),
        inline(handoff(scene)),
      );
      for (const { businessSummary, previousStepIndex } of scene.prerequisites)
        lines.push(
          `承接第 ${previousStepIndex} 步：${inline(businessSummary)}`,
        );
      if (!options.compact)
        lines.push('', ...paragraphs(scene.narrative.prose).map(inline), '');
      lines.push(`单据：${inline(scene.documentCard.title)}`);
      for (const [label, fields] of groups(scene)) {
        if (!fields.length) continue;
        lines.push(
          `  ${label}`,
          ...fields.map((field) => `  · ${inline(detail(field))}`),
        );
      }
      if (scene.documentCard.clauseRef)
        lines.push(`  条款依据：${inline(scene.documentCard.clauseRef)}`);
      if (scene.expectation)
        lines.push(
          `${nextHeading(scene)}：${inline(describeStoryExpectation(scene.expectation))}`,
        );
    }
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}
