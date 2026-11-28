import type {
  NextStepExpectation,
  RuleBasedWhatIfResult,
  StoryScene,
  StoryStepHistoryItem,
  WhatIfRuleOutcome,
} from './types.js';

export function describeWhatIfOutcome(
  { ruleId, kind, result }: WhatIfRuleOutcome,
  completionGap?: RuleBasedWhatIfResult['completionGap'],
): string {
  if (completionGap?.ruleId === ruleId) return '截止时仍未达成，构成逾期违约';
  if (completionGap && kind === 'breach' && !result) return '该违约约定未触发';
  if (kind === 'breach') return result ? '触发违约' : '未触发违约';
  return result ? '完成条件已达成' : '完成条件未达成';
}

/** Only accepted local explanations and completed drafts become prompt history. */
export const storyHistoryItem = ({
  stepIndex,
  narrative,
}: StoryScene): StoryStepHistoryItem | undefined =>
  narrative.status === 'authored' || narrative.status === 'ready'
    ? {
        stepIndex,
        headline: narrative.headline,
        summary: narrative.prose,
      }
    : undefined;

export const describeStoryExpectation = ({
  assignedToRoleLabel,
  expectedWorkObject,
  deadlineNotice,
  isControlGap,
}: NextStepExpectation): string => {
  const action = `${isControlGap ? '落实' : '接续'}${expectedWorkObject}`;
  return assignedToRoleLabel === '责任方待明确'
    ? `待${deadlineNotice ?? ''}${action}，责任方待明确。`
    : `待${assignedToRoleLabel}${deadlineNotice ?? ''}${action}。`;
};
