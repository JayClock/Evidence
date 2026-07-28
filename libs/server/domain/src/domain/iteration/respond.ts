import { Entity, Ref } from '../core';
import type { Story, StoryRevision } from '../delivery';
import type { Iteration } from './iteration';
import type { ShowcaseDecision, ShowcaseRun } from './showcase';

export type RespondKnowledgeKind =
  | 'product'
  | 'model'
  | 'architecture'
  | 'contract'
  | 'test_process'
  | 'skill'
  | 'prompt'
  | 'other';
export type RespondPromotionDecision = 'promoted' | 'deferred' | 'rejected';
export type RespondDecisionAction = 'approve' | 'revise';

export interface RespondPromotion {
  sourceRef: string;
  kind: RespondKnowledgeKind;
  decision: RespondPromotionDecision;
  reason: string;
  validationEvidenceRefs: string[];
  canonicalTarget: string | null;
}

export interface RespondNextProbe {
  question: string;
  whyNow: string;
  evidenceRefs: string[];
  firstAction: string;
}

export interface RespondAuthority {
  storyRevisionSha256: string;
  approvedTaskingPlanSha256: string;
  pairManifestSha256: string;
  approvedCommitSha: string;
  showcaseEvidenceBundleSha256: string;
  showcaseReviewSha256: string;
  showcaseDecisionSha256: string;
  authoritySha256: string;
}

export interface RespondCandidateDescription {
  reference: string;
  sequence: number;
  workspace: Ref<string>;
  iteration: Ref<string>;
  story: Ref<string>;
  storyRevision: Ref<string>;
  showcaseRun: Ref<string>;
  showcaseDecision: Ref<string>;
  authority: RespondAuthority;
  promotions: RespondPromotion[];
  noPromotionReason: string | null;
  observedOutcomes: string[];
  residualRisks: string[];
  nextProbe: RespondNextProbe;
  proposedAt: string;
  contentSha256: string;
}

export class RespondCandidate
  implements Entity<string, RespondCandidateDescription>
{
  constructor(
    private readonly id: string,
    private readonly desc: RespondCandidateDescription,
  ) {}

  identity(): string {
    return this.id;
  }

  description(): RespondCandidateDescription {
    return this.desc;
  }
}

export interface RespondDecisionDescription {
  candidate: Ref<string>;
  action: RespondDecisionAction;
  reason: string;
  candidateSha256: string;
  authoritySha256: string;
  decidedBy: Ref<string>;
  decidedAt: string;
  contentSha256: string;
}

export class RespondDecision
  implements Entity<string, RespondDecisionDescription>
{
  constructor(
    private readonly id: string,
    private readonly desc: RespondDecisionDescription,
  ) {}

  identity(): string {
    return this.id;
  }

  description(): RespondDecisionDescription {
    return this.desc;
  }
}

interface RespondActionAuthority {
  actionId: string;
  expectedIterationVersion: number;
  authoritySha256: string;
}

export type RespondNextAction =
  | (RespondActionAuthority & {
      kind: 'run_learner';
      showcaseRunId: string;
      showcaseDecisionId: string;
    })
  | (RespondActionAuthority & {
      kind: 'await_human';
      candidateId: string;
      candidateSha256: string;
    });

export interface RespondView {
  iteration: Iteration;
  story: Story;
  storyRevision: StoryRevision;
  showcaseRun: ShowcaseRun;
  showcaseDecision: ShowcaseDecision;
  authority: RespondAuthority;
  candidates: RespondCandidate[];
  decisions: RespondDecision[];
  nextAction: RespondNextAction | null;
}

export interface ProposeRespondCandidateInput {
  actionId: string;
  expectedIterationVersion: number;
  authoritySha256: string;
  promotions: RespondPromotion[];
  noPromotionReason?: string | null;
  observedOutcomes: string[];
  residualRisks: string[];
  nextProbe: RespondNextProbe;
}

export interface DecideRespondInput {
  expectedIterationVersion: number;
  candidateId: string;
  candidateSha256: string;
  authoritySha256: string;
  action: RespondDecisionAction;
  reason: string;
}

export interface RespondActionResult {
  view: RespondView;
  acceptedRecordId: string;
}

export interface WorkspaceRespond {
  findRespond(iterationId: string): Promise<RespondView | null>;
  proposeCandidate(
    iterationId: string,
    input: ProposeRespondCandidateInput,
  ): Promise<RespondActionResult>;
  decideRespond(
    iterationId: string,
    input: DecideRespondInput,
    decidedByUserId: string,
  ): Promise<RespondActionResult>;
}
