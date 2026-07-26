import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  DomainError,
  parseInboxCandidateStatus,
  type InboxCandidateStatus,
  type InboxStoryCandidate,
} from '@evidence/server-domain';
import {
  link,
  type Link,
  workspaceHref,
  workspaceIterationHref,
  workspaceStoryCandidatesHref,
} from './links';
import {
  inboxStoryCandidateModel,
  type InboxStoryCandidateModel,
  iterationModel,
  type IterationModel,
} from './model';
import { parsePositiveInteger, totalPages } from './request';
import { ResourceResolver } from './resource-resolver.service';

interface CandidateDecisionBody {
  candidateSha256?: unknown;
  reason?: unknown;
}

interface SelectCandidateBody {
  candidateSha256?: unknown;
  baseCommitSha?: unknown;
}

interface PassthroughResponse {
  setHeader(name: string, value: string): void;
}

interface CandidateCollectionModel {
  _links: Record<string, Link>;
  _embedded: { storyCandidates: InboxStoryCandidateModel[] };
  page: {
    number: number;
    size: number;
    totalElements: number;
    totalPages: number;
  };
}

@Controller()
export class InboxStoryCandidatesController {
  constructor(private readonly resolver: ResourceResolver) {}

  @Get()
  async listCandidates(
    @Param('workspaceId') workspaceId: string,
    @Query('page') pageInput?: string,
    @Query('pageSize') pageSizeInput?: string,
    @Query('status') statusInput?: string,
  ): Promise<CandidateCollectionModel> {
    const workspace = await this.resolver.requireWorkspace(workspaceId);
    const page = parsePositiveInteger(pageInput, 1, 'page');
    const pageSize = Math.min(
      parsePositiveInteger(pageSizeInput, 20, 'pageSize'),
      100,
    );
    const status = optionalStatus(statusInput);
    const [candidates, total] = await workspace
      .inboxWorkflow()
      .listCandidates({ page, pageSize, ...(status ? { status } : {}) });
    return candidateCollection(
      workspaceId,
      candidates,
      page,
      pageSize,
      total,
      status,
    );
  }

  @Get(':candidateId')
  async getCandidate(
    @Param('workspaceId') workspaceId: string,
    @Param('candidateId') candidateId: string,
  ): Promise<InboxStoryCandidateModel> {
    const workspace = await this.resolver.requireWorkspace(workspaceId);
    const candidate = await workspace
      .inboxWorkflow()
      .findCandidate(candidateId);
    if (!candidate) {
      throw DomainError.notFound(`Inbox Candidate ${candidateId} not found`);
    }
    return inboxStoryCandidateModel(candidate);
  }

  @Post(':candidateId/defer')
  @HttpCode(HttpStatus.OK)
  deferCandidate(
    @Param('workspaceId') workspaceId: string,
    @Param('candidateId') candidateId: string,
    @Body() input: CandidateDecisionBody,
  ) {
    return this.decideCandidate(workspaceId, candidateId, input, 'defer');
  }

  @Post(':candidateId/reject')
  @HttpCode(HttpStatus.OK)
  rejectCandidate(
    @Param('workspaceId') workspaceId: string,
    @Param('candidateId') candidateId: string,
    @Body() input: CandidateDecisionBody,
  ) {
    return this.decideCandidate(workspaceId, candidateId, input, 'reject');
  }

  @Post(':candidateId/select')
  @HttpCode(HttpStatus.CREATED)
  async selectCandidate(
    @Param('workspaceId') workspaceId: string,
    @Param('candidateId') candidateId: string,
    @Body() input: SelectCandidateBody,
    @Res({ passthrough: true }) response: PassthroughResponse,
  ): Promise<IterationModel> {
    const workspace = await this.resolver.requireWorkspace(workspaceId);
    const selected = await workspace.iterations().selectCandidate(
      {
        candidateId,
        candidateSha256: requiredString(
          input.candidateSha256,
          'candidateSha256',
        ),
        baseCommitSha: requiredString(input.baseCommitSha, 'baseCommitSha'),
      },
      this.resolver.currentUserId(),
    );
    response.setHeader(
      'Location',
      workspaceIterationHref(workspaceId, selected.iteration.identity()),
    );
    return iterationModel(selected.iteration);
  }

  private async decideCandidate(
    workspaceId: string,
    candidateId: string,
    input: CandidateDecisionBody,
    action: 'defer' | 'reject',
  ): Promise<InboxStoryCandidateModel> {
    const workspace = await this.resolver.requireWorkspace(workspaceId);
    const result = await workspace
      .inboxWorkflow()
      .decideCandidate(
        candidateId,
        requiredString(input.candidateSha256, 'candidateSha256'),
        action,
        requiredString(input.reason, 'reason'),
        this.resolver.currentUserId(),
      );
    return inboxStoryCandidateModel(result.candidate);
  }
}

function candidateCollection(
  workspaceId: string,
  candidates: InboxStoryCandidate[],
  page: number,
  pageSize: number,
  total: number,
  status?: InboxCandidateStatus,
): CandidateCollectionModel {
  const href = (targetPage: number) => {
    const parameters = new URLSearchParams({
      page: String(targetPage),
      pageSize: String(pageSize),
    });
    if (status) parameters.set('status', status);
    return `${workspaceStoryCandidatesHref(workspaceId)}?${parameters.toString()}`;
  };
  const pages = totalPages(total, pageSize);
  const links: Record<string, Link> = {
    self: link(href(page)),
    workspace: link(workspaceHref(workspaceId)),
  };
  if (page > 1) links.prev = link(href(page - 1));
  if (page < pages) links.next = link(href(page + 1));
  return {
    _links: links,
    _embedded: {
      storyCandidates: candidates.map(inboxStoryCandidateModel),
    },
    page: {
      number: page,
      size: pageSize,
      totalElements: total,
      totalPages: pages,
    },
  };
}

function optionalStatus(value: string | undefined) {
  const normalized = value?.trim();
  return normalized ? parseInboxCandidateStatus(normalized) : undefined;
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw DomainError.validation(`${name} is required`);
  }
  return value.trim();
}
