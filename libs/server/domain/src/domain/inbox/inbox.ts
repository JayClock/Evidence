import { Entity, HasMany, Ref } from '../core';

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type InboxItemStatus = 'active' | 'deferred' | 'closed';
export type InboxContentType = 'text/plain' | 'text/markdown';

export interface InboxSourceInput {
  sourceKind: string;
  externalKey: string;
  title: string;
  body: string;
  contentType: InboxContentType;
  uri?: string | null;
  providerMetadata?: Record<string, JsonValue> | null;
  sourceUpdatedAt?: string | null;
}

export interface InboxItemDescription {
  workspace: Ref<string>;
  sourceKind: string;
  externalKey: string;
  title: string;
  status: InboxItemStatus;
  latestRevisionId: string;
  latestRevisionSha256: string;
  revisionCount: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export class InboxItem implements Entity<string, InboxItemDescription> {
  constructor(
    private readonly id: string,
    private readonly desc: InboxItemDescription,
  ) {}

  identity(): string {
    return this.id;
  }

  description(): InboxItemDescription {
    return this.desc;
  }
}

export interface InboxRevisionDescription {
  item: Ref<string>;
  revisionNumber: number;
  title: string;
  body: string;
  contentType: InboxContentType;
  uri: string | null;
  providerMetadata: Record<string, JsonValue>;
  sourceUpdatedAt: string | null;
  capturedAt: string;
  contentSha256: string;
}

export class InboxRevision implements Entity<string, InboxRevisionDescription> {
  constructor(
    private readonly id: string,
    private readonly desc: InboxRevisionDescription,
  ) {}

  identity(): string {
    return this.id;
  }

  description(): InboxRevisionDescription {
    return this.desc;
  }
}

export interface InboxListQuery {
  page: number;
  pageSize: number;
  status?: InboxItemStatus;
  sourceKind?: string;
  query?: string;
}

export interface CapturedInboxItem {
  item: InboxItem;
  revision: InboxRevision;
  revisionCreated: boolean;
}

export interface WorkspaceInbox extends HasMany<InboxItem> {
  list(query: InboxListQuery): Promise<[InboxItem[], number]>;
  capture(source: InboxSourceInput): Promise<CapturedInboxItem>;
  appendRevision(
    itemId: string,
    source: InboxSourceInput,
    expectedLatestRevisionSha256?: string,
  ): Promise<CapturedInboxItem>;
  changeStatus(
    itemId: string,
    status: InboxItemStatus,
    expectedVersion: number,
  ): Promise<InboxItem>;
  listRevisions(
    itemId: string,
    page: number,
    pageSize: number,
  ): Promise<[InboxRevision[], number]>;
  findRevision(
    itemId: string,
    revisionId: string,
  ): Promise<InboxRevision | null>;
}
