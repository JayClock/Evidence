import type { FlowScenarioTrace } from '@evidence-poc/evidence-model-core';
import type { DomainModelDocument } from '@evidence-poc/evidence-schema';
import type {
  BusinessStoryProjection,
  WhatIfResult,
} from '@evidence-poc/evidence-agent';

export const STORY_IPC_CHANNELS = {
  LOAD: 'evidence:story:load',
  START_NARRATION: 'evidence:story:start-narration',
  CANCEL_NARRATION: 'evidence:story:cancel-narration',
  NARRATION: 'evidence:story:narration',
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

export interface StoryNarrationJob {
  readonly snapshotId: string;
  readonly jobId: string;
}

export interface StoryNarrationInput extends StoryNarrationJob {
  readonly prioritySequence?: number;
  /** Read existing candidates without resolving credentials or generating a draft. */
  readonly cacheOnly?: true;
}

export type StoryNarrationEvent = StoryNarrationJob &
  (
    | {
        readonly kind: 'step';
        readonly sequence: number;
        readonly stepHash: string;
        readonly narrative?: string;
        readonly cached?: true;
      }
    | { readonly kind: 'finished'; readonly reason?: 'timeout' | 'unavailable' }
  );

export interface StoryWhatIfInput extends StoryModelInput {
  readonly flowId: string;
  readonly currentStepSequence: number;
  /** Refuse to answer against a step that changed since it was displayed. */
  readonly stepHash: string;
  readonly question: string;
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
  startNarration: (input: StoryNarrationInput) => Promise<void>;
  cancelNarration: (job: StoryNarrationJob) => Promise<void>;
  onNarration: (listener: (event: StoryNarrationEvent) => void) => () => void;
  whatIf: (input: StoryWhatIfInput) => Promise<WhatIfResult>;
  onInvalidated: (
    listener: (event: StoryInvalidatedEvent) => void,
  ) => () => void;
}
