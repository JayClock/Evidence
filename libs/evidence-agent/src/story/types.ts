import type { DomainModelDocument } from '@evidence-poc/evidence-schema';
import type { FlowScenarioTrace } from '@evidence-poc/evidence-model-core';

/** A field on a business document, including its modeled data provenance. */
export interface DocumentCardField {
  readonly name: string;
  readonly label: string;
  readonly value: string;
  readonly sourceOrigin?: string;
}

export type DomainActionVerb =
  | 'sign'
  | 'submit'
  | 'confirm'
  | 'issue'
  | 'notify'
  | 'claim_breach'
  | 'escalate';

export interface StoryRole {
  readonly roleId: string;
  readonly businessName: string;
  readonly organization?: string;
}

export interface DomainActivity {
  readonly actor: StoryRole;
  readonly actionVerb: DomainActionVerb;
  readonly actionPhrase: string;
  readonly workObject: {
    readonly entityId: string;
    readonly entityLabel: string;
    readonly entityKind: string;
    readonly referenceCode?: string;
  };
  readonly recipient?: StoryRole;
  readonly rejectedExample?: true;
}

export interface CausalPrerequisite {
  readonly previousStepIndex: number;
  readonly fromActorLabel: string;
  readonly workObjectLabel: string;
  readonly businessSummary: string;
}

export interface NextStepExpectation {
  readonly assignedToRoleLabel: string;
  readonly expectedWorkObject: string;
  readonly deadlineNotice?: string;
  readonly isControlGap: boolean;
}

export interface StoryStepHistoryItem {
  readonly stepIndex: number;
  readonly headline: string;
  readonly summary: string;
}

export interface StoryNarrativeText {
  readonly headline: string;
  readonly prose: string;
}

export interface StoryScene {
  /** The trace's one-based sequence, assigned by the projector, never the LLM. */
  readonly stepIndex: number;
  readonly stepHash: string;
  readonly timing: {
    readonly rawIso: string;
    readonly displayDate: string;
    readonly relativeTime?: string;
  };
  readonly activity: DomainActivity;
  readonly prerequisites: readonly CausalPrerequisite[];
  readonly narrative: StoryNarrativeText & {
    readonly status: 'baseline' | 'enriching' | 'ready' | 'authored';
  };
  readonly documentCard: {
    readonly title: string;
    readonly keyAttributes: readonly DocumentCardField[];
    readonly generalAttributes: readonly DocumentCardField[];
    readonly clauseRef?: string;
  };
  readonly expectation?: NextStepExpectation;
  readonly ruleEvaluations: readonly {
    readonly ruleName: string;
    readonly explanation: string;
    readonly satisfied: boolean;
  }[];
}

export interface BusinessStoryProjection {
  readonly flowId: string;
  readonly storyTitle: string;
  readonly storySummary: string;
  readonly businessGoal: string;
  readonly scenes: readonly StoryScene[];
}

/** A narrow, injectable LLM boundary. Every response is runtime-validated. */
export interface StoryAgent {
  generate(request: {
    readonly systemPrompt: string;
    readonly userPrompt: string;
    readonly signal?: AbortSignal;
    readonly purpose?: 'narration';
  }): Promise<unknown>;
}

export interface WhatIfHypothesis {
  /** An explicit RFC 3339 clock; never inferred from the machine's date. */
  readonly asOf?: string;
  /** Partial overrides of the current step's declared input attributes only. */
  readonly values?: Readonly<Record<string, unknown>>;
}

export interface WhatIfInput {
  readonly model: DomainModelDocument;
  readonly flow: FlowScenarioTrace;
  readonly currentStepSequence: number;
  readonly hypothesisQuestion: string;
  /** Bypass natural-language extraction for reproducible callers/tests. */
  readonly hypothesis?: WhatIfHypothesis;
  /** Select one relevant rule; otherwise evaluate all completion/breach rules. */
  readonly ruleId?: string;
  /** Explicit opt-in for freeform AI exploration when no decision rules exist. */
  readonly allowSpeculative?: boolean;
}

export interface WhatIfRuleOutcome {
  readonly ruleId: string;
  readonly result: boolean;
}

export interface RuleBasedWhatIfResult {
  readonly isSpeculative: false;
  readonly hypothesis: WhatIfHypothesis;
  /** First outcome, retained as the single-rule convenience contract. */
  readonly ruleOutcome: WhatIfRuleOutcome;
  readonly ruleOutcomes: readonly WhatIfRuleOutcome[];
  readonly businessImpactExplanation: string;
}

export interface SpeculativeWhatIfResult {
  readonly isSpeculative: true;
  readonly hypothesis?: WhatIfHypothesis;
  readonly ruleOutcome?: never;
  readonly ruleOutcomes: readonly [];
  readonly businessImpactExplanation: string;
}

export type WhatIfResult = RuleBasedWhatIfResult | SpeculativeWhatIfResult;
