import type { CodingRun } from '@evidence/server-domain';
import {
  link,
  type Link,
  userHref,
  workspaceCodingRunCommandHref,
  workspaceCodingRunHref,
  workspaceHref,
  workspaceStoryCodingRunsHref,
  workspaceStoryHref,
  workspaceStoryRevisionHref,
} from '../links';

export interface CodingRunQualityCheckModel {
  name: string;
  status: string;
  durationMs: number | null;
  summary: string | null;
}

export interface CodingRunModel {
  _links: Record<string, Link>;
  id: string;
  storyId: string;
  storyRevisionId: string;
  requestedByUserId: string;
  status: string;
  version: number;
  baseCommitSha: string;
  diffSha256: string | null;
  changedFileCount: number | null;
  qualityChecks: CodingRunQualityCheckModel[];
  commitSha: string | null;
  failureCode: string | null;
  failureSummary: string | null;
  decisionReason: string | null;
  startedAt: string;
  executionFinishedAt: string | null;
  decidedByUserId: string | null;
  decidedAt: string | null;
}

export function codingRunModel(run: CodingRun): CodingRunModel {
  const id = run.identity();
  const description = run.description();
  const workspaceId = description.workspace.id();
  const storyId = description.story.id();
  const links: Record<string, Link> = {
    self: link(workspaceCodingRunHref(workspaceId, id)),
    workspace: link(workspaceHref(workspaceId)),
    story: link(workspaceStoryHref(workspaceId, storyId)),
    'story-revision': link(
      workspaceStoryRevisionHref(
        workspaceId,
        storyId,
        description.storyRevision.id(),
      ),
    ),
    collection: link(workspaceStoryCodingRunsHref(workspaceId, storyId)),
    'requested-by': link(userHref(description.requestedBy.id())),
  };
  if (description.decidedBy) {
    links['decided-by'] = link(userHref(description.decidedBy.id()));
  }
  if (description.status === 'running') {
    links.review = link(
      workspaceCodingRunCommandHref(workspaceId, id, 'review'),
    );
    links.fail = link(workspaceCodingRunCommandHref(workspaceId, id, 'fail'));
    links.cancel = link(
      workspaceCodingRunCommandHref(workspaceId, id, 'cancel'),
    );
  }
  if (description.status === 'review_required') {
    links.accept = link(
      workspaceCodingRunCommandHref(workspaceId, id, 'accept'),
    );
    links.reject = link(
      workspaceCodingRunCommandHref(workspaceId, id, 'reject'),
    );
  }

  return {
    _links: links,
    id,
    storyId,
    storyRevisionId: description.storyRevision.id(),
    requestedByUserId: description.requestedBy.id(),
    status: description.status,
    version: description.version,
    baseCommitSha: description.baseCommitSha,
    diffSha256: description.diffSha256,
    changedFileCount: description.changedFileCount,
    qualityChecks: description.qualityChecks.map((check) => ({ ...check })),
    commitSha: description.commitSha,
    failureCode: description.failureCode,
    failureSummary: description.failureSummary,
    decisionReason: description.decisionReason,
    startedAt: description.startedAt,
    executionFinishedAt: description.executionFinishedAt,
    decidedByUserId: description.decidedBy?.id() ?? null,
    decidedAt: description.decidedAt,
  };
}
