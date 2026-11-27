import type { FlowScenarioTrace } from '@evidence-poc/evidence-model-core';
import type { DomainModelDocument } from '@evidence-poc/evidence-schema';
import type {
  BusinessStoryProjection,
  StoryNarrativeText,
  StoryStepHistoryItem,
  WhatIfChallenge,
  WhatIfHypothesis,
  WhatIfResult,
} from '@evidence-poc/evidence-agent';

export type {
  WhatIfChallenge,
  WhatIfChallengeCategory,
  WhatIfRuleOutcome,
} from '@evidence-poc/evidence-agent';

export const STORY_IPC_CHANNELS = {
  LOAD: 'evidence:story:load',
  ENRICH_STEP: 'evidence:story:enrich-step',
  CANCEL_STEP: 'evidence:story:cancel-step',
  WHAT_IF: 'evidence:story:what-if',
  INVALIDATED: 'evidence:story:invalidated',
} as const;

/** Explicit snapshots include unsaved inspector edits; omission reads disk. */
export interface StoryModelInput {
  readonly rootPath: string;
  readonly document?: DomainModelDocument;
}

export interface StoryLoadInput extends StoryModelInput {
  readonly preferredFlowId?: string;
}

export interface StoryProjectResult {
  readonly flow: FlowScenarioTrace;
  readonly projection: BusinessStoryProjection;
}

export interface StorySnapshot {
  readonly snapshotId: string;
  readonly flows: readonly FlowScenarioTrace[];
  readonly selected?: StoryProjectResult;
}

export interface StoryStepRequest {
  readonly rootPath: string;
  readonly snapshotId: string;
  /** Attempts at the same step have different IDs so a late cancel cannot stop a retry. */
  readonly requestId: string;
  readonly stepIndex: number;
  readonly stepHash: string;
}

export interface StoryEnrichStepInput extends StoryStepRequest {
  readonly storyHistory: readonly StoryStepHistoryItem[];
  /** Read an existing draft without resolving credentials or generating prose. */
  readonly cacheOnly?: boolean;
}

export interface StoryEnrichStepResult {
  readonly stepIndex: number;
  readonly stepHash: string;
  readonly narrative: StoryNarrativeText;
  readonly challenges?: readonly WhatIfChallenge[];
  readonly cached: boolean;
}

export interface StoryWhatIfInput extends StoryModelInput {
  readonly flowId: string;
  readonly currentStepSequence: number;
  /** Refuse to answer against a step that changed since it was displayed. */
  readonly stepHash: string;
  readonly question: string;
  readonly asOf?: string;
  readonly hypothesisDraft?: WhatIfHypothesis;
  readonly targetedRuleId?: string;
  /** Evaluate a selected, structured challenge without resolving a provider. */
  readonly localOnly?: boolean;
  /** Allow speculative freeform AI inference when no CEL completion/breach rules exist. */
  readonly allowSpeculative?: boolean;
}

export interface StoryInvalidatedEvent {
  readonly rootPath: string;
  /** Model/credential changes invalidate prose only, not the fact snapshot. */
  readonly kind?: 'narration';
}

export interface EvidenceStoryApi {
  load: (input: StoryLoadInput) => Promise<StorySnapshot>;
  /** Null means cancelled, already authored, or no matching cached draft. */
  enrichStep: (
    input: StoryEnrichStepInput,
  ) => Promise<StoryEnrichStepResult | null>;
  cancelStep: (input: StoryStepRequest) => Promise<void>;
  whatIf: (input: StoryWhatIfInput) => Promise<WhatIfResult>;
  onInvalidated: (
    listener: (event: StoryInvalidatedEvent) => void,
  ) => () => void;
}
