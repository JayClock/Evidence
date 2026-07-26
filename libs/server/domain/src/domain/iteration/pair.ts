import { Entity, Ref } from '../core';
import type { Story, StoryRevision } from '../delivery';
import type { Iteration } from './iteration';
import type {
  ApprovedTaskingPlan,
  PairExecutionBudget,
  TaskingProcessSelection,
  TaskingTaskDescription,
  TaskingTestDescription,
} from './tasking';
import type { TaskingProcessStepDefinition } from './tasking-catalog';

export type PairStatus =
  | 'running'
  | 'approval_required'
  | 'approved'
  | 'exception'
  | 'cancelled';

export type PairCheckpoint =
  | 'plan_confirmed'
  | 'test_written'
  | 'red_observed'
  | 'implementation_written'
  | 'green_observed'
  | 'refactored'
  | 'quality_gate_failed'
  | 'quality_gates_passed'
  | 'approved'
  | 'exception';

export type PairDriverRole = 'test' | 'production' | 'refactor';
export type PairDriverMode =
  | 'write_test'
  | 'repair_test'
  | 'implement'
  | 'repair_implementation'
  | 'refactor'
  | 'repair_refactor'
  | 'repair_quality_gate';
export type PairCommandStage = 'red' | 'green' | 'refactor' | 'quality_gate';
export type PairTermination =
  | 'exited'
  | 'timed_out'
  | 'signaled'
  | 'spawn_error';
export type PairRedClassification =
  | 'behavior'
  | 'compile'
  | 'dependency'
  | 'configuration'
  | 'network'
  | 'fixture'
  | 'other';
export type PairExceptionKind =
  | 'unexpected_green'
  | 'pseudo_red'
  | 'green_failed'
  | 'refactor_failed'
  | 'quality_gate_failed'
  | 'path_violation'
  | 'git_head_changed'
  | 'project_ownership_changed'
  | 'lease_expired'
  | 'interrupted'
  | 'budget_exhausted'
  | 'no_progress'
  | 'evidence_mismatch'
  | 'runtime_failure';
export type PairDecisionAction =
  | 'approve'
  | 'back_test'
  | 'back_implementation'
  | 'back_tasking'
  | 'retry_quality'
  | 'cancel';

export interface PairCursor {
  unitIndex: number;
  pendingRefactorStepKey: string | null;
  refactorVerificationIndex: number;
  qualityGateIndex: number;
}

export interface PairBudgetUsage {
  agentCalls: number;
  checkpoints: number;
  repeatedFingerprintCount: number;
  noProgressCheckpoints: number;
}

export interface PairRunDescription {
  reference: string;
  workspace: Ref<string>;
  iteration: Ref<string>;
  story: Ref<string>;
  storyRevision: Ref<string>;
  storyRevisionSha256: string;
  approvedTaskingPlan: Ref<string>;
  approvedTaskingPlanSha256: string;
  baseCommitSha: string;
  branchName: string;
  status: PairStatus;
  checkpoint: PairCheckpoint;
  version: number;
  cursor: PairCursor;
  completedTestIds: string[];
  completedStepKeys: string[];
  executionBudget: PairExecutionBudget;
  budgetUsage: PairBudgetUsage;
  leaseOwnerId: string | null;
  leaseExpiresAt: string | null;
  currentDiffSha256: string | null;
  finalManifestSha256: string | null;
  approvedCommitSha: string | null;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export class PairRun implements Entity<string, PairRunDescription> {
  constructor(
    private readonly id: string,
    private readonly desc: PairRunDescription,
  ) {}

  identity(): string {
    return this.id;
  }

  description(): PairRunDescription {
    return this.desc;
  }
}

export interface PairWorkUnit {
  index: number;
  stepKey: string;
  task: TaskingTaskDescription;
  test: TaskingTestDescription;
  process: TaskingProcessSelection;
  step: TaskingProcessStepDefinition;
  focusedCommand: {
    command: string;
    projectId: string | null;
  };
  testRoots: string[];
  productionRoots: string[];
}

export interface PairQualityGate {
  index: number;
  processId: string;
  projectId: string | null;
  target: string | null;
  command: string;
}

export interface PairDriverAttemptDescription {
  pairRun: Ref<string>;
  actionId: string;
  sequence: number;
  role: PairDriverRole;
  mode: PairDriverMode;
  taskId: string | null;
  testId: string | null;
  processId: string | null;
  stepId: string | null;
  summary: string;
  changedPaths: string[];
  beforeWorktreeSha256: string;
  afterWorktreeSha256: string;
  diffSha256: string;
  agentCallCount: number;
  inputTokens: number | null;
  outputTokens: number | null;
  completedAt: string;
  recordSha256: string;
}

export class PairDriverAttempt
  implements Entity<string, PairDriverAttemptDescription>
{
  constructor(
    private readonly id: string,
    private readonly desc: PairDriverAttemptDescription,
  ) {}

  identity(): string {
    return this.id;
  }

  description(): PairDriverAttemptDescription {
    return this.desc;
  }
}

export interface PairCommandObservationDescription {
  pairRun: Ref<string>;
  actionId: string;
  sequence: number;
  stage: PairCommandStage;
  taskId: string | null;
  testId: string | null;
  processId: string;
  stepId: string | null;
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
  worktreeSha256: string;
  diffSha256: string;
  failureFingerprint: string | null;
  observedAt: string;
  previousRecordSha256: string | null;
  recordSha256: string;
}

export class PairCommandObservation
  implements Entity<string, PairCommandObservationDescription>
{
  constructor(
    private readonly id: string,
    private readonly desc: PairCommandObservationDescription,
  ) {}

  identity(): string {
    return this.id;
  }

  description(): PairCommandObservationDescription {
    return this.desc;
  }
}

export interface PairRedReviewDescription {
  pairRun: Ref<string>;
  actionId: string;
  observation: Ref<string>;
  classification: PairRedClassification;
  accepted: boolean;
  reason: string;
  reviewedAt: string;
  recordSha256: string;
}

export class PairRedReview implements Entity<string, PairRedReviewDescription> {
  constructor(
    private readonly id: string,
    private readonly desc: PairRedReviewDescription,
  ) {}

  identity(): string {
    return this.id;
  }

  description(): PairRedReviewDescription {
    return this.desc;
  }
}

export interface PairAutomationExceptionDescription {
  pairRun: Ref<string>;
  actionId: string | null;
  kind: PairExceptionKind;
  summary: string;
  failureFingerprint: string | null;
  allowedRoutes: PairDecisionAction[];
  raisedAt: string;
  resolvedAt: string | null;
  recordSha256: string;
}

export class PairAutomationException
  implements Entity<string, PairAutomationExceptionDescription>
{
  constructor(
    private readonly id: string,
    private readonly desc: PairAutomationExceptionDescription,
  ) {}

  identity(): string {
    return this.id;
  }

  description(): PairAutomationExceptionDescription {
    return this.desc;
  }
}

export interface PairExecutionManifestDescription {
  pairRun: Ref<string>;
  approvedTaskingPlanSha256: string;
  storyRevisionSha256: string;
  baseCommitSha: string;
  completedTestIds: string[];
  completedStepKeys: string[];
  driverAttemptIds: string[];
  commandObservationIds: string[];
  redReviewIds: string[];
  changedPaths: string[];
  finalDiffSha256: string;
  evidenceChainSha256: string;
  generatedAt: string;
  contentSha256: string;
}

export class PairExecutionManifest
  implements Entity<string, PairExecutionManifestDescription>
{
  constructor(
    private readonly id: string,
    private readonly desc: PairExecutionManifestDescription,
  ) {}

  identity(): string {
    return this.id;
  }

  description(): PairExecutionManifestDescription {
    return this.desc;
  }
}

export interface PairCodingDecisionDescription {
  pairRun: Ref<string>;
  action: PairDecisionAction;
  reason: string;
  manifestSha256: string | null;
  diffSha256: string | null;
  commitSha: string | null;
  decidedBy: Ref<string>;
  decidedAt: string;
  contentSha256: string;
}

export class PairCodingDecision
  implements Entity<string, PairCodingDecisionDescription>
{
  constructor(
    private readonly id: string,
    private readonly desc: PairCodingDecisionDescription,
  ) {}

  identity(): string {
    return this.id;
  }

  description(): PairCodingDecisionDescription {
    return this.desc;
  }
}

interface PairActionAuthority {
  actionId: string;
  expectedPairVersion: number;
}

export type PairNextAction = PairActionAuthority &
  (
    | {
        kind: 'run_driver';
        role: PairDriverRole;
        mode: PairDriverMode;
        workUnit: PairWorkUnit | null;
        stepKey: string | null;
        allowedTestRoots: string[];
        allowedProductionRoots: string[];
        frozenTestPaths: string[];
        diagnosticObservationId: string | null;
      }
    | {
        kind: 'execute_command';
        stage: PairCommandStage;
        workUnit: PairWorkUnit | null;
        gate: PairQualityGate | null;
        command: string;
        timeoutMs: number;
      }
    | {
        kind: 'review_red';
        workUnit: PairWorkUnit;
        observationId: string;
        expectedFailureKind: 'behavior';
        expectedFailure: string;
      }
    | { kind: 'await_human'; manifestSha256: string }
    | {
        kind: 'resolve_exception';
        exceptionId: string;
        allowedRoutes: PairDecisionAction[];
      }
  );

export interface PairView {
  iteration: Iteration;
  story: Story;
  storyRevision: StoryRevision;
  approvedPlan: ApprovedTaskingPlan;
  run: PairRun;
  driverAttempts: PairDriverAttempt[];
  commandObservations: PairCommandObservation[];
  redReviews: PairRedReview[];
  currentException: PairAutomationException | null;
  manifest: PairExecutionManifest | null;
  decisions: PairCodingDecision[];
  nextAction: PairNextAction | null;
}

export interface StartPairInput {
  expectedIterationVersion: number;
  approvedTaskingPlanId: string;
  approvedTaskingPlanSha256: string;
  executorId: string;
}

export interface StartPairResult {
  view: PairView;
  leaseToken: string;
}

export interface PairActionInput {
  pairRunId: string;
  actionId: string;
  expectedPairVersion: number;
  leaseToken: string;
}

export interface RecordPairDriverAttemptInput extends PairActionInput {
  role: PairDriverRole;
  mode: PairDriverMode;
  summary: string;
  changedPaths: string[];
  beforeWorktreeSha256: string;
  afterWorktreeSha256: string;
  diffSha256: string;
  agentCallCount: number;
  inputTokens?: number | null;
  outputTokens?: number | null;
}

export interface RecordPairCommandObservationInput extends PairActionInput {
  stage: PairCommandStage;
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
  worktreeSha256: string;
  diffSha256: string;
}

export interface RecordPairRedReviewInput extends PairActionInput {
  observationId: string;
  classification: PairRedClassification;
  reason: string;
}

export interface RecordPairExceptionInput extends PairActionInput {
  kind: PairExceptionKind;
  summary: string;
  failureFingerprint?: string | null;
}

export interface ClaimPairLeaseInput {
  pairRunId: string;
  expectedPairVersion: number;
  executorId: string;
}

export interface ClaimPairLeaseResult {
  run: PairRun;
  leaseToken: string;
}

export interface HeartbeatPairLeaseInput {
  pairRunId: string;
  expectedPairVersion: number;
  leaseToken: string;
}

export interface DecidePairInput {
  expectedPairVersion: number;
  action: PairDecisionAction;
  reason: string;
  manifestSha256?: string | null;
  diffSha256?: string | null;
  commitSha?: string | null;
}

export interface PairActionResult {
  view: PairView;
  acceptedRecordId: string;
}

export interface WorkspacePair {
  findPair(iterationId: string): Promise<PairView | null>;
  startPair(
    iterationId: string,
    input: StartPairInput,
  ): Promise<StartPairResult>;
  claimPairLease(
    iterationId: string,
    input: ClaimPairLeaseInput,
  ): Promise<ClaimPairLeaseResult>;
  heartbeatPairLease(
    iterationId: string,
    input: HeartbeatPairLeaseInput,
  ): Promise<PairRun>;
  recordPairDriverAttempt(
    iterationId: string,
    input: RecordPairDriverAttemptInput,
  ): Promise<PairActionResult>;
  recordPairCommandObservation(
    iterationId: string,
    input: RecordPairCommandObservationInput,
  ): Promise<PairActionResult>;
  recordPairRedReview(
    iterationId: string,
    input: RecordPairRedReviewInput,
  ): Promise<PairActionResult>;
  recordPairException(
    iterationId: string,
    input: RecordPairExceptionInput,
  ): Promise<PairActionResult>;
  decidePair(
    iterationId: string,
    input: DecidePairInput,
    decidedByUserId: string,
  ): Promise<PairActionResult>;
}
