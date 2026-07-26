import { describe, expect, it } from 'vitest';
import { DomainError } from '../error';
import {
  assertInboxVersion,
  normalizeInboxSource,
  parseInboxContentType,
  parseInboxItemStatus,
} from './validation';

describe('Inbox source validation', () => {
  it('normalizes a provider-neutral source', () => {
    expect(
      normalizeInboxSource({
        sourceKind: ' manual_text ',
        externalKey: ' capture-1 ',
        title: ' A requirement ',
        body: 'First line\r\nSecond line\r',
        contentType: 'text/markdown',
        uri: 'https://example.test/issues/1',
        providerMetadata: { labels: ['feature'], number: 1 },
        sourceUpdatedAt: '2026-01-01T10:00:00+08:00',
      }),
    ).toEqual({
      sourceKind: 'manual_text',
      externalKey: 'capture-1',
      title: 'A requirement',
      body: 'First line\nSecond line\n',
      contentType: 'text/markdown',
      uri: 'https://example.test/issues/1',
      providerMetadata: { labels: ['feature'], number: 1 },
      sourceUpdatedAt: '2026-01-01T02:00:00.000Z',
    });
  });

  it.each([
    {
      sourceKind: 'Manual Text',
      externalKey: 'capture-1',
      title: 'Requirement',
      body: 'Body',
      contentType: 'text/plain' as const,
    },
    {
      sourceKind: 'manual_text',
      externalKey: 'capture-1',
      title: 'Requirement\ncontinued',
      body: 'Body',
      contentType: 'text/plain' as const,
    },
    {
      sourceKind: 'manual_text',
      externalKey: 'capture-1',
      title: 'Requirement',
      body: ' ',
      contentType: 'text/plain' as const,
    },
  ])('rejects an invalid source %#', (source) => {
    expect(() => normalizeInboxSource(source)).toThrow(DomainError);
  });

  it('accepts at most one MiB of normalized source content', () => {
    expect(() =>
      normalizeInboxSource({
        sourceKind: 'local_markdown',
        externalKey: 'requirements/large.md',
        title: 'Large requirement',
        body: 'a'.repeat(1024 * 1024),
        contentType: 'text/markdown',
      }),
    ).not.toThrow();
    expect(() =>
      normalizeInboxSource({
        sourceKind: 'local_markdown',
        externalKey: 'requirements/too-large.md',
        title: 'Too large',
        body: 'a'.repeat(1024 * 1024 + 1),
        contentType: 'text/markdown',
      }),
    ).toThrow('1048576 bytes');
  });

  it('rejects local file paths as source URIs', () => {
    expect(() =>
      normalizeInboxSource({
        sourceKind: 'local_markdown',
        externalKey: 'capture-1',
        title: 'Requirement',
        body: 'Body',
        contentType: 'text/markdown',
        uri: 'file:///Users/example/requirement.md',
      }),
    ).toThrow('absolute HTTP(S) URL');
  });
});

describe('Inbox value parsing', () => {
  it.each(['active', 'deferred', 'closed'] as const)(
    'accepts status %s',
    (status) => expect(parseInboxItemStatus(status)).toBe(status),
  );

  it('rejects unsupported statuses and content types', () => {
    expect(() => parseInboxItemStatus('deleted')).toThrow(DomainError);
    expect(() => parseInboxContentType('text/html')).toThrow(DomainError);
  });

  it('requires a positive expected version', () => {
    expect(assertInboxVersion(2)).toBe(2);
    expect(() => assertInboxVersion(0)).toThrow(DomainError);
  });
});
