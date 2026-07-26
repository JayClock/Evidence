import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import {
  DomainError,
  type InboxStoryCandidateInput,
  type KickoffDecisionAction,
} from '@evidence/server-domain';
import { workspaceIterationKickoffProposalsHref } from './links';
import {
  iterationIntakeModel,
  type IterationIntakeModel,
  iterationModel,
  type IterationModel,
  kickoffDecisionResultModel,
  type KickoffDecisionResultModel,
  kickoffModel,
  type KickoffModel,
  kickoffProposalModel,
  type KickoffProposalModel,
} from './model';
import { ResourceResolver } from './resource-resolver.service';

interface CompleteProvisioningBody {
  expectedVersion?: unknown;
  baseCommitSha?: unknown;
  branchName?: unknown;
}

interface FailProvisioningBody {
  expectedVersion?: unknown;
  reason?: unknown;
}

interface KickoffProposalBody {
  expectedIterationVersion?: unknown;
  proposal?: unknown;
}

interface KickoffDecisionBody {
  proposalId?: unknown;
  proposalSha256?: unknown;
  expectedIterationVersion?: unknown;
  action?: unknown;
  reason?: unknown;
}

interface PassthroughResponse {
  setHeader(name: string, value: string): void;
}

@Controller()
export class IterationsController {
  constructor(private readonly resolver: ResourceResolver) {}

  @Get(':iterationId')
  async getIteration(
    @Param('workspaceId') workspaceId: string,
    @Param('iterationId') iterationId: string,
  ): Promise<IterationModel> {
    const workspace = await this.resolver.requireWorkspace(workspaceId);
    const iteration = await workspace.iterations().findIteration(iterationId);
    if (!iteration) {
      throw DomainError.notFound(`Iteration ${iterationId} not found`);
    }
    return iterationModel(iteration);
  }

  @Get(':iterationId/intake')
  async getIntake(
    @Param('workspaceId') workspaceId: string,
    @Param('iterationId') iterationId: string,
  ): Promise<IterationIntakeModel> {
    const workspace = await this.resolver.requireWorkspace(workspaceId);
    const intake = await workspace.iterations().findIntake(iterationId);
    if (!intake) {
      throw DomainError.notFound(`Iteration Intake ${iterationId} not found`);
    }
    return iterationIntakeModel(workspaceId, intake);
  }

  @Post(':iterationId/provisioning/complete')
  @HttpCode(HttpStatus.OK)
  async completeProvisioning(
    @Param('workspaceId') workspaceId: string,
    @Param('iterationId') iterationId: string,
    @Body() input: CompleteProvisioningBody,
  ): Promise<IterationModel> {
    const workspace = await this.resolver.requireWorkspace(workspaceId);
    return iterationModel(
      await workspace.iterations().completeProvisioning(iterationId, {
        expectedVersion: requiredPositiveInteger(
          input.expectedVersion,
          'expectedVersion',
        ),
        baseCommitSha: requiredString(input.baseCommitSha, 'baseCommitSha'),
        branchName: requiredString(input.branchName, 'branchName'),
      }),
    );
  }

  @Post(':iterationId/provisioning/fail')
  @HttpCode(HttpStatus.OK)
  async failProvisioning(
    @Param('workspaceId') workspaceId: string,
    @Param('iterationId') iterationId: string,
    @Body() input: FailProvisioningBody,
  ): Promise<IterationModel> {
    const workspace = await this.resolver.requireWorkspace(workspaceId);
    return iterationModel(
      await workspace.iterations().failProvisioning(iterationId, {
        expectedVersion: requiredPositiveInteger(
          input.expectedVersion,
          'expectedVersion',
        ),
        reason: requiredString(input.reason, 'reason'),
      }),
    );
  }

  @Get(':iterationId/kickoff')
  async getKickoff(
    @Param('workspaceId') workspaceId: string,
    @Param('iterationId') iterationId: string,
  ): Promise<KickoffModel> {
    const workspace = await this.resolver.requireWorkspace(workspaceId);
    const view = await workspace.iterations().findKickoff(iterationId);
    if (!view) {
      throw DomainError.notFound(`Iteration ${iterationId} not found`);
    }
    return kickoffModel(workspaceId, view);
  }

  @Post(':iterationId/kickoff/proposals')
  @HttpCode(HttpStatus.CREATED)
  async proposeKickoffReplacement(
    @Param('workspaceId') workspaceId: string,
    @Param('iterationId') iterationId: string,
    @Body() input: KickoffProposalBody,
    @Res({ passthrough: true }) response: PassthroughResponse,
  ): Promise<KickoffProposalModel> {
    const workspace = await this.resolver.requireWorkspace(workspaceId);
    const proposal = await workspace
      .iterations()
      .proposeKickoffReplacement(
        iterationId,
        requiredPositiveInteger(
          input.expectedIterationVersion,
          'expectedIterationVersion',
        ),
        candidateInput(input.proposal, 'proposal'),
      );
    response.setHeader(
      'Location',
      `${workspaceIterationKickoffProposalsHref(workspaceId, iterationId)}/${proposal.identity()}`,
    );
    return kickoffProposalModel(workspaceId, proposal);
  }

  @Post(':iterationId/kickoff/decisions')
  @HttpCode(HttpStatus.OK)
  async decideKickoff(
    @Param('workspaceId') workspaceId: string,
    @Param('iterationId') iterationId: string,
    @Body() input: KickoffDecisionBody,
  ): Promise<KickoffDecisionResultModel> {
    const workspace = await this.resolver.requireWorkspace(workspaceId);
    const result = await workspace.iterations().decideKickoff(
      iterationId,
      {
        proposalId: requiredString(input.proposalId, 'proposalId'),
        proposalSha256: requiredString(input.proposalSha256, 'proposalSha256'),
        expectedIterationVersion: requiredPositiveInteger(
          input.expectedIterationVersion,
          'expectedIterationVersion',
        ),
        action: requiredString(input.action, 'action') as KickoffDecisionAction,
        reason: optionalString(input.reason, 'reason'),
      },
      this.resolver.currentUserId(),
    );
    return kickoffDecisionResultModel(workspaceId, result);
  }
}

function candidateInput(
  value: unknown,
  name: string,
): InboxStoryCandidateInput {
  const input = requiredObject(value, name);
  const citationsValue = input.citations;
  if (!Array.isArray(citationsValue)) {
    throw DomainError.validation(`${name}.citations must be an array`);
  }
  return {
    title: requiredString(input.title, `${name}.title`),
    problem: requiredString(input.problem, `${name}.problem`),
    role: requiredString(input.role, `${name}.role`),
    goal: requiredString(input.goal, `${name}.goal`),
    value: requiredString(input.value, `${name}.value`),
    cognitiveMode: requiredString(
      input.cognitiveMode,
      `${name}.cognitiveMode`,
    ) as InboxStoryCandidateInput['cognitiveMode'],
    citations: citationsValue.map((entry, index) => {
      const citation = requiredObject(
        entry,
        `${name}.citations[${String(index)}]`,
      );
      return {
        inboxItemId: requiredString(
          citation.inboxItemId,
          `${name}.citations[${String(index)}].inboxItemId`,
        ),
        revisionSha256: requiredString(
          citation.revisionSha256,
          `${name}.citations[${String(index)}].revisionSha256`,
        ),
        locator: requiredString(
          citation.locator,
          `${name}.citations[${String(index)}].locator`,
        ),
      };
    }),
  };
}

function requiredObject(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw DomainError.validation(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw DomainError.validation(`${name} is required`);
  }
  return value.trim();
}

function optionalString(value: unknown, name: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') {
    throw DomainError.validation(`${name} must be a string`);
  }
  return value;
}

function requiredPositiveInteger(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw DomainError.validation(`${name} must be a positive integer`);
  }
  return Number(value);
}
