import { createHash } from 'node:crypto';
import {
  normalizeInboxSource,
  type InboxSourceInput,
  type JsonValue,
} from '@evidence/server-domain';

export type NormalizedInboxSource = ReturnType<typeof normalizeInboxSource>;

export interface HashedInboxSource {
  source: NormalizedInboxSource;
  contentSha256: string;
}

export function hashInboxSource(input: InboxSourceInput): HashedInboxSource {
  const source = normalizeInboxSource(input);
  const payload = canonicalJson({
    sourceKind: source.sourceKind,
    externalKey: source.externalKey,
    title: source.title,
    body: source.body,
    contentType: source.contentType,
    uri: source.uri,
    providerMetadata: source.providerMetadata,
    sourceUpdatedAt: source.sourceUpdatedAt,
  });
  return {
    source,
    contentSha256: `sha256:${createHash('sha256').update(payload).digest('hex')}`,
  };
}

function canonicalJson(value: JsonValue): string {
  return JSON.stringify(normalize(value));
}

function normalize(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map(normalize);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, normalize(entry)]),
    );
  }
  return value;
}
