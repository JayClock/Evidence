import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import {
  DomainError,
  type ShowcaseDecisionAction,
  type ShowcaseEvaluationOutcome,
  type ShowcaseFeedbackTarget,
  type ShowcaseQuadrant,
  type ShowcaseReviewRecommendation,
  type ShowcaseRiskActivity,
  type ShowcaseRiskDisposition,
} from '@evidence/server-domain';
import {
  showcaseActionResultModel,
  showcaseViewModel,
} from './model/showcase-model';
import { ResourceResolver } from './resource-resolver.service';

@Controller()
export class ShowcaseController {
  constructor(private readonly resolver: ResourceResolver) {}

  @Get(':iterationId/showcase')
  async getShowcase(
    @Param('workspaceId') workspaceId: string,
    @Param('iterationId') iterationId: string,
  ) {
    const workspace = await this.resolver.requireWorkspace(workspaceId);
    const view = await workspace.showcase().findShowcase(iterationId);
    if (!view) {
      throw DomainError.notFound(`Showcase ${iterationId} not found`);
    }
    return showcaseViewModel(workspaceId, view);
  }

  @Post(':iterationId/showcase/q2-observations')
  @HttpCode(HttpStatus.CREATED)
  async recordQ2Observation(
    @Param('workspaceId') workspaceId: string,
    @Param('iterationId') iterationId: string,
    @Body() value: unknown,
  ) {
    const body = record(value);
    const workspace = await this.resolver.requireWorkspace(workspaceId);
    return showcaseActionResultModel(
      workspaceId,
      await workspace.showcase().recordQ2Observation(iterationId, {
        showcaseRunId: text(body.showcaseRunId, 'showcaseRunId'),
        actionId: text(body.actionId, 'actionId'),
        expectedShowcaseVersion: positive(
          body.expectedShowcaseVersion,
          'expectedShowcaseVersion',
        ),
        command: text(body.command, 'command'),
        termination: oneOf(body.termination, 'termination', [
          'exited',
          'timed_out',
          'signaled',
          'spawn_error',
        ]),
        exitCode: nullableInteger(body.exitCode, 'exitCode'),
        signal: optionalText(body.signal, 'signal'),
        durationMs: nonnegative(body.durationMs, 'durationMs'),
        stdoutSha256: text(body.stdoutSha256, 'stdoutSha256'),
        stdoutBytes: nonnegative(body.stdoutBytes, 'stdoutBytes'),
        stdoutLines: nonnegative(body.stdoutLines, 'stdoutLines'),
        stderrSha256: text(body.stderrSha256, 'stderrSha256'),
        stderrBytes: nonnegative(body.stderrBytes, 'stderrBytes'),
        stderrLines: nonnegative(body.stderrLines, 'stderrLines'),
        approvedCommitSha: text(body.approvedCommitSha, 'approvedCommitSha'),
        worktreeSha256: text(body.worktreeSha256, 'worktreeSha256'),
      }),
    );
  }

  @Post(':iterationId/showcase/product-observations')
  @HttpCode(HttpStatus.CREATED)
  async recordProductObservation(
    @Param('workspaceId') workspaceId: string,
    @Param('iterationId') iterationId: string,
    @Body() value: unknown,
  ) {
    const body = record(value);
    const workspace = await this.resolver.requireWorkspace(workspaceId);
    return showcaseActionResultModel(
      workspaceId,
      await workspace.showcase().recordProductObservation(
        iterationId,
        {
          expectedShowcaseVersion: positive(
            body.expectedShowcaseVersion,
            'expectedShowcaseVersion',
          ),
          scenarioId: text(body.scenarioId, 'scenarioId'),
          observedOutcomes: strings(body.observedOutcomes, 'observedOutcomes'),
          observation: text(body.observation, 'observation'),
          valueFeedback: text(body.valueFeedback, 'valueFeedback'),
          evidenceRefs: strings(body.evidenceRefs, 'evidenceRefs'),
        },
        this.resolver.currentUserId(),
      ),
    );
  }

  @Post(':iterationId/showcase/risk-decisions')
  @HttpCode(HttpStatus.CREATED)
  async recordRiskDecision(
    @Param('workspaceId') workspaceId: string,
    @Param('iterationId') iterationId: string,
    @Body() value: unknown,
  ) {
    const body = record(value);
    const workspace = await this.resolver.requireWorkspace(workspaceId);
    return showcaseActionResultModel(
      workspaceId,
      await workspace.showcase().recordRiskDecision(
        iterationId,
        {
          expectedShowcaseVersion: positive(
            body.expectedShowcaseVersion,
            'expectedShowcaseVersion',
          ),
          quadrant: quadrant(body.quadrant),
          disposition: riskDisposition(body.disposition),
          activities: strings(body.activities, 'activities').map(riskActivity),
          reason: text(body.reason, 'reason'),
        },
        this.resolver.currentUserId(),
      ),
    );
  }

  @Post(':iterationId/showcase/evaluations')
  @HttpCode(HttpStatus.CREATED)
  async recordEvaluation(
    @Param('workspaceId') workspaceId: string,
    @Param('iterationId') iterationId: string,
    @Body() value: unknown,
  ) {
    const body = record(value);
    const workspace = await this.resolver.requireWorkspace(workspaceId);
    return showcaseActionResultModel(
      workspaceId,
      await workspace.showcase().recordEvaluation(
        iterationId,
        {
          expectedShowcaseVersion: positive(
            body.expectedShowcaseVersion,
            'expectedShowcaseVersion',
          ),
          quadrant: quadrant(body.quadrant),
          activity: riskActivity(text(body.activity, 'activity')),
          outcome: evaluationOutcome(body.outcome),
          finding: text(body.finding, 'finding'),
          evidenceRefs: strings(body.evidenceRefs, 'evidenceRefs'),
        },
        this.resolver.currentUserId(),
      ),
    );
  }

  @Post(':iterationId/showcase/reviews')
  @HttpCode(HttpStatus.CREATED)
  async recordReview(
    @Param('workspaceId') workspaceId: string,
    @Param('iterationId') iterationId: string,
    @Body() value: unknown,
  ) {
    const body = record(value);
    const workspace = await this.resolver.requireWorkspace(workspaceId);
    return showcaseActionResultModel(
      workspaceId,
      await workspace.showcase().recordReview(iterationId, {
        expectedShowcaseVersion: positive(
          body.expectedShowcaseVersion,
          'expectedShowcaseVersion',
        ),
        evidenceBundleSha256: text(
          body.evidenceBundleSha256,
          'evidenceBundleSha256',
        ),
        observedFacts: strings(body.observedFacts, 'observedFacts'),
        productDomainFeedback: strings(
          body.productDomainFeedback,
          'productDomainFeedback',
        ),
        technicalQualityFeedback: strings(
          body.technicalQualityFeedback,
          'technicalQualityFeedback',
        ),
        unresolvedAssumptions: strings(
          body.unresolvedAssumptions,
          'unresolvedAssumptions',
        ),
        recommendation: recommendation(body.recommendation),
      }),
    );
  }

  @Post(':iterationId/showcase/decisions')
  @HttpCode(HttpStatus.OK)
  async decide(
    @Param('workspaceId') workspaceId: string,
    @Param('iterationId') iterationId: string,
    @Body() value: unknown,
  ) {
    const body = record(value);
    const workspace = await this.resolver.requireWorkspace(workspaceId);
    return showcaseActionResultModel(
      workspaceId,
      await workspace.showcase().decideShowcase(
        iterationId,
        {
          expectedShowcaseVersion: positive(
            body.expectedShowcaseVersion,
            'expectedShowcaseVersion',
          ),
          action: decisionAction(body.action),
          reason: text(body.reason, 'reason'),
          evidenceBundleSha256: optionalText(
            body.evidenceBundleSha256,
            'evidenceBundleSha256',
          ),
          reviewSha256: optionalText(body.reviewSha256, 'reviewSha256'),
          feedbackTarget: optionalFeedbackTarget(body.feedbackTarget),
        },
        this.resolver.currentUserId(),
      ),
    );
  }
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

function quadrant(value: unknown): ShowcaseQuadrant {
  return oneOf(value, 'Showcase quadrant', ['Q3', 'Q4']);
}

function riskDisposition(value: unknown): ShowcaseRiskDisposition {
  return oneOf(value, 'Showcase risk disposition', [
    'required',
    'not_required',
  ]);
}

function riskActivity(value: string): ShowcaseRiskActivity {
  return oneOf(value, 'Showcase risk activity', [
    'exploratory',
    'usability',
    'accessibility',
    'compatibility',
    'performance',
    'security',
    'reliability',
    'operability',
    'other',
  ]);
}

function evaluationOutcome(value: unknown): ShowcaseEvaluationOutcome {
  return oneOf(value, 'Showcase evaluation outcome', ['passed', 'concern']);
}

function recommendation(value: unknown): ShowcaseReviewRecommendation {
  return oneOf(value, 'Showcase Review recommendation', ['accept', 'revise']);
}

function decisionAction(value: unknown): ShowcaseDecisionAction {
  return oneOf(value, 'Showcase decision', ['accept', 'revise', 'reject']);
}

function optionalFeedbackTarget(value: unknown): ShowcaseFeedbackTarget | null {
  if (value === undefined || value === null || value === '') return null;
  return oneOf<ShowcaseFeedbackTarget>(value, 'Showcase feedback target', [
    'problem',
    'story',
    'business_knowledge',
    'scenario',
    'model',
    'modeling_method',
    'architecture',
    'test_strategy',
    'test_process',
    'value_validation',
    'showcase_setup',
  ]);
}
