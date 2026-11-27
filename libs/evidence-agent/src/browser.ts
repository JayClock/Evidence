export * from '@evidence-poc/evidence-agent-sensors/browser';

/**
 * The projected agent event stream the renderer draws from. Type-only: the
 * session harness behind it stays in the process entry (`.`).
 */
export type { AgentStreamEvent } from './session/streamEvents.js';

// Story DTOs are safe to consume without loading the Node agent runtime.
export type {
  StoryScene,
  DocumentCardField,
  WhatIfChallenge,
  WhatIfChallengeCategory,
  WhatIfHypothesis,
  WhatIfResult,
  WhatIfRuleOutcome,
  NextStepExpectation,
} from './story/types.js';
export {
  describeStoryExpectation,
  describeWhatIfOutcome,
  storyHistoryItem,
} from './story/storyContinuity.js';
