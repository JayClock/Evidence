import type {
  NextStepExpectation,
  StoryScene,
  StoryStepHistoryItem,
} from './types.js';

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
