import type { InboxItem, InboxRevision } from '@evidence/server-domain';
import {
  link,
  type Link,
  workspaceHref,
  workspaceInboxExtractionsHref,
  workspaceInboxItemHref,
  workspaceInboxItemsHref,
  workspaceInboxRevisionHref,
  workspaceInboxRevisionsHref,
  workspaceStoryCandidatesHref,
} from '../links';

export interface InboxItemModel {
  _links: Record<string, Link>;
  id: string;
  sourceKind: string;
  externalKey: string;
  title: string;
  status: string;
  latestRevisionId: string;
  latestRevisionSha256: string;
  revisionCount: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export function inboxItemModel(item: InboxItem): InboxItemModel {
  const itemId = item.identity();
  const description = item.description();
  const workspaceId = description.workspace.id();
  return {
    _links: {
      self: link(workspaceInboxItemHref(workspaceId, itemId)),
      workspace: link(workspaceHref(workspaceId)),
      collection: link(workspaceInboxItemsHref(workspaceId)),
      revisions: link(workspaceInboxRevisionsHref(workspaceId, itemId)),
      'story-candidates': link(workspaceStoryCandidatesHref(workspaceId)),
      'inbox-extractions': link(workspaceInboxExtractionsHref(workspaceId)),
      'latest-revision': link(
        workspaceInboxRevisionHref(
          workspaceId,
          itemId,
          description.latestRevisionId,
        ),
      ),
    },
    id: itemId,
    sourceKind: description.sourceKind,
    externalKey: description.externalKey,
    title: description.title,
    status: description.status,
    latestRevisionId: description.latestRevisionId,
    latestRevisionSha256: description.latestRevisionSha256,
    revisionCount: description.revisionCount,
    version: description.version,
    createdAt: description.createdAt,
    updatedAt: description.updatedAt,
  };
}

export interface InboxRevisionModel {
  _links: Record<string, Link>;
  id: string;
  revisionNumber: number;
  title: string;
  body: string;
  contentType: string;
  uri: string | null;
  providerMetadata: ReturnType<
    InboxRevision['description']
  >['providerMetadata'];
  sourceUpdatedAt: string | null;
  capturedAt: string;
  contentSha256: string;
}

export function inboxRevisionModel(
  workspaceId: string,
  revision: InboxRevision,
): InboxRevisionModel {
  const revisionId = revision.identity();
  const description = revision.description();
  const itemId = description.item.id();
  return {
    _links: {
      self: link(workspaceInboxRevisionHref(workspaceId, itemId, revisionId)),
      item: link(workspaceInboxItemHref(workspaceId, itemId)),
      collection: link(workspaceInboxRevisionsHref(workspaceId, itemId)),
      workspace: link(workspaceHref(workspaceId)),
      'story-candidates': link(workspaceStoryCandidatesHref(workspaceId)),
    },
    id: revisionId,
    revisionNumber: description.revisionNumber,
    title: description.title,
    body: description.body,
    contentType: description.contentType,
    uri: description.uri,
    providerMetadata: description.providerMetadata,
    sourceUpdatedAt: description.sourceUpdatedAt,
    capturedAt: description.capturedAt,
    contentSha256: description.contentSha256,
  };
}
