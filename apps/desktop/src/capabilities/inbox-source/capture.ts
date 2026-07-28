export interface InboxSourceCapture {
  sourceKind: 'manual_text' | 'local_markdown' | 'github_issue';
  externalKey: string;
  title: string;
  body: string;
  contentType: 'text/plain' | 'text/markdown';
  uri: string | null;
  providerMetadata: Record<
    string,
    null | boolean | number | string | Array<string>
  >;
  sourceUpdatedAt: string | null;
}
