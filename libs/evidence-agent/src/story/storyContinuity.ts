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

export const describeStoryExpectation = (
  expectation: NextStepExpectation,
): string =>
  `${expectation.assignedToRoleLabel}待${expectation.deadlineNotice ?? ''}${expectation.isControlGap ? '落实' : '接续'}${expectation.expectedWorkObject}。`;
