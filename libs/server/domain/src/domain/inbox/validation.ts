import { DomainError } from '../error';
import type {
  InboxContentType,
  InboxItemStatus,
  InboxSourceInput,
  JsonValue,
} from './inbox';

const SOURCE_KIND_PATTERN = /^[a-z][a-z0-9_]*$/;
const MAX_TITLE_LENGTH = 200;
const MAX_EXTERNAL_KEY_LENGTH = 256;
const MAX_BODY_BYTES = 256 * 1024;
const MAX_METADATA_BYTES = 16 * 1024;

export function normalizeInboxSource(source: InboxSourceInput): Required<
  Pick<
    InboxSourceInput,
    'sourceKind' | 'externalKey' | 'title' | 'body' | 'contentType'
  >
> & {
  uri: string | null;
  providerMetadata: Record<string, JsonValue>;
  sourceUpdatedAt: string | null;
} {
  const sourceKind = singleLine(source.sourceKind, 'source kind');
  if (!SOURCE_KIND_PATTERN.test(sourceKind)) {
    throw DomainError.validation(
      `unsupported Inbox source kind: ${sourceKind}`,
    );
  }
  const externalKey = limited(
    singleLine(source.externalKey, 'external key'),
    MAX_EXTERNAL_KEY_LENGTH,
    'external key',
  );
  const title = limited(
    singleLine(source.title, 'title'),
    MAX_TITLE_LENGTH,
    'title',
  );
  const body = normalizeBody(source.body);
  const contentType = parseInboxContentType(source.contentType);
  const uri = normalizeUri(source.uri);
  const providerMetadata = normalizeMetadata(source.providerMetadata);
  const sourceUpdatedAt = normalizeTimestamp(
    source.sourceUpdatedAt,
    'source updated timestamp',
  );

  return {
    sourceKind,
    externalKey,
    title,
    body,
    contentType,
    uri,
    providerMetadata,
    sourceUpdatedAt,
  };
}

export function parseInboxItemStatus(value: string): InboxItemStatus {
  if (value === 'active' || value === 'deferred' || value === 'closed') {
    return value;
  }
  throw DomainError.validation(`unsupported Inbox status: ${value}`);
}

export function parseInboxContentType(value: string): InboxContentType {
  if (value === 'text/plain' || value === 'text/markdown') {
    return value;
  }
  throw DomainError.validation(`unsupported Inbox content type: ${value}`);
}

export function assertInboxVersion(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw DomainError.validation('Inbox expected version must be positive');
  }
  return value;
}

function normalizeBody(value: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw DomainError.validation('Inbox body must not be empty');
  }
  const normalized = value.replace(/\r\n?/g, '\n');
  if (byteLength(normalized) > MAX_BODY_BYTES) {
    throw DomainError.validation(
      `Inbox body must not exceed ${String(MAX_BODY_BYTES)} bytes`,
    );
  }
  return normalized;
}

function normalizeUri(value: string | null | undefined): string | null {
  if (value === undefined || value === null || value.trim().length === 0) {
    return null;
  }
  let uri: URL;
  try {
    uri = new URL(value);
  } catch {
    throw DomainError.validation('Inbox URI must be an absolute HTTP(S) URL');
  }
  if (!['http:', 'https:'].includes(uri.protocol)) {
    throw DomainError.validation('Inbox URI must be an absolute HTTP(S) URL');
  }
  return uri.toString();
}

function normalizeTimestamp(
  value: string | null | undefined,
  label: string,
): string | null {
  if (value === undefined || value === null || value.trim().length === 0) {
    return null;
  }
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    throw DomainError.validation(
      `Inbox ${label} must be an ISO 8601 timestamp`,
    );
  }
  return timestamp.toISOString();
}

function normalizeMetadata(
  value: Record<string, JsonValue> | null | undefined,
): Record<string, JsonValue> {
  const normalized = jsonObject(value ?? {}, 'provider metadata');
  if (byteLength(JSON.stringify(normalized)) > MAX_METADATA_BYTES) {
    throw DomainError.validation(
      `Inbox provider metadata must not exceed ${String(MAX_METADATA_BYTES)} bytes`,
    );
  }
  return normalized;
}

function jsonObject(
  value: Record<string, JsonValue>,
  label: string,
): Record<string, JsonValue> {
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, jsonValue(entry, `${label}.${key}`)]),
  );
}

function jsonValue(value: JsonValue, label: string): JsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry, index) => jsonValue(entry, `${label}[${index}]`));
  }
  if (typeof value === 'object') {
    return jsonObject(value, label);
  }
  throw DomainError.validation(`Inbox ${label} must contain only JSON values`);
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function singleLine(value: string, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw DomainError.validation(`Inbox ${label} must not be empty`);
  }
  const normalized = value.trim();
  if (/[\r\n]/.test(normalized)) {
    throw DomainError.validation(`Inbox ${label} must be a single line`);
  }
  return normalized;
}

function limited(value: string, maximum: number, label: string): string {
  if (value.length > maximum) {
    throw DomainError.validation(
      `Inbox ${label} must not exceed ${String(maximum)} characters`,
    );
  }
  return value;
}
