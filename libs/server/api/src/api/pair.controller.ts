import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import {
  DomainError,
  type PairCommandStage,
  type PairDecisionAction,
  type PairDriverMode,
  type PairDriverRole,
  type PairExceptionKind,
  type PairRedClassification,
  type PairTermination,
} from '@evidence/server-domain';
import {
  claimPairLeaseResultModel,
  pairActionResultModel,
  pairRunResourceModel,
  pairViewModel,
  startPairResultModel,
} from './model/pair-model';
import { ResourceResolver } from './resource-resolver.service';

@Controller()
export class PairController {
  constructor(private readonly resolver: ResourceResolver) {}

  @Get(':iterationId/pair')
  async getPair(
    @Param('workspaceId') workspaceId: string,
    @Param('iterationId') iterationId: string,
  ) {
    const workspace = await this.resolver.requireWorkspace(workspaceId);
    const view = await workspace.pair().findPair(iterationId);
    if (!view) throw DomainError.notFound(`Pair ${iterationId} not found`);
    return pairViewModel(workspaceId, view);
  }

  @Post(':iterationId/pair/runs')
  @HttpCode(HttpStatus.CREATED)
  async startPair(
    @Param('workspaceId') workspaceId: string,
    @Param('iterationId') iterationId: string,
    @Body() value: unknown,
  ) {
    const body = record(value);
    const workspace = await this.resolver.requireWorkspace(workspaceId);
    return startPairResultModel(
      workspaceId,
      await workspace.pair().startPair(iterationId, {
        expectedIterationVersion: positive(
          body.expectedIterationVersion,
          'expectedIterationVersion',
        ),
        approvedTaskingPlanId: text(
          body.approvedTaskingPlanId,
          'approvedTaskingPlanId',
        ),
        approvedTaskingPlanSha256: text(
          body.approvedTaskingPlanSha256,
          'approvedTaskingPlanSha256',
        ),
        executorId: text(body.executorId, 'executorId'),
      }),
    );
  }

  @Post(':iterationId/pair/lease/claim')
  @HttpCode(HttpStatus.OK)
  async claimLease(
    @Param('workspaceId') workspaceId: string,
    @Param('iterationId') iterationId: string,
    @Body() value: unknown,
  ) {
    const body = record(value);
    const workspace = await this.resolver.requireWorkspace(workspaceId);
    return claimPairLeaseResultModel(
      await workspace.pair().claimPairLease(iterationId, {
        pairRunId: text(body.pairRunId, 'pairRunId'),
        expectedPairVersion: positive(
          body.expectedPairVersion,
          'expectedPairVersion',
        ),
        executorId: text(body.executorId, 'executorId'),
      }),
    );
  }

  @Post(':iterationId/pair/lease/heartbeat')
  @HttpCode(HttpStatus.OK)
  async heartbeatLease(
    @Param('workspaceId') workspaceId: string,
    @Param('iterationId') iterationId: string,
    @Headers('x-evidence-pair-lease') leaseToken: string | undefined,
    @Body() value: unknown,
  ) {
    const body = record(value);
    const workspace = await this.resolver.requireWorkspace(workspaceId);
    return pairRunResourceModel(
      await workspace.pair().heartbeatPairLease(iterationId, {
        pairRunId: text(body.pairRunId, 'pairRunId'),
        expectedPairVersion: positive(
          body.expectedPairVersion,
          'expectedPairVersion',
        ),
        leaseToken: text(leaseToken, 'X-Evidence-Pair-Lease'),
      }),
    );
  }

  @Post(':iterationId/pair/driver-attempts')
  @HttpCode(HttpStatus.CREATED)
  async recordDriverAttempt(
    @Param('workspaceId') workspaceId: string,
    @Param('iterationId') iterationId: string,
    @Headers('x-evidence-pair-lease') leaseToken: string | undefined,
    @Body() value: unknown,
  ) {
    const body = record(value);
    const workspace = await this.resolver.requireWorkspace(workspaceId);
    return pairActionResultModel(
      workspaceId,
      await workspace.pair().recordPairDriverAttempt(iterationId, {
        ...actionAuthority(body, leaseToken),
        role: driverRole(body.role),
        mode: driverMode(body.mode),
        summary: text(body.summary, 'summary'),
        changedPaths: strings(body.changedPaths, 'changedPaths'),
        beforeWorktreeSha256: text(
          body.beforeWorktreeSha256,
          'beforeWorktreeSha256',
        ),
        afterWorktreeSha256: text(
          body.afterWorktreeSha256,
          'afterWorktreeSha256',
        ),
        diffSha256: text(body.diffSha256, 'diffSha256'),
        agentCallCount: positive(body.agentCallCount, 'agentCallCount'),
        inputTokens: optionalNonnegative(body.inputTokens, 'inputTokens'),
        outputTokens: optionalNonnegative(body.outputTokens, 'outputTokens'),
      }),
    );
  }

  @Post(':iterationId/pair/command-observations')
  @HttpCode(HttpStatus.CREATED)
  async recordCommandObservation(
    @Param('workspaceId') workspaceId: string,
    @Param('iterationId') iterationId: string,
    @Headers('x-evidence-pair-lease') leaseToken: string | undefined,
    @Body() value: unknown,
  ) {
    const body = record(value);
    const workspace = await this.resolver.requireWorkspace(workspaceId);
    return pairActionResultModel(
      workspaceId,
      await workspace.pair().recordPairCommandObservation(iterationId, {
        ...actionAuthority(body, leaseToken),
        stage: commandStage(body.stage),
        command: text(body.command, 'command'),
        termination: termination(body.termination),
        exitCode: nullableInteger(body.exitCode, 'exitCode'),
        signal: optionalText(body.signal, 'signal'),
        durationMs: nonnegative(body.durationMs, 'durationMs'),
        stdoutSha256: text(body.stdoutSha256, 'stdoutSha256'),
        stdoutBytes: nonnegative(body.stdoutBytes, 'stdoutBytes'),
        stdoutLines: nonnegative(body.stdoutLines, 'stdoutLines'),
        stderrSha256: text(body.stderrSha256, 'stderrSha256'),
        stderrBytes: nonnegative(body.stderrBytes, 'stderrBytes'),
        stderrLines: nonnegative(body.stderrLines, 'stderrLines'),
        worktreeSha256: text(body.worktreeSha256, 'worktreeSha256'),
        diffSha256: text(body.diffSha256, 'diffSha256'),
      }),
    );
  }

  @Post(':iterationId/pair/red-reviews')
  @HttpCode(HttpStatus.CREATED)
  async recordRedReview(
    @Param('workspaceId') workspaceId: string,
    @Param('iterationId') iterationId: string,
    @Headers('x-evidence-pair-lease') leaseToken: string | undefined,
    @Body() value: unknown,
  ) {
    const body = record(value);
    const workspace = await this.resolver.requireWorkspace(workspaceId);
    return pairActionResultModel(
      workspaceId,
      await workspace.pair().recordPairRedReview(iterationId, {
        ...actionAuthority(body, leaseToken),
        observationId: text(body.observationId, 'observationId'),
        classification: redClassification(body.classification),
        reason: text(body.reason, 'reason'),
      }),
    );
  }

  @Post(':iterationId/pair/exceptions')
  @HttpCode(HttpStatus.CREATED)
  async recordException(
    @Param('workspaceId') workspaceId: string,
    @Param('iterationId') iterationId: string,
    @Headers('x-evidence-pair-lease') leaseToken: string | undefined,
    @Body() value: unknown,
  ) {
    const body = record(value);
    const workspace = await this.resolver.requireWorkspace(workspaceId);
    return pairActionResultModel(
      workspaceId,
      await workspace.pair().recordPairException(iterationId, {
        ...actionAuthority(body, leaseToken),
        kind: exceptionKind(body.kind),
        summary: text(body.summary, 'summary'),
        failureFingerprint: optionalText(
          body.failureFingerprint,
          'failureFingerprint',
        ),
      }),
    );
  }

  @Post(':iterationId/pair/decisions')
  @HttpCode(HttpStatus.OK)
  async decide(
    @Param('workspaceId') workspaceId: string,
    @Param('iterationId') iterationId: string,
    @Body() value: unknown,
  ) {
    const body = record(value);
    const workspace = await this.resolver.requireWorkspace(workspaceId);
    return pairActionResultModel(
      workspaceId,
      await workspace.pair().decidePair(
        iterationId,
        {
          expectedPairVersion: positive(
            body.expectedPairVersion,
            'expectedPairVersion',
          ),
          action: decisionAction(body.action),
          reason: text(body.reason, 'reason'),
          manifestSha256: optionalText(body.manifestSha256, 'manifestSha256'),
          diffSha256: optionalText(body.diffSha256, 'diffSha256'),
          commitSha: optionalText(body.commitSha, 'commitSha'),
        },
        this.resolver.currentUserId(),
      ),
    );
  }
}

function actionAuthority(
  body: Record<string, unknown>,
  leaseToken: string | undefined,
) {
  return {
    pairRunId: text(body.pairRunId, 'pairRunId'),
    actionId: text(body.actionId, 'actionId'),
    expectedPairVersion: positive(
      body.expectedPairVersion,
      'expectedPairVersion',
    ),
    leaseToken: text(leaseToken, 'X-Evidence-Pair-Lease'),
  };
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw DomainError.validation('body must be an object');
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw DomainError.validation(`${name} is required`);
  }
  return value;
}

function optionalText(value: unknown, name: string): string | null {
  return value === undefined || value === null || value === ''
    ? null
    : text(value, name);
}

function strings(value: unknown, name: string): string[] {
  if (!Array.isArray(value)) {
    throw DomainError.validation(`${name} must be an array`);
  }
  return value.map((entry, index) => text(entry, `${name}[${String(index)}]`));
}

function positive(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw DomainError.validation(`${name} must be a positive integer`);
  }
  return Number(value);
}

function nonnegative(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw DomainError.validation(`${name} must be a non-negative integer`);
  }
  return Number(value);
}

function optionalNonnegative(value: unknown, name: string): number | null {
  return value === undefined || value === null
    ? null
    : nonnegative(value, name);
}

function nullableInteger(value: unknown, name: string): number | null {
  if (value === null) return null;
  if (!Number.isSafeInteger(value)) {
    throw DomainError.validation(`${name} must be an integer or null`);
  }
  return Number(value);
}

function oneOf<T extends string>(
  value: unknown,
  name: string,
  values: readonly T[],
): T {
  if (typeof value === 'string' && values.includes(value as T)) {
    return value as T;
  }
  throw DomainError.validation(`unsupported ${name}: ${String(value)}`);
}

function driverRole(value: unknown): PairDriverRole {
  return oneOf(value, 'Pair Driver role', ['test', 'production', 'refactor']);
}

function driverMode(value: unknown): PairDriverMode {
  return oneOf(value, 'Pair Driver mode', [
    'write_test',
    'repair_test',
    'implement',
    'repair_implementation',
    'refactor',
    'repair_refactor',
    'repair_quality_gate',
  ]);
}

function commandStage(value: unknown): PairCommandStage {
  return oneOf(value, 'Pair command stage', [
    'red',
    'green',
    'refactor',
    'quality_gate',
  ]);
}

function termination(value: unknown): PairTermination {
  return oneOf(value, 'Pair command termination', [
    'exited',
    'timed_out',
    'signaled',
    'spawn_error',
  ]);
}

function redClassification(value: unknown): PairRedClassification {
  return oneOf(value, 'Red classification', [
    'behavior',
    'compile',
    'dependency',
    'configuration',
    'network',
    'fixture',
    'other',
  ]);
}

function exceptionKind(value: unknown): PairExceptionKind {
  return oneOf(value, 'Pair exception', [
    'unexpected_green',
    'pseudo_red',
    'green_failed',
    'refactor_failed',
    'quality_gate_failed',
    'path_violation',
    'git_head_changed',
    'project_ownership_changed',
    'lease_expired',
    'interrupted',
    'budget_exhausted',
    'no_progress',
    'evidence_mismatch',
    'runtime_failure',
  ]);
}

function decisionAction(value: unknown): PairDecisionAction {
  return oneOf(value, 'Pair decision', [
    'approve',
    'back_test',
    'back_implementation',
    'back_tasking',
    'retry_quality',
    'cancel',
  ]);
}
