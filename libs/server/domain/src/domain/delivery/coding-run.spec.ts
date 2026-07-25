import { describe, expect, it } from 'vitest';
import { DomainError } from '../error';
import { assertCodingRunTransition, isActiveCodingRun } from './coding-run';
import {
  assertCodingRunVersion,
  normalizeCodingRunAcceptanceInput,
  normalizeCodingRunFailureInput,
  normalizeCodingRunRejectionReason,
  normalizeCodingRunReviewInput,
  normalizeStartCodingRunInput,
  parseCodingRunStatus,
} from './coding-run-validation';

const commit = 'a'.repeat(40);
const diffHash = `sha256:${'b'.repeat(64)}`;

describe('Coding Run lifecycle', () => {
  it.each([
    ['running', 'review_required'],
    ['running', 'failed'],
    ['running', 'cancelled'],
    ['review_required', 'accepted'],
    ['review_required', 'rejected'],
  ] as const)('allows %s to transition to %s', (from, to) => {
    expect(() => assertCodingRunTransition(from, to)).not.toThrow();
  });

  it.each([
    ['running', 'accepted'],
    ['review_required', 'failed'],
    ['accepted', 'rejected'],
    ['failed', 'running'],
  ] as const)('rejects %s to %s', (from, to) => {
    expect(() => assertCodingRunTransition(from, to)).toThrow(DomainError);
  });

  it('identifies only mutable runs as active', () => {
    expect(isActiveCodingRun('running')).toBe(true);
    expect(isActiveCodingRun('review_required')).toBe(true);
    expect(isActiveCodingRun('accepted')).toBe(false);
  });
});

describe('Coding Run validation', () => {
  it('normalizes bounded execution facts without local paths or source', () => {
    expect(
      normalizeStartCodingRunInput({
        storyRevisionId: ' revision-2 ',
        baseCommitSha: commit.toUpperCase(),
      }),
    ).toEqual({ storyRevisionId: 'revision-2', baseCommitSha: commit });

    expect(
      normalizeCodingRunReviewInput({
        diffSha256: diffHash.toUpperCase(),
        changedFileCount: 3,
        qualityChecks: [
          {
            name: ' pnpm test ',
            status: 'passed',
            durationMs: 1250,
            summary: ' 42 tests passed. ',
          },
        ],
      }),
    ).toEqual({
      diffSha256: diffHash,
      changedFileCount: 3,
      qualityChecks: [
        {
          name: 'pnpm test',
          status: 'passed',
          durationMs: 1250,
          summary: '42 tests passed.',
        },
      ],
    });
  });

  it('normalizes terminal decision facts', () => {
    expect(
      normalizeCodingRunAcceptanceInput({
        diffSha256: diffHash,
        commitSha: commit,
      }),
    ).toEqual({ diffSha256: diffHash, commitSha: commit });
    expect(
      normalizeCodingRunFailureInput({
        code: ' Quality-Gate ',
        summary: ' Tests failed. ',
      }),
    ).toEqual({ code: 'quality-gate', summary: 'Tests failed.' });
    expect(
      normalizeCodingRunRejectionReason(' Not the expected behavior. '),
    ).toBe('Not the expected behavior.');
  });

  it('rejects unbounded or malformed execution facts', () => {
    expect(() =>
      normalizeStartCodingRunInput({
        storyRevisionId: 'revision-2',
        baseCommitSha: '/Users/me/repository',
      }),
    ).toThrow('base commit SHA is invalid');
    expect(() =>
      normalizeCodingRunReviewInput({
        diffSha256: 'sha256:bad',
        changedFileCount: 1,
        qualityChecks: [
          {
            name: 'pnpm test',
            status: 'passed',
            durationMs: 1,
            summary: null,
          },
        ],
      }),
    ).toThrow('diff SHA-256 is invalid');
    expect(() =>
      normalizeCodingRunReviewInput({
        diffSha256: diffHash,
        changedFileCount: 10_001,
        qualityChecks: [],
      }),
    ).toThrow('changed file count');
    expect(() =>
      normalizeCodingRunFailureInput({ code: '../secret', summary: 'failed' }),
    ).toThrow('failure code is invalid');
  });

  it.each([
    {
      changedFileCount: 0,
      qualityChecks: [
        {
          name: 'pnpm test',
          status: 'passed' as const,
          durationMs: 1,
          summary: null,
        },
      ],
      expected: 'changed file count',
    },
    {
      changedFileCount: 1,
      qualityChecks: [],
      expected: 'at least one passed quality check',
    },
    {
      changedFileCount: 1,
      qualityChecks: [
        {
          name: 'pnpm test',
          status: 'failed' as const,
          durationMs: 1,
          summary: 'failed',
        },
      ],
      expected: 'failed quality check',
    },
  ])(
    'rejects review evidence without successful changes: $expected',
    ({ changedFileCount, qualityChecks, expected }) => {
      expect(() =>
        normalizeCodingRunReviewInput({
          diffSha256: diffHash,
          changedFileCount,
          qualityChecks,
        }),
      ).toThrow(expected);
    },
  );

  it('parses statuses and positive versions', () => {
    expect(parseCodingRunStatus('review_required')).toBe('review_required');
    expect(assertCodingRunVersion(1)).toBe(1);
    expect(() => parseCodingRunStatus('queued')).toThrow(DomainError);
    expect(() => assertCodingRunVersion(0)).toThrow(DomainError);
  });
});
