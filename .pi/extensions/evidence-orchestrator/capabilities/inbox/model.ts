export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type InboxItemStatus = 'active' | 'deferred' | 'closed';

export interface CapturedInboxSource {
  source_kind: string;
  external_key: string;
  title: string;
  body: string;
  uri?: string;
  content_type?: 'text/markdown' | 'text/plain';
  provider_metadata?: Record<string, JsonValue>;
  source_updated_at?: string;
}

export interface InboxSourceRevision {
  version: 1;
  inbox_id: string;
  source_kind: string;
  external_key: string;
  title: string;
  body: string;
  uri?: string;
  content_type: 'text/markdown' | 'text/plain';
  provider_metadata: Record<string, JsonValue>;
  source_updated_at?: string;
  captured_at: string;
  content_sha256: string;
  artifact_path: string;
}

export interface InboxItem {
  version: 1;
  inbox_id: string;
  source_kind: string;
  external_key: string;
  title: string;
  latest_revision_sha256: string;
  revision_paths: string[];
  status: InboxItemStatus;
  created_at: string;
  updated_at: string;
}

export interface InboxState {
  version: 1;
  next_item_number: number;
  items: InboxItem[];
}

export type InboxCandidateStatus =
  | 'ready'
  | 'stale'
  | 'selected'
  | 'deferred'
  | 'rejected';
export type InboxCandidateDecisionAction = 'deferred' | 'rejected';
export type InboxCognitiveMode = 'clear' | 'complicated' | 'complex';

export interface InboxStoryCitation {
  inbox_id: string;
  revision_sha256: string;
  locator: string;
}

export interface InboxStoryCandidate {
  version: 1;
  candidate_id: string;
  title: string;
  problem: string;
  role: string;
  goal: string;
  value: string;
  cognitive_mode: InboxCognitiveMode;
  citations: InboxStoryCitation[];
  proposed_by: 'inbox-analyst';
  proposed_at: string;
  artifact_path: string;
  content_sha256: string;
}

export interface InboxCandidateDecision {
  version: 1;
  decision_id: string;
  candidate_id: string;
  action: InboxCandidateDecisionAction;
  reason: string;
  decided_by: 'human';
  decided_at: string;
  content_sha256: string;
}

export interface CapturedInboxItem {
  state: InboxState;
  item: InboxItem;
  revision: InboxSourceRevision;
  created: boolean;
  revision_created: boolean;
}
