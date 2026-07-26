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
  parseClarificationTarget,
  parseUnderstandingDecisionAction,
} from '@evidence/server-domain';
import {
  clarificationAnswerResultModel,
  clarificationModel,
  scenarioProposalModel,
  understandingDecisionResultModel,
  understandingModel,
} from './model/understanding-model';
import { ResourceResolver } from './resource-resolver.service';

@Controller()
export class UnderstandingController {
  constructor(private readonly resolver: ResourceResolver) {}

  @Get(':iterationId/understanding')
  async getUnderstanding(
    @Param('workspaceId') workspaceId: string,
    @Param('iterationId') iterationId: string,
  ) {
    const workspace = await this.resolver.requireWorkspace(workspaceId);
    const view = await workspace.understanding().findUnderstanding(iterationId);
    if (!view)
      throw DomainError.notFound(`Understanding ${iterationId} not found`);
    return understandingModel(workspaceId, view);
  }

  @Post(':iterationId/understanding/clarifications')
  @HttpCode(HttpStatus.CREATED)
  async askClarification(
    @Param('workspaceId') workspaceId: string,
    @Param('iterationId') iterationId: string,
    @Body() value: unknown,
  ) {
    const body = record(value);
    const workspace = await this.resolver.requireWorkspace(workspaceId);
    return clarificationModel(
      await workspace.understanding().askClarification(iterationId, {
        expectedIterationVersion: positive(
          body.expectedIterationVersion,
          'expectedIterationVersion',
        ),
        storyId: text(body.storyId, 'storyId'),
        storyRevisionId: text(body.storyRevisionId, 'storyRevisionId'),
        target: parseClarificationTarget(text(body.target, 'target')),
        question: text(body.question, 'question'),
      }),
    );
  }

  @Post(':iterationId/understanding/clarifications/:clarificationId/answer')
  async answerClarification(
    @Param('workspaceId') workspaceId: string,
    @Param('iterationId') iterationId: string,
    @Param('clarificationId') clarificationId: string,
    @Body() value: unknown,
  ) {
    const body = record(value);
    const workspace = await this.resolver.requireWorkspace(workspaceId);
    return clarificationAnswerResultModel(
      workspaceId,
      await workspace.understanding().answerClarification(
        iterationId,
        {
          expectedIterationVersion: positive(
            body.expectedIterationVersion,
            'expectedIterationVersion',
          ),
          clarificationId,
          answer: text(body.answer, 'answer'),
        },
        this.resolver.currentUserId(),
      ),
    );
  }

  @Post(':iterationId/understanding/scenario-proposals')
  @HttpCode(HttpStatus.CREATED)
  async proposeScenarios(
    @Param('workspaceId') workspaceId: string,
    @Param('iterationId') iterationId: string,
    @Body() value: unknown,
  ) {
    const body = record(value);
    const scenarios = array(body.scenarios, 'scenarios').map((entry, index) => {
      const scenario = record(entry, `scenarios[${String(index)}]`);
      return {
        title: text(scenario.title, `scenarios[${String(index)}].title`),
        given: strings(scenario.given, `scenarios[${String(index)}].given`),
        when: text(scenario.when, `scenarios[${String(index)}].when`),
        then: strings(scenario.then, `scenarios[${String(index)}].then`),
        businessData: strings(
          scenario.businessData,
          `scenarios[${String(index)}].businessData`,
        ),
      };
    });
    const workspace = await this.resolver.requireWorkspace(workspaceId);
    return scenarioProposalModel(
      await workspace.understanding().proposeScenarioSet(iterationId, {
        expectedIterationVersion: positive(
          body.expectedIterationVersion,
          'expectedIterationVersion',
        ),
        storyId: text(body.storyId, 'storyId'),
        storyRevisionId: text(body.storyRevisionId, 'storyRevisionId'),
        scenarios,
      }),
    );
  }

  @Post(':iterationId/understanding/decisions')
  @HttpCode(HttpStatus.OK)
  async decide(
    @Param('workspaceId') workspaceId: string,
    @Param('iterationId') iterationId: string,
    @Body() value: unknown,
  ) {
    const body = record(value);
    const workspace = await this.resolver.requireWorkspace(workspaceId);
    return understandingDecisionResultModel(
      workspaceId,
      await workspace.understanding().decideUnderstanding(
        iterationId,
        {
          expectedIterationVersion: positive(
            body.expectedIterationVersion,
            'expectedIterationVersion',
          ),
          action: parseUnderstandingDecisionAction(text(body.action, 'action')),
          proposalId: optionalText(body.proposalId, 'proposalId'),
          proposalSha256: optionalText(body.proposalSha256, 'proposalSha256'),
          selectedDraftIds:
            body.selectedDraftIds === undefined
              ? []
              : strings(body.selectedDraftIds, 'selectedDraftIds'),
          reason: optionalText(body.reason, 'reason'),
        },
        this.resolver.currentUserId(),
      ),
    );
  }
}

function record(value: unknown, name = 'body'): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw DomainError.validation(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}

function array(value: unknown, name: string): unknown[] {
  if (!Array.isArray(value))
    throw DomainError.validation(`${name} must be an array`);
  return value;
}

function strings(value: unknown, name: string): string[] {
  return array(value, name).map((entry, index) =>
    text(entry, `${name}[${String(index)}]`),
  );
}

function text(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw DomainError.validation(`${name} is required`);
  }
  return value;
}

function optionalText(value: unknown, name: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  return text(value, name);
}

function positive(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw DomainError.validation(`${name} must be a positive integer`);
  }
  return Number(value);
}
