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
  parseCodingRunStatus,
  type CodingRun,
  type CodingRunQualityCheck,
  type CodingRunStatus,
} from '@evidence/server-domain';
import {
  link,
  type Link,
  workspaceStoryCodingRunsHref,
  workspaceStoryHref,
} from './links';
import { codingRunModel, type CodingRunModel } from './model';
import { parsePositiveInteger, totalPages } from './request';
import { ResourceResolver } from './resource-resolver.service';

interface StartCodingRunBody {
  storyRevisionId?: unknown;
  baseCommitSha?: unknown;
}

interface CodingRunVersionBody {
  expectedVersion?: unknown;
}

interface CodingRunReviewBody extends CodingRunVersionBody {
  diffSha256?: unknown;
  changedFileCount?: unknown;
  qualityChecks?: unknown;
}

interface CodingRunFailureBody extends CodingRunVersionBody {
  code?: unknown;
  summary?: unknown;
}

interface CodingRunAcceptanceBody extends CodingRunVersionBody {
  diffSha256?: unknown;
  commitSha?: unknown;
}

interface CodingRunRejectionBody extends CodingRunVersionBody {
  reason?: unknown;
}

interface PassthroughResponse {
  setHeader(name: string, value: string): void;
}

interface CodingRunCollectionModel {
  _links: Record<string, Link>;
  _embedded: { codingRuns: CodingRunModel[] };
  page: {
    number: number;
    size: number;
    totalElements: number;
    totalPages: number;
  };
}

@Controller()
export class StoryCodingRunsController {
  constructor(private readonly resolver: ResourceResolver) {}

  @Get()
  async list(
    @Param('workspaceId') workspaceId: string,
    @Param('storyId') storyId: string,
    @Query('page') pageInput?: string,
    @Query('pageSize') pageSizeInput?: string,
    @Query('status') statusInput?: string,
  ): Promise<CodingRunCollectionModel> {
    const [workspace] = await this.resolver.requireWorkspaceStory(
      workspaceId,
      storyId,
    );
    const page = parsePositiveInteger(pageInput, 1, 'page');
    const pageSize = Math.min(
      parsePositiveInteger(pageSizeInput, 20, 'pageSize'),
      100,
    );
    const status = optionalStatus(statusInput);
    const [runs, total] = await workspace.listCodingRuns({
      page,
      pageSize,
      storyId,
      ...(status ? { status } : {}),
    });
    return collectionModel(
      workspaceId,
      storyId,
      runs,
      page,
      pageSize,
      total,
      status,
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async start(
    @Param('workspaceId') workspaceId: string,
    @Param('storyId') storyId: string,
    @Body() input: StartCodingRunBody,
    @Res({ passthrough: true }) response: PassthroughResponse,
  ): Promise<CodingRunModel> {
    const [workspace] = await this.resolver.requireWorkspaceStory(
      workspaceId,
      storyId,
    );
    const run = await workspace.startCodingRun(
      storyId,
      {
        storyRevisionId: requiredString(
          input.storyRevisionId,
          'storyRevisionId',
        ),
        baseCommitSha: requiredString(input.baseCommitSha, 'baseCommitSha'),
      },
      this.resolver.currentUserId(),
    );
    const model = codingRunModel(run);
    response.setHeader('Location', model._links.self?.href ?? '');
    return model;
  }
}

@Controller(':runId')
export class CodingRunsController {
  constructor(private readonly resolver: ResourceResolver) {}

  @Get()
  async get(
    @Param('workspaceId') workspaceId: string,
    @Param('runId') runId: string,
  ): Promise<CodingRunModel> {
    const [, run] = await this.resolver.requireWorkspaceCodingRun(
      workspaceId,
      runId,
    );
    return codingRunModel(run);
  }

  @Post('review')
  @HttpCode(HttpStatus.OK)
  async review(
    @Param('workspaceId') workspaceId: string,
    @Param('runId') runId: string,
    @Body() input: CodingRunReviewBody,
  ): Promise<CodingRunModel> {
    const [workspace] = await this.resolver.requireWorkspaceCodingRun(
      workspaceId,
      runId,
    );
    return codingRunModel(
      await workspace.submitCodingRunForReview(runId, expectedVersion(input), {
        diffSha256: requiredString(input.diffSha256, 'diffSha256'),
        changedFileCount: requiredNonNegativeInteger(
          input.changedFileCount,
          'changedFileCount',
        ),
        qualityChecks: qualityChecks(input.qualityChecks),
      }),
    );
  }

  @Post('fail')
  @HttpCode(HttpStatus.OK)
  async fail(
    @Param('workspaceId') workspaceId: string,
    @Param('runId') runId: string,
    @Body() input: CodingRunFailureBody,
  ): Promise<CodingRunModel> {
    const [workspace] = await this.resolver.requireWorkspaceCodingRun(
      workspaceId,
      runId,
    );
    return codingRunModel(
      await workspace.failCodingRun(runId, expectedVersion(input), {
        code: requiredString(input.code, 'code'),
        summary: requiredString(input.summary, 'summary'),
      }),
    );
  }

  @Post('cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(
    @Param('workspaceId') workspaceId: string,
    @Param('runId') runId: string,
    @Body() input: CodingRunVersionBody,
  ): Promise<CodingRunModel> {
    const [workspace] = await this.resolver.requireWorkspaceCodingRun(
      workspaceId,
      runId,
    );
    return codingRunModel(
      await workspace.cancelCodingRun(runId, expectedVersion(input)),
    );
  }

  @Post('accept')
  @HttpCode(HttpStatus.OK)
  async accept(
    @Param('workspaceId') workspaceId: string,
    @Param('runId') runId: string,
    @Body() input: CodingRunAcceptanceBody,
  ): Promise<CodingRunModel> {
    const [workspace] = await this.resolver.requireWorkspaceCodingRun(
      workspaceId,
      runId,
    );
    return codingRunModel(
      await workspace.acceptCodingRun(
        runId,
        expectedVersion(input),
        {
          diffSha256: requiredString(input.diffSha256, 'diffSha256'),
          commitSha: requiredString(input.commitSha, 'commitSha'),
        },
        this.resolver.currentUserId(),
      ),
    );
  }

  @Post('reject')
  @HttpCode(HttpStatus.OK)
  async reject(
    @Param('workspaceId') workspaceId: string,
    @Param('runId') runId: string,
    @Body() input: CodingRunRejectionBody,
  ): Promise<CodingRunModel> {
    const [workspace] = await this.resolver.requireWorkspaceCodingRun(
      workspaceId,
      runId,
    );
    return codingRunModel(
      await workspace.rejectCodingRun(
        runId,
        expectedVersion(input),
        requiredString(input.reason, 'reason'),
        this.resolver.currentUserId(),
      ),
    );
  }
}

function collectionModel(
  workspaceId: string,
  storyId: string,
  runs: CodingRun[],
  page: number,
  pageSize: number,
  total: number,
  status?: CodingRunStatus,
): CodingRunCollectionModel {
  const pages = totalPages(total, pageSize);
  const href = (targetPage: number) =>
    collectionPageHref(workspaceId, storyId, targetPage, pageSize, status);
  const links: Record<string, Link> = {
    self: link(href(page)),
    story: link(workspaceStoryHref(workspaceId, storyId)),
  };
  if (page > 1) links.prev = link(href(page - 1));
  if (page < pages) links.next = link(href(page + 1));
  return {
    _links: links,
    _embedded: { codingRuns: runs.map(codingRunModel) },
    page: {
      number: page,
      size: pageSize,
      totalElements: total,
      totalPages: pages,
    },
  };
}

function collectionPageHref(
  workspaceId: string,
  storyId: string,
  page: number,
  pageSize: number,
  status?: CodingRunStatus,
): string {
  const parameters = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  if (status) parameters.set('status', status);
  return `${workspaceStoryCodingRunsHref(workspaceId, storyId)}?${parameters.toString()}`;
}

function optionalStatus(
  value: string | undefined,
): CodingRunStatus | undefined {
  const normalized = value?.trim();
  return normalized ? parseCodingRunStatus(normalized) : undefined;
}

function expectedVersion(input: CodingRunVersionBody): number {
  if (
    !Number.isSafeInteger(input.expectedVersion) ||
    Number(input.expectedVersion) <= 0
  ) {
    throw DomainError.validation('expectedVersion must be a positive integer');
  }
  return Number(input.expectedVersion);
}

function qualityChecks(value: unknown): CodingRunQualityCheck[] {
  if (!Array.isArray(value)) {
    throw DomainError.validation('qualityChecks must be an array');
  }
  return value.map((entry, index) => {
    const check = requiredObject(entry, `qualityChecks[${String(index)}]`);
    return {
      name: requiredString(check.name, `qualityChecks[${String(index)}].name`),
      status: requiredString(
        check.status,
        `qualityChecks[${String(index)}].status`,
      ) as CodingRunQualityCheck['status'],
      durationMs: optionalNonNegativeInteger(
        check.durationMs,
        `qualityChecks[${String(index)}].durationMs`,
      ),
      summary: optionalString(
        check.summary,
        `qualityChecks[${String(index)}].summary`,
      ),
    };
  });
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
  if (value === null || value === undefined) return null;
  return requiredString(value, name);
}

function requiredNonNegativeInteger(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw DomainError.validation(`${name} must be a non-negative integer`);
  }
  return Number(value);
}

function optionalNonNegativeInteger(
  value: unknown,
  name: string,
): number | null {
  if (value === null || value === undefined) return null;
  return requiredNonNegativeInteger(value, name);
}
