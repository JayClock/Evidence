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
  type RespondDecisionAction,
  type RespondKnowledgeKind,
  type RespondPromotion,
  type RespondPromotionDecision,
} from '@evidence/server-domain';
import {
  respondActionResultModel,
  respondViewModel,
} from './model/respond-model';
import { ResourceResolver } from './resource-resolver.service';

@Controller()
export class RespondController {
  constructor(private readonly resolver: ResourceResolver) {}

  @Get(':iterationId/respond')
  async getRespond(
    @Param('workspaceId') workspaceId: string,
    @Param('iterationId') iterationId: string,
  ) {
    const workspace = await this.resolver.requireWorkspace(workspaceId);
    const view = await workspace.respond().findRespond(iterationId);
    if (!view) throw DomainError.notFound(`Respond ${iterationId} not found`);
    return respondViewModel(workspaceId, view);
  }

  @Post(':iterationId/respond/candidates')
  @HttpCode(HttpStatus.CREATED)
  async proposeCandidate(
    @Param('workspaceId') workspaceId: string,
    @Param('iterationId') iterationId: string,
    @Body() value: unknown,
  ) {
    const body = record(value, 'body');
    const probe = record(body.nextProbe, 'nextProbe');
    const workspace = await this.resolver.requireWorkspace(workspaceId);
    return respondActionResultModel(
      workspaceId,
      await workspace.respond().proposeCandidate(iterationId, {
        actionId: text(body.actionId, 'actionId'),
        expectedIterationVersion: positive(
          body.expectedIterationVersion,
          'expectedIterationVersion',
        ),
        authoritySha256: text(body.authoritySha256, 'authoritySha256'),
        promotions: records(body.promotions, 'promotions').map(promotion),
        noPromotionReason: optionalText(
          body.noPromotionReason,
          'noPromotionReason',
        ),
        observedOutcomes: strings(body.observedOutcomes, 'observedOutcomes'),
        residualRisks: strings(body.residualRisks, 'residualRisks'),
        nextProbe: {
          question: text(probe.question, 'nextProbe.question'),
          whyNow: text(probe.whyNow, 'nextProbe.whyNow'),
          evidenceRefs: strings(probe.evidenceRefs, 'nextProbe.evidenceRefs'),
          firstAction: text(probe.firstAction, 'nextProbe.firstAction'),
        },
      }),
    );
  }

  @Post(':iterationId/respond/decisions')
  @HttpCode(HttpStatus.OK)
  async decide(
    @Param('workspaceId') workspaceId: string,
    @Param('iterationId') iterationId: string,
    @Body() value: unknown,
  ) {
    const body = record(value, 'body');
    const workspace = await this.resolver.requireWorkspace(workspaceId);
    return respondActionResultModel(
      workspaceId,
      await workspace.respond().decideRespond(
        iterationId,
        {
          expectedIterationVersion: positive(
            body.expectedIterationVersion,
            'expectedIterationVersion',
          ),
          candidateId: text(body.candidateId, 'candidateId'),
          candidateSha256: text(body.candidateSha256, 'candidateSha256'),
          authoritySha256: text(body.authoritySha256, 'authoritySha256'),
          action: oneOf<RespondDecisionAction>(body.action, 'action', [
            'approve',
            'revise',
          ]),
          reason: text(body.reason, 'reason'),
        },
        this.resolver.currentUserId(),
      ),
    );
  }
}

function promotion(
  value: Record<string, unknown>,
  index: number,
): RespondPromotion {
  return {
    sourceRef: text(value.sourceRef, `promotions[${String(index)}].sourceRef`),
    kind: oneOf<RespondKnowledgeKind>(value.kind, 'kind', [
      'product',
      'model',
      'architecture',
      'contract',
      'test_process',
      'skill',
      'prompt',
      'other',
    ]),
    decision: oneOf<RespondPromotionDecision>(value.decision, 'decision', [
      'promoted',
      'deferred',
      'rejected',
    ]),
    reason: text(value.reason, `promotions[${String(index)}].reason`),
    validationEvidenceRefs: strings(
      value.validationEvidenceRefs,
      `promotions[${String(index)}].validationEvidenceRefs`,
    ),
    canonicalTarget: optionalText(
      value.canonicalTarget,
      `promotions[${String(index)}].canonicalTarget`,
    ),
  };
}

function record(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw DomainError.validation(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}

function records(value: unknown, name: string): Record<string, unknown>[] {
  if (!Array.isArray(value))
    throw DomainError.validation(`${name} must be an array`);
  return value.map((entry, index) =>
    record(entry, `${name}[${String(index)}]`),
  );
}

function strings(value: unknown, name: string): string[] {
  if (!Array.isArray(value))
    throw DomainError.validation(`${name} must be an array`);
  return value.map((entry, index) => text(entry, `${name}[${String(index)}]`));
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

function positive(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw DomainError.validation(`${name} must be a positive integer`);
  }
  return Number(value);
}

function oneOf<T extends string>(
  value: unknown,
  name: string,
  allowed: readonly T[],
): T {
  const normalized = text(value, name) as T;
  if (!allowed.includes(normalized))
    throw DomainError.validation(`${name} is unsupported`);
  return normalized;
}
