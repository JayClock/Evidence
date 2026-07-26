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
} from '@evidence/server-domain';
import {
  link,
  type Link,
  workspaceInboxExtractionHref,
  workspaceStoryCandidatesHref,
} from './links';
import {
  inboxExtractionModel,
  type InboxExtractionModel,
  inboxStoryCandidateModel,
  type InboxStoryCandidateModel,
} from './model';
import { ResourceResolver } from './resource-resolver.service';

interface CreateExtractionBody {
  inboxItemIds?: unknown;
}

interface ProposeCandidatesBody {
  expectedVersion?: unknown;
  candidates?: unknown;
}

interface PassthroughResponse {
  setHeader(name: string, value: string): void;
}

interface ProposedCandidateSetModel {
  _links: Record<string, Link>;
  extraction: InboxExtractionModel;
  _embedded: { storyCandidates: InboxStoryCandidateModel[] };
}

@Controller()
export class InboxExtractionsController {
  constructor(private readonly resolver: ResourceResolver) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createExtraction(
    @Param('workspaceId') workspaceId: string,
    @Body() input: CreateExtractionBody,
    @Res({ passthrough: true }) response: PassthroughResponse,
  ): Promise<InboxExtractionModel> {
    const workspace = await this.resolver.requireWorkspace(workspaceId);
    const extraction = await workspace.inboxWorkflow().createExtraction(
      {
        inboxItemIds: requiredStringArray(input.inboxItemIds, 'inboxItemIds'),
      },
      this.resolver.currentUserId(),
    );
    response.setHeader(
      'Location',
      workspaceInboxExtractionHref(workspaceId, extraction.identity()),
    );
    return inboxExtractionModel(extraction);
  }

  @Get(':extractionId')
  async getExtraction(
    @Param('workspaceId') workspaceId: string,
    @Param('extractionId') extractionId: string,
  ): Promise<InboxExtractionModel> {
    const workspace = await this.resolver.requireWorkspace(workspaceId);
    const extraction = await workspace
      .inboxWorkflow()
      .findExtraction(extractionId);
    if (!extraction) {
      throw DomainError.notFound(`Inbox Extraction ${extractionId} not found`);
    }
    return inboxExtractionModel(extraction);
  }

  @Post(':extractionId/candidates')
  @HttpCode(HttpStatus.CREATED)
  async proposeCandidates(
    @Param('workspaceId') workspaceId: string,
    @Param('extractionId') extractionId: string,
    @Body() input: ProposeCandidatesBody,
  ): Promise<ProposedCandidateSetModel> {
    const workspace = await this.resolver.requireWorkspace(workspaceId);
    const result = await workspace
      .inboxWorkflow()
      .proposeCandidates(
        extractionId,
        requiredPositiveInteger(input.expectedVersion, 'expectedVersion'),
        candidateInputs(input.candidates),
      );
    return {
      _links: {
        extraction: link(
          workspaceInboxExtractionHref(workspaceId, extractionId),
        ),
        'story-candidates': link(workspaceStoryCandidatesHref(workspaceId)),
      },
      extraction: inboxExtractionModel(result.extraction),
      _embedded: {
        storyCandidates: result.candidates.map(inboxStoryCandidateModel),
      },
    };
  }
}

function candidateInputs(value: unknown): InboxStoryCandidateInput[] {
  if (!Array.isArray(value)) {
    throw DomainError.validation('candidates must be an array');
  }
  return value.map((candidate, index) => {
    if (
      !candidate ||
      typeof candidate !== 'object' ||
      Array.isArray(candidate)
    ) {
      throw DomainError.validation(
        `candidates[${String(index)}] must be an object`,
      );
    }
    const input = candidate as Record<string, unknown>;
    return {
      title: requiredString(input.title, `candidates[${String(index)}].title`),
      problem: requiredString(
        input.problem,
        `candidates[${String(index)}].problem`,
      ),
      role: requiredString(input.role, `candidates[${String(index)}].role`),
      goal: requiredString(input.goal, `candidates[${String(index)}].goal`),
      value: requiredString(input.value, `candidates[${String(index)}].value`),
      cognitiveMode: requiredString(
        input.cognitiveMode,
        `candidates[${String(index)}].cognitiveMode`,
      ) as InboxStoryCandidateInput['cognitiveMode'],
      citations: citationInputs(
        input.citations,
        `candidates[${String(index)}].citations`,
      ),
    };
  });
}

function citationInputs(
  value: unknown,
  name: string,
): InboxStoryCandidateInput['citations'] {
  if (!Array.isArray(value)) {
    throw DomainError.validation(`${name} must be an array`);
  }
  return value.map((citation, index) => {
    if (!citation || typeof citation !== 'object' || Array.isArray(citation)) {
      throw DomainError.validation(
        `${name}[${String(index)}] must be an object`,
      );
    }
    const input = citation as Record<string, unknown>;
    return {
      inboxItemId: requiredString(
        input.inboxItemId,
        `${name}[${String(index)}].inboxItemId`,
      ),
      revisionSha256: requiredString(
        input.revisionSha256,
        `${name}[${String(index)}].revisionSha256`,
      ),
      locator: requiredString(
        input.locator,
        `${name}[${String(index)}].locator`,
      ),
    };
  });
}

function requiredStringArray(value: unknown, name: string): string[] {
  if (!Array.isArray(value)) {
    throw DomainError.validation(`${name} must be an array`);
  }
  return value.map((entry, index) =>
    requiredString(entry, `${name}[${String(index)}]`),
  );
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw DomainError.validation(`${name} is required`);
  }
  return value.trim();
}

function requiredPositiveInteger(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw DomainError.validation(`${name} must be a positive integer`);
  }
  return Number(value);
}
