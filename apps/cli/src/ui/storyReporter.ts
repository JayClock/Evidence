import {
  describeStoryExpectation,
  type BusinessStoryProjection,
  type DocumentCardField,
  type StoryScene,
} from '@evidence-poc/evidence-agent';

const emptyMessage =
  '当前模型中未检测到带有 examples[].test.flow 的业务流场景。';
const inline = (value: string): string =>
  value
    .replace(/\r\n?|\n/gu, ' / ')
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

export function renderStoryMarkdown(
  stories: readonly BusinessStoryProjection[],
  options: { readonly compact?: boolean } = {},
): string {
  if (stories.length === 0) return emptyMessage;
  const lines = ['# 业务故事', '', '> 业务示例 · 非真实凭证', ''];
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
      for (const rule of scene.ruleEvaluations)
        lines.push(
          `- ${rule.satisfied ? '✓' : '✗'} ${markdown(rule.ruleName)}：${markdown(rule.explanation)}`,
        );
      if (scene.ruleEvaluations.length) lines.push('');
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
      for (const rule of scene.ruleEvaluations)
        lines.push(
          paint(
            rule.satisfied ? 32 : 31,
            `${rule.satisfied ? '✓' : '✗'} ${inline(rule.ruleName)}：${inline(rule.explanation)}`,
          ),
        );
      if (scene.expectation)
        lines.push(
          `${nextHeading(scene)}：${inline(describeStoryExpectation(scene.expectation))}`,
        );
    }
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}
