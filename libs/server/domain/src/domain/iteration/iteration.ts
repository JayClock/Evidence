import { Entity, Ref } from '../core';
import type {
  InboxCandidateCitationDescription,
  InboxExtractionSourceDescription,
  InboxStoryCandidateInput,
} from '../inbox';

export type IterationLifecycle =
  | 'provisioning'
  | 'active'
  | 'provisioning_failed'
  | 'halted';
export type IterationLoop = 'kickoff' | 'understand';
export type IterationStage =
  | 'candidate_review'
  | 'candidate_drafting'
  | 'tqa'
  | 'scenario_review'
  | 'modeling';
export type KickoffDecisionAction =
  | 'confirm'
  | 'revise'
  | 'split'
  | 'defer'
  | 'stop';

export interface IterationDescription {
  reference: string;
  workspace: Ref<string>;
  sourceCandidate: Ref<string>;
  sourceCandidateSha256: string;
  lifecycle: IterationLifecycle;
  loop: IterationLoop;
  stage: IterationStage;
  lane: 'discovery';
  version: number;
  baseCommitSha: string;
  branchName: string | null;
  provisioningFailureSummary: string | null;
  activeStory: Ref<string> | null;
  admittedBy: Ref<string>;
  admittedAt: string;
  updatedAt: string;
}

export class Iteration implements Entity<string, IterationDescription> {
  constructor(
    private readonly id: string,
    private readonly desc: IterationDescription,
  ) {}

  identity(): string {
    return this.id;
  }

  description(): IterationDescription {
    return this.desc;
  }
}

export interface FrozenCandidateSnapshot {
  candidateId: string;
  candidateReference: string;
  extractionId: string;
  title: string;
  problem: string;
  role: string;
  goal: string;
  value: string;
  cognitiveMode: 'clear' | 'complicated' | 'complex';
  citations: InboxCandidateCitationDescription[];
  contentSha256: string;
  proposedAt: string;
}

export interface IterationIntakeDescription {
  iteration: Ref<string>;
  candidate: FrozenCandidateSnapshot;
  sources: InboxExtractionSourceDescription[];
  requirementsProjection: string;
  contentSha256: string;
  frozenAt: string;
}

export class IterationIntake
  implements Entity<string, IterationIntakeDescription>
{
  constructor(
    private readonly id: string,
    private readonly desc: IterationIntakeDescription,
  ) {}

  identity(): string {
    return this.id;
  }

  description(): IterationIntakeDescription {
    return this.desc;
  }
}

export interface KickoffProposalDescription {
  reference: string;
  iteration: Ref<string>;
  sequence: number;
  origin: 'inbox_candidate' | 'requirements_analyst';
  title: string;
  problem: string;
  role: string;
  goal: string;
  value: string;
  cognitiveMode: 'clear' | 'complicated' | 'complex';
  citations: InboxCandidateCitationDescription[];
  contentSha256: string;
  proposedAt: string;
}

export class KickoffProposal
  implements Entity<string, KickoffProposalDescription>
{
  constructor(
    private readonly id: string,
    private readonly desc: KickoffProposalDescription,
  ) {}

  identity(): string {
    return this.id;
  }

  description(): KickoffProposalDescription {
    return this.desc;
  }
}

export interface KickoffDecisionDescription {
  reference: string;
  iteration: Ref<string>;
  proposal: Ref<string>;
  proposalSha256: string;
  action: KickoffDecisionAction;
  reason: string | null;
  decidedBy: Ref<string>;
  decidedAt: string;
  contentSha256: string;
}

export class KickoffDecision
  implements Entity<string, KickoffDecisionDescription>
{
  constructor(
    private readonly id: string,
    private readonly desc: KickoffDecisionDescription,
  ) {}

  identity(): string {
    return this.id;
  }

  description(): KickoffDecisionDescription {
    return this.desc;
  }
}

export interface ProblemStatementDescription {
  iteration: Ref<string>;
  story: Ref<string>;
  revisionNumber: number;
  title: string;
  problem: string;
  cognitiveMode: 'clear' | 'complicated' | 'complex';
  citations: InboxCandidateCitationDescription[];
  contentSha256: string;
  createdAt: string;
}

export class ProblemStatement
  implements Entity<string, ProblemStatementDescription>
{
  constructor(
    private readonly id: string,
    private readonly desc: ProblemStatementDescription,
  ) {}

  identity(): string {
    return this.id;
  }

  description(): ProblemStatementDescription {
    return this.desc;
  }
}

export interface StoryCardDescription {
  reference: 'US-001';
  iteration: Ref<string>;
  story: Ref<string>;
  revisionNumber: number;
  title: string;
  role: string;
  goal: string;
  value: string;
  problemStatement: Ref<string>;
  contentSha256: string;
  createdAt: string;
}

export class StoryCard implements Entity<string, StoryCardDescription> {
  constructor(
    private readonly id: string,
    private readonly desc: StoryCardDescription,
  ) {}

  identity(): string {
    return this.id;
  }

  description(): StoryCardDescription {
    return this.desc;
  }
}

export interface SelectInboxCandidateInput {
  candidateId: string;
  candidateSha256: string;
  baseCommitSha: string;
}

export interface CompleteIterationProvisioningInput {
  expectedVersion: number;
  baseCommitSha: string;
  branchName: string;
}

export interface FailIterationProvisioningInput {
  expectedVersion: number;
  reason: string;
}

export interface KickoffDecisionInput {
  proposalId: string;
  proposalSha256: string;
  expectedIterationVersion: number;
  action: KickoffDecisionAction;
  reason?: string | null;
}

export interface SelectedIteration {
  iteration: Iteration;
  intake: IterationIntake;
  proposal: KickoffProposal;
}

export interface KickoffView {
  iteration: Iteration;
  intake: IterationIntake;
  currentProposal: KickoffProposal | null;
  decisions: KickoffDecision[];
}

export interface KickoffDecisionResult {
  iteration: Iteration;
  decision: KickoffDecision;
  problemStatement: ProblemStatement | null;
  storyCard: StoryCard | null;
}

export interface WorkspaceIterations {
  selectCandidate(
    input: SelectInboxCandidateInput,
    selectedByUserId: string,
  ): Promise<SelectedIteration>;
  findIteration(iterationId: string): Promise<Iteration | null>;
  findIntake(iterationId: string): Promise<IterationIntake | null>;
  completeProvisioning(
    iterationId: string,
    input: CompleteIterationProvisioningInput,
  ): Promise<Iteration>;
  failProvisioning(
    iterationId: string,
    input: FailIterationProvisioningInput,
  ): Promise<Iteration>;
  findKickoff(iterationId: string): Promise<KickoffView | null>;
  proposeKickoffReplacement(
    iterationId: string,
    expectedIterationVersion: number,
    proposal: InboxStoryCandidateInput,
  ): Promise<KickoffProposal>;
  decideKickoff(
    iterationId: string,
    input: KickoffDecisionInput,
    decidedByUserId: string,
  ): Promise<KickoffDecisionResult>;
}
