import { Entity, Ref } from '../core';
import type { Story, StoryRevision } from '../delivery';
import type { Iteration } from './iteration';

export type ClarificationTarget = 'business_context' | 'story' | 'history';
export type ClarificationStatus = 'pending' | 'answered' | 'waived';
export type UnderstandingDecisionAction =
  | 'confirm'
  | 'continue'
  | 'split'
  | 'defer';

export interface StoryClarificationDescription {
  reference: string;
  iteration: Ref<string>;
  story: Ref<string>;
  storyRevision: Ref<string>;
  sequence: number;
  target: ClarificationTarget;
  question: string;
  status: ClarificationStatus;
  askedBy: 'requirements_analyst';
  askedAt: string;
  answer: string | null;
  answeredBy: Ref<string> | null;
  answeredAt: string | null;
  waivedReason: string | null;
  waivedBy: Ref<string> | null;
  waivedAt: string | null;
  contentSha256: string;
}

export class StoryClarification
  implements Entity<string, StoryClarificationDescription>
{
  constructor(
    private readonly id: string,
    private readonly desc: StoryClarificationDescription,
  ) {}

  identity(): string {
    return this.id;
  }

  description(): StoryClarificationDescription {
    return this.desc;
  }
}

export interface ScenarioDraftInput {
  title: string;
  given: string[];
  when: string;
  then: string[];
  businessData: string[];
}

export interface ScenarioDraftDescription extends ScenarioDraftInput {
  reference: string;
  position: number;
  proposal: Ref<string>;
  contentSha256: string;
}

export class ScenarioDraft implements Entity<string, ScenarioDraftDescription> {
  constructor(
    private readonly id: string,
    private readonly desc: ScenarioDraftDescription,
  ) {}

  identity(): string {
    return this.id;
  }

  description(): ScenarioDraftDescription {
    return this.desc;
  }
}

export interface ScenarioSetProposalDescription {
  reference: string;
  iteration: Ref<string>;
  story: Ref<string>;
  storyRevision: Ref<string>;
  sequence: number;
  drafts: ScenarioDraft[];
  proposedBy: 'requirements_analyst';
  proposedAt: string;
  contentSha256: string;
}

export class ScenarioSetProposal
  implements Entity<string, ScenarioSetProposalDescription>
{
  constructor(
    private readonly id: string,
    private readonly desc: ScenarioSetProposalDescription,
  ) {}

  identity(): string {
    return this.id;
  }

  description(): ScenarioSetProposalDescription {
    return this.desc;
  }
}

export interface UnderstandingDecisionDescription {
  reference: string;
  iteration: Ref<string>;
  story: Ref<string>;
  storyRevision: Ref<string>;
  proposal: Ref<string> | null;
  proposalSha256: string | null;
  action: UnderstandingDecisionAction;
  reason: string | null;
  selectedDrafts: Ref<string>[];
  confirmedScenarios: Ref<string>[];
  decidedBy: Ref<string>;
  decidedAt: string;
  contentSha256: string;
}

export class UnderstandingDecision
  implements Entity<string, UnderstandingDecisionDescription>
{
  constructor(
    private readonly id: string,
    private readonly desc: UnderstandingDecisionDescription,
  ) {}

  identity(): string {
    return this.id;
  }

  description(): UnderstandingDecisionDescription {
    return this.desc;
  }
}

export interface UnderstandingView {
  iteration: Iteration;
  story: Story;
  storyRevision: StoryRevision;
  pendingClarification: StoryClarification | null;
  clarifications: StoryClarification[];
  currentScenarioProposal: ScenarioSetProposal | null;
  decisions: UnderstandingDecision[];
}

export interface AskClarificationInput {
  expectedIterationVersion: number;
  storyId: string;
  storyRevisionId: string;
  target: ClarificationTarget;
  question: string;
}

export interface AnswerClarificationInput {
  expectedIterationVersion: number;
  clarificationId: string;
  answer: string;
}

export interface ProposeScenarioSetInput {
  expectedIterationVersion: number;
  storyId: string;
  storyRevisionId: string;
  scenarios: ScenarioDraftInput[];
}

export interface DecideUnderstandingInput {
  expectedIterationVersion: number;
  action: UnderstandingDecisionAction;
  proposalId?: string | null;
  proposalSha256?: string | null;
  selectedDraftIds?: string[];
  reason?: string | null;
}

export interface AnswerClarificationResult {
  iteration: Iteration;
  clarification: StoryClarification;
}

export interface UnderstandingDecisionResult {
  iteration: Iteration;
  decision: UnderstandingDecision;
  storyRevision: StoryRevision | null;
}

export interface WorkspaceUnderstanding {
  findUnderstanding(iterationId: string): Promise<UnderstandingView | null>;
  askClarification(
    iterationId: string,
    input: AskClarificationInput,
  ): Promise<StoryClarification>;
  answerClarification(
    iterationId: string,
    input: AnswerClarificationInput,
    answeredByUserId: string,
  ): Promise<AnswerClarificationResult>;
  proposeScenarioSet(
    iterationId: string,
    input: ProposeScenarioSetInput,
  ): Promise<ScenarioSetProposal>;
  decideUnderstanding(
    iterationId: string,
    input: DecideUnderstandingInput,
    decidedByUserId: string,
  ): Promise<UnderstandingDecisionResult>;
}
