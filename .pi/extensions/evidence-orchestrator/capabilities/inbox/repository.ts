import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import type {
  CapturedInboxItem,
  CapturedInboxSource,
  InboxItem,
  InboxSourceRevision,
  InboxState,
  JsonValue,
} from './model';

export const INBOX_ROOT = 'artifacts/inbox';
export const INBOX_STATE_PATH = `${INBOX_ROOT}/state.json`;
export const INBOX_ID_PATTERN = /^INBOX-\d{4,}$/;
const SOURCE_KIND_PATTERN = /^[a-z][a-z0-9_]*$/;
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;

const EMPTY_INBOX_STATE: InboxState = {
  version: 1,
  next_item_number: 1,
  items: [],
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function text(value: unknown, name: string, singleLine = false): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Inbox ${name} must not be empty.`);
  }
  const normalized = value.trim();
  if (singleLine && /[\r\n]/.test(normalized)) {
    throw new Error(`Inbox ${name} must be a single line.`);
  }
  return normalized;
}

function normalizeBody(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('Inbox source body must not be empty.');
  }
  return value.replace(/\r\n?/g, '\n');
}

function jsonValue(value: unknown, name: string): JsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry, index) => jsonValue(entry, `${name}[${index}]`));
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, jsonValue(entry, `${name}.${key}`)]),
    );
  }
  throw new Error(`Inbox ${name} must contain only JSON values.`);
}

function metadata(
  value: CapturedInboxSource['provider_metadata'],
): Record<string, JsonValue> {
  return (jsonValue(value ?? {}, 'provider metadata') ?? {}) as Record<
    string,
    JsonValue
  >;
}

function canonicalJson(value: unknown): string {
  const normalize = (entry: unknown): unknown => {
    if (Array.isArray(entry)) return entry.map(normalize);
    if (entry && typeof entry === 'object') {
      return Object.fromEntries(
        Object.entries(entry)
          .filter(([, child]) => child !== undefined)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, child]) => [key, normalize(child)]),
      );
    }
    return entry;
  };
  return JSON.stringify(normalize(value));
}

function revisionHash(
  revision: Pick<
    InboxSourceRevision,
    | 'source_kind'
    | 'external_key'
    | 'title'
    | 'body'
    | 'content_type'
    | 'provider_metadata'
  > &
    Pick<InboxSourceRevision, 'uri' | 'source_updated_at'>,
): string {
  const payload = {
    source_kind: revision.source_kind,
    external_key: revision.external_key,
    title: revision.title,
    body: revision.body,
    ...(revision.uri ? { uri: revision.uri } : {}),
    content_type: revision.content_type,
    provider_metadata: revision.provider_metadata,
    ...(revision.source_updated_at
      ? { source_updated_at: revision.source_updated_at }
      : {}),
  };
  return `sha256:${createHash('sha256')
    .update(canonicalJson(payload))
    .digest('hex')}`;
}

function revisionPath(inboxId: string, contentSha256: string): string {
  return `${INBOX_ROOT}/items/${inboxId}/revisions/${contentSha256.slice('sha256:'.length)}.json`;
}

function parseJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as unknown;
  } catch {
    throw new Error(`Inbox JSON is invalid: ${path}.`);
  }
}

function assertItem(item: InboxItem): void {
  if (
    item.version !== 1 ||
    !INBOX_ID_PATTERN.test(item.inbox_id) ||
    !SOURCE_KIND_PATTERN.test(item.source_kind) ||
    !item.external_key?.trim() ||
    !item.title?.trim() ||
    !SHA256_PATTERN.test(item.latest_revision_sha256) ||
    !Array.isArray(item.revision_paths) ||
    item.revision_paths.length === 0 ||
    new Set(item.revision_paths).size !== item.revision_paths.length ||
    !['active', 'deferred', 'closed'].includes(item.status) ||
    !item.created_at?.trim() ||
    !item.updated_at?.trim()
  ) {
    throw new Error(`Inbox item is invalid: ${item.inbox_id || 'unknown'}.`);
  }
}

function normalizeState(value: unknown): InboxState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Inbox state must be an object.');
  }
  const state = clone(value) as InboxState;
  if (
    state.version !== 1 ||
    !Number.isSafeInteger(state.next_item_number) ||
    state.next_item_number <= 0 ||
    !Array.isArray(state.items)
  ) {
    throw new Error('Inbox state is invalid.');
  }
  state.items.forEach(assertItem);
  if (
    new Set(state.items.map(({ inbox_id }) => inbox_id)).size !==
    state.items.length
  ) {
    throw new Error('Inbox item ids must be unique.');
  }
  if (
    new Set(
      state.items.map(
        ({ source_kind, external_key }) =>
          `${source_kind}\u0000${external_key}`,
      ),
    ).size !== state.items.length
  ) {
    throw new Error(
      'Inbox source keys must be unique within each source kind.',
    );
  }
  const allocated = state.items.map(({ inbox_id }) =>
    Number(inbox_id.slice('INBOX-'.length)),
  );
  if (state.next_item_number <= Math.max(0, ...allocated)) {
    throw new Error('Inbox next item number is not ahead of allocated ids.');
  }
  return state;
}

export function inboxStatePath(cwd: string): string {
  return join(cwd, INBOX_STATE_PATH);
}

export function readInboxState(cwd: string): InboxState {
  const path = inboxStatePath(cwd);
  return existsSync(path)
    ? normalizeState(parseJson(path))
    : clone(EMPTY_INBOX_STATE);
}

function writeInboxState(cwd: string, state: InboxState): InboxState {
  const normalized = normalizeState(state);
  const path = inboxStatePath(cwd);
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  writeFileSync(temporary, `${JSON.stringify(normalized, null, 2)}\n`);
  renameSync(temporary, path);
  return normalized;
}

function readRevision(cwd: string, path: string): InboxSourceRevision {
  const revision = parseJson(join(cwd, path)) as InboxSourceRevision;
  if (
    revision.version !== 1 ||
    !INBOX_ID_PATTERN.test(revision.inbox_id) ||
    !SOURCE_KIND_PATTERN.test(revision.source_kind) ||
    !revision.external_key?.trim() ||
    !revision.title?.trim() ||
    !revision.body?.trim() ||
    !['text/markdown', 'text/plain'].includes(revision.content_type) ||
    !revision.provider_metadata ||
    typeof revision.provider_metadata !== 'object' ||
    Array.isArray(revision.provider_metadata) ||
    !revision.captured_at?.trim() ||
    !SHA256_PATTERN.test(revision.content_sha256) ||
    revision.artifact_path !== path
  ) {
    throw new Error(`Inbox source revision is invalid: ${path}.`);
  }
  const calculated = revisionHash(revision);
  if (calculated !== revision.content_sha256) {
    throw new Error(`Inbox source revision hash is inconsistent: ${path}.`);
  }
  return revision;
}

function normalizedCapture(input: CapturedInboxSource) {
  const sourceKind = text(input.source_kind, 'source kind', true);
  if (!SOURCE_KIND_PATTERN.test(sourceKind)) {
    throw new Error(`Unsupported Inbox source kind: ${sourceKind}.`);
  }
  const contentType = input.content_type ?? 'text/markdown';
  if (!['text/markdown', 'text/plain'].includes(contentType)) {
    throw new Error(`Unsupported Inbox content type: ${contentType}.`);
  }
  return {
    source_kind: sourceKind,
    external_key: text(input.external_key, 'external key', true),
    title: text(input.title, 'source title', true),
    body: normalizeBody(input.body),
    ...(input.uri ? { uri: text(input.uri, 'source URI', true) } : {}),
    content_type: contentType,
    provider_metadata: metadata(input.provider_metadata),
    ...(input.source_updated_at
      ? {
          source_updated_at: text(
            input.source_updated_at,
            'source updated timestamp',
            true,
          ),
        }
      : {}),
  } as const;
}

/** Capture one provider-neutral source revision and deduplicate it by source key and content hash. */
export function captureInboxSource(
  cwd: string,
  input: CapturedInboxSource,
  now = new Date().toISOString(),
): CapturedInboxItem {
  const captured = normalizedCapture(input);
  const current = readInboxState(cwd);
  const existing = current.items.find(
    ({ source_kind, external_key }) =>
      source_kind === captured.source_kind &&
      external_key === captured.external_key,
  );
  const inboxId =
    existing?.inbox_id ??
    `INBOX-${String(current.next_item_number).padStart(4, '0')}`;
  const contentSha256 = revisionHash(captured);
  const artifactPath = revisionPath(inboxId, contentSha256);
  const revision: InboxSourceRevision = {
    version: 1,
    inbox_id: inboxId,
    ...captured,
    captured_at: now,
    content_sha256: contentSha256,
    artifact_path: artifactPath,
  };

  if (existing?.latest_revision_sha256 === contentSha256) {
    return {
      state: current,
      item: existing,
      revision: readRevision(cwd, existing.revision_paths.at(-1) ?? ''),
      created: false,
      revision_created: false,
    };
  }

  const absoluteRevisionPath = join(cwd, artifactPath);
  mkdirSync(dirname(absoluteRevisionPath), { recursive: true });
  if (existsSync(absoluteRevisionPath)) {
    const persisted = readRevision(cwd, artifactPath);
    if (persisted.content_sha256 !== contentSha256) {
      throw new Error(`Inbox revision path collision: ${artifactPath}.`);
    }
  } else {
    writeFileSync(
      absoluteRevisionPath,
      `${JSON.stringify(revision, null, 2)}\n`,
    );
  }

  const item: InboxItem = existing
    ? {
        ...existing,
        title: captured.title,
        latest_revision_sha256: contentSha256,
        revision_paths: [...existing.revision_paths, artifactPath],
        updated_at: now,
      }
    : {
        version: 1,
        inbox_id: inboxId,
        source_kind: captured.source_kind,
        external_key: captured.external_key,
        title: captured.title,
        latest_revision_sha256: contentSha256,
        revision_paths: [artifactPath],
        status: 'active',
        created_at: now,
        updated_at: now,
      };
  const state = writeInboxState(cwd, {
    ...current,
    next_item_number: existing
      ? current.next_item_number
      : current.next_item_number + 1,
    items: existing
      ? current.items.map((entry) =>
          entry.inbox_id === inboxId ? item : entry,
        )
      : [...current.items, item],
  });
  return {
    state,
    item,
    revision,
    created: !existing,
    revision_created: true,
  };
}

export function latestInboxRevision(
  cwd: string,
  inboxId: string,
): InboxSourceRevision {
  const item = readInboxState(cwd).items.find(
    ({ inbox_id }) => inbox_id === inboxId,
  );
  if (!item) throw new Error(`Inbox item does not exist: ${inboxId}.`);
  return readRevision(cwd, item.revision_paths.at(-1) ?? '');
}

/** Offline validation; it never contacts the original provider. */
export function validateInboxRepository(cwd: string): void {
  const path = inboxStatePath(cwd);
  if (!existsSync(path)) return;
  const state = readInboxState(cwd);
  for (const item of state.items) {
    const revisions = item.revision_paths.map((revision) =>
      readRevision(cwd, revision),
    );
    if (
      revisions.some(
        (revision) =>
          revision.inbox_id !== item.inbox_id ||
          revision.source_kind !== item.source_kind ||
          revision.external_key !== item.external_key,
      ) ||
      revisions.at(-1)?.content_sha256 !== item.latest_revision_sha256
    ) {
      throw new Error(
        `Inbox item and source revisions are inconsistent: ${item.inbox_id}.`,
      );
    }
  }
}
