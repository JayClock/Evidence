import type {
  EvidenceKind,
  StoryForkAnchor,
  StoryKind,
} from '@evidence-poc/evidence-schema';

export interface StepFingerprintInput {
  readonly entityId: string;
  readonly entityKind: EvidenceKind;
  readonly actorRef: string;
  readonly activity: string;
  readonly targetActorRef?: string;
  readonly asOf: string;
  readonly basedOn: readonly string[];
  readonly values: Readonly<Record<string, unknown>>;
  readonly derivedAssertions?: Readonly<Record<string, unknown>>;
  readonly expectedStatus?: number;
}

export interface FlowStepTrace extends StepFingerprintInput {
  /** Identity in the authoring story, including for inherited steps. */
  readonly storyId: string;
  readonly stepId: string;
  readonly inherited: boolean;
  readonly sequence: number;
  readonly stepHash: string;
  readonly entityLabel: string;
  readonly contextRef?: string;
  readonly responsibleRoleRef?: string;
  readonly description?: string;
  readonly gaps: readonly string[];
}

export interface FlowScenarioTrace {
  readonly flowId: string;
  readonly flowTitle: string;
  readonly kind: StoryKind;
  readonly forkedFrom?: StoryForkAnchor;
  readonly involvedContextRefs: readonly string[];
  readonly involvedRoleRefs: readonly string[];
  readonly steps: readonly FlowStepTrace[];
  readonly traceDigest: string;
}
