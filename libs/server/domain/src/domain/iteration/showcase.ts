import { Entity, Ref } from '../core';
import type { Story, StoryRevision } from '../delivery';
import type { Iteration, IterationLoop, IterationStage } from './iteration';
import type { PairExecutionManifest, PairRun, PairTermination } from './pair';
import type { ApprovedTaskingPlan } from './tasking';

export type ShowcaseStage =
  | 'setup'
  | 'reviewing'
  | 'decision'
  | 'accepted'
  | 'revised'
  | 'rejected';
export type ShowcaseQuadrant = 'Q3' | 'Q4';
export type ShowcaseRiskDisposition = 'required' | 'not_required';
export type ShowcaseEvaluationOutcome = 'passed' | 'concern';
export type ShowcaseReviewRecommendation = 'accept' | 'revise';
export type ShowcaseDecisionAction = 'accept' | 'revise' | 'reject';
export type ShowcaseFeedbackTarget =
  | 'problem'
  | 'story'
  | 'business_knowledge'
  | 'scenario'
  | 'model'
  | 'modeling_method'
  | 'architecture'
  | 'test_strategy'
  | 'test_process'
  | 'test'
  | 'implementation'
  | 'refactor'
  | 'value_validation'
  | 'showcase_setup';
export type ShowcaseQ3Activity =
  | 'exploratory'
  | 'usability'
  | 'accessibility'
  | 'compatibility'
  | 'other';
export type ShowcaseQ4Activity =
  | 'performance'
  | 'security'
  | 'reliability'
  | 'operability'
  | 'other';
export type ShowcaseRiskActivity = ShowcaseQ3Activity | ShowcaseQ4Activity;

export interface ShowcaseFeedbackRoute {
  loop: IterationLoop;
  stage: IterationStage;
}

export const SHOWCASE_FEEDBACK_ROUTES: Record<
  ShowcaseFeedbackTarget,
  ShowcaseFeedbackRoute
> = {
  problem: { loop: 'kickoff', stage: 'candidate_drafting' },
  story: { loop: 'kickoff', stage: 'candidate_drafting' },
  business_knowledge: { loop: 'understand', stage: 'tqa' },
  scenario: { loop: 'understand', stage: 'tqa' },
  model: { loop: 'understand', stage: 'modeling' },
  modeling_method: { loop: 'understand', stage: 'modeling' },
  architecture: { loop: 'tasking', stage: 'drafting' },
  test_strategy: { loop: 'tasking', stage: 'drafting' },
  test_process: { loop: 'tasking', stage: 'drafting' },
  test: { loop: 'pair', stage: 'plan_confirmed' },
  implementation: { loop: 'pair', stage: 'red_observed' },
  refactor: { loop: 'pair', stage: 'green_observed' },
  value_validation: { loop: 'showcase', stage: 'setup' },
  showcase_setup: { loop: 'showcase', stage: 'setup' },
};

export interface ShowcaseRunDescription {
  reference: string;
  attempt: number;
  workspace: Ref<string>;
  iteration: Ref<string>;
  story: Ref<string>;
  storyRevision: Ref<string>;
  storyRevisionSha256: string;
  approvedTaskingPlan: Ref<string>;
  approvedTaskingPlanSha256: string;
  pairRun: Ref<string>;
  pairManifest: Ref<string>;
  pairManifestSha256: string;
  approvedCommitSha: string;
  stage: ShowcaseStage;
  version: number;
  evidenceBundleSha256: string | null;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export class ShowcaseRun implements Entity<string, ShowcaseRunDescription> {
  constructor(
    private readonly id: string,
    private readonly desc: ShowcaseRunDescription,
  ) {}

  identity(): string {
    return this.id;
  }

  description(): ShowcaseRunDescription {
    return this.desc;
  }
}

export interface ShowcaseQ2ObservationDescription {
  showcaseRun: Ref<string>;
  actionId: string;
  sequence: number;
  testId: string;
  scenarioIds: string[];
  processId: string;
  stepId: string;
  projectId: string | null;
  command: string;
  termination: PairTermination;
  exitCode: number | null;
  signal: string | null;
  durationMs: number;
  stdoutSha256: string;
  stdoutBytes: number;
  stdoutLines: number;
  stderrSha256: string;
  stderrBytes: number;
  stderrLines: number;
  approvedCommitSha: string;
  worktreeSha256: string;
  observedAt: string;
  previousRecordSha256: string | null;
  recordSha256: string;
}

export class ShowcaseQ2Observation
  implements Entity<string, ShowcaseQ2ObservationDescription>
{
  constructor(
    private readonly id: string,
    private readonly desc: ShowcaseQ2ObservationDescription,
  ) {}

  identity(): string {
    return this.id;
  }

  description(): ShowcaseQ2ObservationDescription {
    return this.desc;
  }
}

export interface ShowcaseProductObservationDescription {
  showcaseRun: Ref<string>;
  scenarioId: string;
  scenarioReference: string;
  givenSteps: string[];
  whenStep: string;
  expectedThenSteps: string[];
  businessData: string[];
  observedOutcomes: string[];
  observation: string;
  valueFeedback: string;
  evidenceRefs: string[];
  observedBy: Ref<string>;
  observedAt: string;
  contentSha256: string;
}

export class ShowcaseProductObservation
  implements Entity<string, ShowcaseProductObservationDescription>
{
  constructor(
    private readonly id: string,
    private readonly desc: ShowcaseProductObservationDescription,
  ) {}

  identity(): string {
    return this.id;
  }

  description(): ShowcaseProductObservationDescription {
    return this.desc;
  }
}

export interface ShowcaseRiskDecisionDescription {
  showcaseRun: Ref<string>;
  quadrant: ShowcaseQuadrant;
  disposition: ShowcaseRiskDisposition;
  activities: ShowcaseRiskActivity[];
  reason: string;
  decidedBy: Ref<string>;
  decidedAt: string;
  contentSha256: string;
}

export class ShowcaseRiskDecision
  implements Entity<string, ShowcaseRiskDecisionDescription>
{
  constructor(
    private readonly id: string,
    private readonly desc: ShowcaseRiskDecisionDescription,
  ) {}

  identity(): string {
    return this.id;
  }

  description(): ShowcaseRiskDecisionDescription {
    return this.desc;
  }
}

export interface ShowcaseEvaluationDescription {
  showcaseRun: Ref<string>;
  sequence: number;
  quadrant: ShowcaseQuadrant;
  activity: ShowcaseRiskActivity;
  outcome: ShowcaseEvaluationOutcome;
  finding: string;
  evidenceRefs: string[];
  observedBy: Ref<string>;
  observedAt: string;
  contentSha256: string;
}

export class ShowcaseEvaluation
  implements Entity<string, ShowcaseEvaluationDescription>
{
  constructor(
    private readonly id: string,
    private readonly desc: ShowcaseEvaluationDescription,
  ) {}

  identity(): string {
    return this.id;
  }

  description(): ShowcaseEvaluationDescription {
    return this.desc;
  }
}

export interface ShowcaseReviewDescription {
  showcaseRun: Ref<string>;
  evidenceBundleSha256: string;
  observedFacts: string[];
  productDomainFeedback: string[];
  technicalQualityFeedback: string[];
  unresolvedAssumptions: string[];
  recommendation: ShowcaseReviewRecommendation;
  reviewedAt: string;
  contentSha256: string;
}

export class ShowcaseReview
  implements Entity<string, ShowcaseReviewDescription>
{
  constructor(
    private readonly id: string,
    private readonly desc: ShowcaseReviewDescription,
  ) {}

  identity(): string {
    return this.id;
  }

  description(): ShowcaseReviewDescription {
    return this.desc;
  }
}

export interface ShowcaseDecisionDescription {
  showcaseRun: Ref<string>;
  action: ShowcaseDecisionAction;
  reason: string;
  feedbackTarget: ShowcaseFeedbackTarget | null;
  evidenceBundleSha256: string | null;
  review: Ref<string> | null;
  decidedBy: Ref<string>;
  decidedAt: string;
  contentSha256: string;
}

export class ShowcaseDecision
  implements Entity<string, ShowcaseDecisionDescription>
{
  constructor(
    private readonly id: string,
    private readonly desc: ShowcaseDecisionDescription,
  ) {}

  identity(): string {
    return this.id;
  }

  description(): ShowcaseDecisionDescription {
    return this.desc;
  }
}

interface ShowcaseActionAuthority {
  actionId: string;
  expectedShowcaseVersion: number;
}

export type ShowcaseNextAction = ShowcaseActionAuthority &
  (
    | {
        kind: 'execute_q2';
        testId: string;
        scenarioIds: string[];
        processId: string;
        stepId: string;
        projectId: string | null;
        command: string;
        timeoutMs: number;
        approvedCommitSha: string;
      }
    | {
        kind: 'observe_scenario';
        scenarioId: string;
        scenarioReference: string;
      }
    | { kind: 'decide_risk'; quadrant: ShowcaseQuadrant }
    | {
        kind: 'evaluate_risk';
        quadrant: ShowcaseQuadrant;
        activity: ShowcaseRiskActivity;
      }
    | { kind: 'run_reviewer'; evidenceBundleSha256: string }
    | { kind: 'await_human'; reviewId: string; reviewSha256: string }
    | {
        kind: 'resolve_failure';
        observationId: string;
        allowedActions: Array<'revise' | 'reject'>;
      }
  );

export interface ShowcaseView {
  iteration: Iteration;
  story: Story;
  storyRevision: StoryRevision;
  approvedPlan: ApprovedTaskingPlan;
  pairRun: PairRun;
  pairManifest: PairExecutionManifest;
  run: ShowcaseRun;
  q2Observations: ShowcaseQ2Observation[];
  productObservations: ShowcaseProductObservation[];
  riskDecisions: ShowcaseRiskDecision[];
  evaluations: ShowcaseEvaluation[];
  review: ShowcaseReview | null;
  decision: ShowcaseDecision | null;
  nextAction: ShowcaseNextAction | null;
}

export interface RecordShowcaseQ2ObservationInput {
  showcaseRunId: string;
  actionId: string;
  expectedShowcaseVersion: number;
  command: string;
  termination: PairTermination;
  exitCode: number | null;
  signal?: string | null;
  durationMs: number;
  stdoutSha256: string;
  stdoutBytes: number;
  stdoutLines: number;
  stderrSha256: string;
  stderrBytes: number;
  stderrLines: number;
  approvedCommitSha: string;
  worktreeSha256: string;
}

export interface RecordShowcaseProductObservationInput {
  expectedShowcaseVersion: number;
  scenarioId: string;
  observedOutcomes: string[];
  observation: string;
  valueFeedback: string;
  evidenceRefs: string[];
}

export interface RecordShowcaseRiskDecisionInput {
  expectedShowcaseVersion: number;
  quadrant: ShowcaseQuadrant;
  disposition: ShowcaseRiskDisposition;
  activities: ShowcaseRiskActivity[];
  reason: string;
}

export interface RecordShowcaseEvaluationInput {
  expectedShowcaseVersion: number;
  quadrant: ShowcaseQuadrant;
  activity: ShowcaseRiskActivity;
  outcome: ShowcaseEvaluationOutcome;
  finding: string;
  evidenceRefs: string[];
}

export interface RecordShowcaseReviewInput {
  expectedShowcaseVersion: number;
  evidenceBundleSha256: string;
  observedFacts: string[];
  productDomainFeedback: string[];
  technicalQualityFeedback: string[];
  unresolvedAssumptions: string[];
  recommendation: ShowcaseReviewRecommendation;
}

export interface DecideShowcaseInput {
  expectedShowcaseVersion: number;
  action: ShowcaseDecisionAction;
  reason: string;
  evidenceBundleSha256?: string | null;
  reviewSha256?: string | null;
  feedbackTarget?: ShowcaseFeedbackTarget | null;
}

export interface ShowcaseActionResult {
  view: ShowcaseView;
  acceptedRecordId: string;
}

export interface WorkspaceShowcase {
  findShowcase(iterationId: string): Promise<ShowcaseView | null>;
  recordQ2Observation(
    iterationId: string,
    input: RecordShowcaseQ2ObservationInput,
  ): Promise<ShowcaseActionResult>;
  recordProductObservation(
    iterationId: string,
    input: RecordShowcaseProductObservationInput,
    observedByUserId: string,
  ): Promise<ShowcaseActionResult>;
  recordRiskDecision(
    iterationId: string,
    input: RecordShowcaseRiskDecisionInput,
    decidedByUserId: string,
  ): Promise<ShowcaseActionResult>;
  recordEvaluation(
    iterationId: string,
    input: RecordShowcaseEvaluationInput,
    observedByUserId: string,
  ): Promise<ShowcaseActionResult>;
  recordReview(
    iterationId: string,
    input: RecordShowcaseReviewInput,
  ): Promise<ShowcaseActionResult>;
  decideShowcase(
    iterationId: string,
    input: DecideShowcaseInput,
    decidedByUserId: string,
  ): Promise<ShowcaseActionResult>;
}
