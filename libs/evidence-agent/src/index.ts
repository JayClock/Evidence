// ─── Incremental business story projection ─────────────────────────────────
export {
  createFlowStoryProjector,
  projectStoryFacts,
  type FlowStoryProjector,
  type FlowStoryProjectorOptions,
} from './story/flowStoryProjector.js';
export {
  createStoryAgent,
  type StoryAgentOptions,
} from './story/storyAgent.js';
export {
  createStoryNarrator,
  type StoryDraft,
  type StoryNarrationStore,
} from './story/storyNarrator.js';
export {
  simulateWhatIf,
  type WhatIfSimulatorOptions,
} from './story/whatIfSimulator.js';
export {
  describeStoryExpectation,
  storyHistoryItem,
} from './story/storyContinuity.js';
export {
  NarrationSchema,
  StoryDraftSchema,
  WhatIfChallengesSchema,
} from './story/responseSchemas.js';
export {
  DST_CHAINED_STORY_PROMPT,
  WHAT_IF_CHALLENGE_SUGGESTION_PROMPT,
  WHAT_IF_EXPLANATION_PROMPT,
  WHAT_IF_EXTRACTION_PROMPT,
  WHAT_IF_SPECULATIVE_PROMPT,
} from './story/prompts.js';
export type {
  BusinessStoryProjection,
  CausalPrerequisite,
  DocumentCardField,
  StoryFulfillmentRequest,
  DomainActivity,
  NextStepExpectation,
  StoryAgent,
  StoryNarrativeText,
  StoryScene,
  StoryStepHistoryItem,
  WhatIfChallenge,
  WhatIfChallengeCategory,
  WhatIfHypothesis,
  WhatIfInput,
  WhatIfResult,
  WhatIfRuleOutcome,
  WhatIfStoryContext,
} from './story/types.js';

// ─── Agent session and prompts ───────────────────────────────────────────
export {
  CLARIFICATION_PROMPT,
  EVIDENCE_INSTRUCTIONS,
  EVIDENCE_SYSTEM_PROMPT,
  INGESTION_EXAMPLES,
  INGESTION_PROMPT,
  MODELING_PROMPT,
  ROLE_PROMPT,
  STORMING_PROMPT,
  WHAT_IF_PROMPT,
  WORKFLOW_PROMPT,
  buildIngestionPrompt,
} from './prompts/index.js';

export {
  createEvidenceAgentSession,
  openEvidenceSessionRuntime,
  type EvidenceAgentSession,
  type EvidenceAgentSessionOptions,
  type EvidenceModelOptions,
} from './session/evidenceAgentSession.js';

export {
  projectSessionEvent,
  type AgentStreamEvent,
} from './session/streamEvents.js';

// ─── Tools the agent calls back into ──────────────────────────────────────
export {
  TOOL_NAMES,
  createEvidenceToolsExtension,
  evidenceToolNames,
  type CanvasContext,
  type EvidenceToolDefinition,
  type EvidenceToolsHandlers,
  type ModelPatchRequest,
  type ModelPatchResult,
} from './tools/evidenceTools.js';

// Compatibility for Node callers that consume the agent and its sensors together.
export * from '@evidence-poc/evidence-agent-sensors';
