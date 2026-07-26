import {
  DomainError,
  PairAutomationException,
  PairCodingDecision,
  PairCommandObservation,
  PairDriverAttempt,
  PairExecutionManifest,
  PairRedReview,
  PairRun,
  Ref,
  materializePairExecutionPlan,
  type ApprovedTaskingPlan,
  type PairAutomationExceptionDescription,
  type PairBudgetUsage,
  type PairCheckpoint,
  type PairCodingDecisionDescription,
  type PairCommandObservationDescription,
  type PairCursor,
  type PairDecisionAction,
  type PairDriverAttemptDescription,
  type PairDriverMode,
  type PairDriverRole,
  type PairExceptionKind,
  type PairExecutionBudget,
  type JsonValue,
  type PairExecutionManifestDescription,
  type PairNextAction,
  type PairQualityGate,
  type PairRedClassification,
  type PairRedReviewDescription,
  type PairRunDescription,
  type PairStatus,
  type PairTermination,
  type PairWorkUnit,
} from '@evidence/server-domain';
import { Prisma } from '@prisma/client';
import { hashCanonicalJson } from '../workflow-content';

export type PairRunRow = Prisma.PairRunGetPayload<Record<string, never>>;
export type PairDriverAttemptRow = Prisma.PairDriverAttemptGetPayload<
  Record<string, never>
>;
export type PairCommandObservationRow = Prisma.PairCommandObservationGetPayload<
  Record<string, never>
>;
export type PairRedReviewRow = Prisma.PairRedReviewGetPayload<
  Record<string, never>
>;
export type PairAutomationExceptionRow =
  Prisma.PairAutomationExceptionGetPayload<Record<string, never>>;
export type PairExecutionManifestRow = Prisma.PairExecutionManifestGetPayload<
  Record<string, never>
>;
export type PairCodingDecisionRow = Prisma.PairCodingDecisionGetPayload<
  Record<string, never>
>;

export interface PairEvidenceRows {
  driverAttempts: PairDriverAttemptRow[];
  commandObservations: PairCommandObservationRow[];
  redReviews: PairRedReviewRow[];
  currentException: PairAutomationExceptionRow | null;
  manifest: PairExecutionManifestRow | null;
  decisions: PairCodingDecisionRow[];
}

export function assemblePairRun(row: PairRunRow): PairRun {
  return new PairRun(row.id, {
    reference: row.reference,
    workspace: new Ref(row.workspaceId),
    iteration: new Ref(row.iterationId),
    story: new Ref(row.storyId),
    storyRevision: new Ref(row.storyRevisionId),
    storyRevisionSha256: row.storyRevisionSha256,
    approvedTaskingPlan: new Ref(row.approvedTaskingPlanId),
    approvedTaskingPlanSha256: row.approvedTaskingPlanSha256,
    baseCommitSha: row.baseCommitSha,
    branchName: row.branchName,
    status: row.status as PairStatus,
    checkpoint: row.checkpoint as PairCheckpoint,
    version: row.version,
    cursor: pairCursor(row.cursor, row.id),
    completedTestIds: jsonStrings(row.completedTestIds, row.id, 'TEST ids'),
    completedStepKeys: jsonStrings(
      row.completedStepKeys,
      row.id,
      'process step keys',
    ),
    executionBudget: jsonObject(
      row.executionBudget,
      row.id,
      'execution budget',
    ) as unknown as PairExecutionBudget,
    budgetUsage: jsonObject(
      row.budgetUsage,
      row.id,
      'budget usage',
    ) as unknown as PairBudgetUsage,
    leaseOwnerId: row.leaseOwnerId,
    leaseExpiresAt: row.leaseExpiresAt?.toISOString() ?? null,
    currentDiffSha256: row.currentDiffSha256,
    finalManifestSha256: row.finalManifestSha256,
    approvedCommitSha: row.approvedCommitSha,
    startedAt: row.startedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  } satisfies PairRunDescription);
}

export function assemblePairDriverAttempt(
  row: PairDriverAttemptRow,
): PairDriverAttempt {
  return new PairDriverAttempt(row.id, {
    pairRun: new Ref(row.pairRunId),
    actionId: row.actionId,
    sequence: row.sequence,
    role: row.role as PairDriverRole,
    mode: row.mode as PairDriverMode,
    taskId: row.taskId,
    testId: row.testId,
    processId: row.processId,
    stepId: row.stepId,
    summary: row.summary,
    changedPaths: jsonStrings(row.changedPaths, row.id, 'changed paths'),
    beforeWorktreeSha256: row.beforeWorktreeSha256,
    afterWorktreeSha256: row.afterWorktreeSha256,
    diffSha256: row.diffSha256,
    agentCallCount: row.agentCallCount,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    completedAt: row.completedAt.toISOString(),
    recordSha256: row.recordSha256,
  } satisfies PairDriverAttemptDescription);
}

export function assemblePairCommandObservation(
  row: PairCommandObservationRow,
): PairCommandObservation {
  return new PairCommandObservation(row.id, {
    pairRun: new Ref(row.pairRunId),
    actionId: row.actionId,
    sequence: row.sequence,
    stage: row.stage as PairCommandObservationDescription['stage'],
    taskId: row.taskId,
    testId: row.testId,
    processId: row.processId,
    stepId: row.stepId,
    command: row.command,
    termination: row.termination as PairTermination,
    exitCode: row.exitCode,
    signal: row.signal,
    durationMs: row.durationMs,
    stdoutSha256: row.stdoutSha256,
    stdoutBytes: row.stdoutBytes,
    stdoutLines: row.stdoutLines,
    stderrSha256: row.stderrSha256,
    stderrBytes: row.stderrBytes,
    stderrLines: row.stderrLines,
    worktreeSha256: row.worktreeSha256,
    diffSha256: row.diffSha256,
    failureFingerprint: row.failureFingerprint,
    observedAt: row.observedAt.toISOString(),
    previousRecordSha256: row.previousRecordSha256,
    recordSha256: row.recordSha256,
  } satisfies PairCommandObservationDescription);
}

export function assemblePairRedReview(row: PairRedReviewRow): PairRedReview {
  return new PairRedReview(row.id, {
    pairRun: new Ref(row.pairRunId),
    actionId: row.actionId,
    observation: new Ref(row.observationId),
    classification: row.classification as PairRedClassification,
    accepted: row.accepted,
    reason: row.reason,
    reviewedAt: row.reviewedAt.toISOString(),
    recordSha256: row.recordSha256,
  } satisfies PairRedReviewDescription);
}

export function assemblePairException(
  row: PairAutomationExceptionRow,
): PairAutomationException {
  return new PairAutomationException(row.id, {
    pairRun: new Ref(row.pairRunId),
    actionId: row.actionId,
    kind: row.kind as PairExceptionKind,
    summary: row.summary,
    failureFingerprint: row.failureFingerprint,
    allowedRoutes: jsonStrings(
      row.allowedRoutes,
      row.id,
      'allowed routes',
    ) as PairDecisionAction[],
    raisedAt: row.raisedAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    recordSha256: row.recordSha256,
  } satisfies PairAutomationExceptionDescription);
}

export function assemblePairManifest(
  row: PairExecutionManifestRow,
): PairExecutionManifest {
  return new PairExecutionManifest(row.id, {
    pairRun: new Ref(row.pairRunId),
    approvedTaskingPlanSha256: row.approvedTaskingPlanSha256,
    storyRevisionSha256: row.storyRevisionSha256,
    baseCommitSha: row.baseCommitSha,
    completedTestIds: jsonStrings(
      row.completedTestIds,
      row.id,
      'completed TEST ids',
    ),
    completedStepKeys: jsonStrings(
      row.completedStepKeys,
      row.id,
      'completed process step keys',
    ),
    driverAttemptIds: jsonStrings(
      row.driverAttemptIds,
      row.id,
      'Driver attempt ids',
    ),
    commandObservationIds: jsonStrings(
      row.commandObservationIds,
      row.id,
      'command observation ids',
    ),
    redReviewIds: jsonStrings(row.redReviewIds, row.id, 'Red Review ids'),
    changedPaths: jsonStrings(row.changedPaths, row.id, 'changed paths'),
    finalDiffSha256: row.finalDiffSha256,
    evidenceChainSha256: row.evidenceChainSha256,
    generatedAt: row.generatedAt.toISOString(),
    contentSha256: row.contentSha256,
  } satisfies PairExecutionManifestDescription);
}

export function assemblePairDecision(
  row: PairCodingDecisionRow,
): PairCodingDecision {
  return new PairCodingDecision(row.id, {
    pairRun: new Ref(row.pairRunId),
    action: row.action as PairDecisionAction,
    reason: row.reason,
    manifestSha256: row.manifestSha256,
    diffSha256: row.diffSha256,
    commitSha: row.commitSha,
    decidedBy: new Ref(row.decidedByUserId),
    decidedAt: row.decidedAt.toISOString(),
    contentSha256: row.contentSha256,
  } satisfies PairCodingDecisionDescription);
}

export function pairNextAction(
  run: PairRun,
  approvedPlan: ApprovedTaskingPlan,
  rows: PairEvidenceRows,
): PairNextAction | null {
  const description = run.description();
  if (description.status === 'approved' || description.status === 'cancelled') {
    return null;
  }
  if (description.status === 'exception') {
    if (!rows.currentException) {
      throw DomainError.internal(
        `Pair Run ${run.identity()} lost its active exception`,
      );
    }
    return action(description.version, {
      kind: 'resolve_exception',
      exceptionId: rows.currentException.id,
      allowedRoutes: jsonStrings(
        rows.currentException.allowedRoutes,
        rows.currentException.id,
        'allowed routes',
      ) as PairDecisionAction[],
    });
  }
  if (description.status === 'approval_required') {
    if (!rows.manifest) {
      throw DomainError.internal(
        `Pair Run ${run.identity()} lost its execution Manifest`,
      );
    }
    return action(description.version, {
      kind: 'await_human',
      manifestSha256: rows.manifest.contentSha256,
    });
  }

  const execution = materializePairExecutionPlan(
    approvedPlan.description().plan,
  );
  const unit = execution.workUnits[description.cursor.unitIndex] ?? null;
  const frozenTestPaths = rows.driverAttempts
    .filter(({ role }) => role === 'test')
    .flatMap(({ changedPaths }) =>
      jsonStrings(changedPaths, run.identity(), 'frozen test paths'),
    );

  switch (description.checkpoint) {
    case 'plan_confirmed':
      return unit
        ? driverAction(description.version, 'test', 'write_test', unit, null, [
            ...new Set(frozenTestPaths),
          ])
        : qualityGateAction(
            description.version,
            execution.qualityGates,
            0,
            description.executionBudget.commandTimeoutMs,
          );
    case 'test_written': {
      if (!unit) return invalidCursor(run);
      const observation = [...rows.commandObservations]
        .reverse()
        .find(
          (entry) => entry.stage === 'red' && entry.testId === unit.test.id,
        );
      if (!observation) {
        return commandAction(
          description.version,
          'red',
          unit,
          null,
          description.executionBudget.commandTimeoutMs,
        );
      }
      const review = rows.redReviews.find(
        ({ observationId }) => observationId === observation.id,
      );
      if (!review) {
        return action(description.version, {
          kind: 'review_red',
          workUnit: unit,
          observationId: observation.id,
          expectedFailureKind: unit.step.red.expectedFailureKind,
          expectedFailure: unit.step.red.expectedFailure,
        });
      }
      return review.accepted
        ? driverAction(
            description.version,
            'production',
            'implement',
            unit,
            null,
            frozenTestPaths,
          )
        : invalidCheckpoint(run);
    }
    case 'red_observed':
      return unit
        ? driverAction(
            description.version,
            'production',
            'implement',
            unit,
            null,
            frozenTestPaths,
          )
        : invalidCursor(run);
    case 'implementation_written':
      return unit
        ? commandAction(
            description.version,
            'green',
            unit,
            null,
            description.executionBudget.commandTimeoutMs,
          )
        : invalidCursor(run);
    case 'green_observed': {
      const stepKey = description.cursor.pendingRefactorStepKey;
      const stepUnit = execution.workUnits.find(
        (candidate) => candidate.stepKey === stepKey,
      );
      return stepKey && stepUnit
        ? driverAction(
            description.version,
            'refactor',
            'refactor',
            stepUnit,
            stepKey,
            frozenTestPaths,
          )
        : invalidCheckpoint(run);
    }
    case 'refactored': {
      const stepKey = description.cursor.pendingRefactorStepKey;
      if (stepKey) {
        const stepUnits = execution.workUnits.filter(
          (candidate) => candidate.stepKey === stepKey,
        );
        const verification =
          stepUnits[description.cursor.refactorVerificationIndex];
        return verification
          ? commandAction(
              description.version,
              'refactor',
              verification,
              null,
              description.executionBudget.commandTimeoutMs,
            )
          : invalidCursor(run);
      }
      return qualityGateAction(
        description.version,
        execution.qualityGates,
        description.cursor.qualityGateIndex,
        description.executionBudget.commandTimeoutMs,
      );
    }
    case 'quality_gate_failed':
    case 'exception':
      return invalidCheckpoint(run);
    case 'quality_gates_passed':
    case 'approved':
      return rows.manifest
        ? action(description.version, {
            kind: 'await_human',
            manifestSha256: rows.manifest.contentSha256,
          })
        : invalidCheckpoint(run);
  }
}

function driverAction(
  version: number,
  role: PairDriverRole,
  mode: PairDriverMode,
  workUnit: PairWorkUnit,
  stepKey: string | null,
  frozenTestPaths: string[],
): PairNextAction {
  return action(version, {
    kind: 'run_driver',
    role,
    mode,
    workUnit,
    stepKey,
    allowedTestRoots: role === 'test' ? workUnit.testRoots : [],
    allowedProductionRoots: role === 'test' ? [] : workUnit.productionRoots,
    frozenTestPaths: [...new Set(frozenTestPaths)].sort(),
    diagnosticObservationId: null,
  });
}

function commandAction(
  version: number,
  stage: PairCommandObservationDescription['stage'],
  workUnit: PairWorkUnit | null,
  gate: PairQualityGate | null,
  timeoutMs: number,
): PairNextAction {
  const command = workUnit?.focusedCommand.command ?? gate?.command;
  if (!command) {
    throw DomainError.internal('Pair command action lost its locked command');
  }
  return action(version, {
    kind: 'execute_command',
    stage,
    workUnit,
    gate,
    command,
    timeoutMs,
  });
}

function qualityGateAction(
  version: number,
  gates: PairQualityGate[],
  index: number,
  timeoutMs: number,
): PairNextAction {
  const gate = gates[index];
  if (!gate) {
    throw DomainError.internal('Pair quality gate cursor is invalid');
  }
  return commandAction(version, 'quality_gate', null, gate, timeoutMs);
}

function action<
  T extends Omit<PairNextAction, 'actionId' | 'expectedPairVersion'>,
>(version: number, value: T): PairNextAction {
  const authority = {
    expectedPairVersion: version,
    ...value,
  };
  const digest = hashCanonicalJson(authority as unknown as JsonValue);
  return {
    actionId: `ACT-${digest.slice('sha256:'.length, 'sha256:'.length + 24)}`,
    ...authority,
  } as unknown as PairNextAction;
}

function invalidCursor(run: PairRun): never {
  throw DomainError.internal(
    `Pair Run ${run.identity()} has an invalid execution cursor`,
  );
}

function invalidCheckpoint(run: PairRun): never {
  throw DomainError.internal(
    `Pair Run ${run.identity()} has an invalid checkpoint`,
  );
}

function pairCursor(value: Prisma.JsonValue, id: string): PairCursor {
  const object = jsonObject(value, id, 'cursor');
  return {
    unitIndex: jsonInteger(object.unitIndex, id, 'unitIndex'),
    pendingRefactorStepKey:
      object.pendingRefactorStepKey === null
        ? null
        : jsonString(
            object.pendingRefactorStepKey,
            id,
            'pendingRefactorStepKey',
          ),
    refactorVerificationIndex: jsonInteger(
      object.refactorVerificationIndex,
      id,
      'refactorVerificationIndex',
    ),
    qualityGateIndex: jsonInteger(
      object.qualityGateIndex,
      id,
      'qualityGateIndex',
    ),
  };
}

function jsonObject(
  value: Prisma.JsonValue,
  id: string,
  field: string,
): Record<string, Prisma.JsonValue> {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    throw DomainError.internal(`Pair record ${id} has invalid ${field}`);
  }
  return value as unknown as Record<string, Prisma.JsonValue>;
}

function jsonStrings(
  value: Prisma.JsonValue,
  id: string,
  field: string,
): string[] {
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== 'string')
  ) {
    throw DomainError.internal(`Pair record ${id} has invalid ${field}`);
  }
  return value as string[];
}

function jsonString(
  value: Prisma.JsonValue,
  id: string,
  field: string,
): string {
  if (typeof value !== 'string') {
    throw DomainError.internal(`Pair record ${id} has invalid ${field}`);
  }
  return value;
}

function jsonInteger(
  value: Prisma.JsonValue,
  id: string,
  field: string,
): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw DomainError.internal(`Pair record ${id} has invalid ${field}`);
  }
  return value;
}
