import { describe, expect, it } from 'vitest';
import { DomainError } from '../error';
import {
  assertInboxExtractionVersion,
  normalizeCreateInboxExtractionInput,
  normalizeInboxCandidateDecisionReason,
  normalizeInboxCandidateSet,
  normalizeInboxStoryCandidateInput,
  parseInboxCandidateDecisionAction,
  parseInboxCandidateStatus,
} from './extraction-validation';

const revisionSha256 = `sha256:${'a'.repeat(64)}`;

function candidate(inboxItemId = 'INBOX-0001') {
  return {
    title: ' Isolated coding ',
    problem: ' Local execution needs a trusted intake. ',
    role: ' Workspace maintainer ',
    goal: 'Start work from one frozen candidate.',
    value: 'The implementation remains traceable.',
    cognitiveMode: 'complicated' as const,
    citations: [
      {
        inboxItemId,
        revisionSha256: revisionSha256.toUpperCase(),
        locator: ' whole-source ',
      },
    ],
  };
}

describe('Inbox Extraction validation', () => {
  it('preserves one to five explicit unique source ids in order', () => {
    expect(
      normalizeCreateInboxExtractionInput({
        inboxItemIds: [' INBOX-0002 ', 'INBOX-0001'],
      }),
    ).toEqual({ inboxItemIds: ['INBOX-0002', 'INBOX-0001'] });
  });

  it.each([[[]], [Array.from({ length: 6 }, (_, index) => `INBOX-${index}`)]])(
    'rejects an extraction outside the source budget',
    (inboxItemIds) => {
      expect(() =>
        normalizeCreateInboxExtractionInput({ inboxItemIds }),
      ).toThrow('1 to 5');
    },
  );

  it('rejects duplicate source authority', () => {
    expect(() =>
      normalizeCreateInboxExtractionInput({
        inboxItemIds: ['INBOX-0001', 'INBOX-0001'],
      }),
    ).toThrow('duplicate');
  });
});

describe('Inbox Candidate validation', () => {
  it('normalizes a non-authoritative exact-revision candidate', () => {
    expect(normalizeInboxStoryCandidateInput(candidate())).toEqual({
      title: 'Isolated coding',
      problem: 'Local execution needs a trusted intake.',
      role: 'Workspace maintainer',
      goal: 'Start work from one frozen candidate.',
      value: 'The implementation remains traceable.',
      cognitiveMode: 'complicated',
      citations: [
        {
          inboxItemId: 'INBOX-0001',
          revisionSha256,
          locator: 'whole-source',
        },
      ],
    });
  });

  it('requires the proposed set to cover every selected source', () => {
    expect(
      normalizeInboxCandidateSet(
        [candidate('INBOX-0001'), candidate('INBOX-0002')],
        ['INBOX-0001', 'INBOX-0002'],
      ),
    ).toHaveLength(2);
    expect(() =>
      normalizeInboxCandidateSet(
        [candidate('INBOX-0001')],
        ['INBOX-0001', 'INBOX-0002'],
      ),
    ).toThrow('must cite selected source INBOX-0002');
  });

  it('rejects citations outside the human-selected extraction', () => {
    expect(() =>
      normalizeInboxCandidateSet([candidate('INBOX-0002')], ['INBOX-0001']),
    ).toThrow('unselected source INBOX-0002');
  });

  it.each([[[]], [Array.from({ length: 6 }, () => candidate())]])(
    'enforces the one-to-five candidate budget',
    (candidates) => {
      expect(() =>
        normalizeInboxCandidateSet(candidates, ['INBOX-0001']),
      ).toThrow('1 to 5');
    },
  );

  it('rejects malformed and duplicate citations', () => {
    expect(() =>
      normalizeInboxStoryCandidateInput({
        ...candidate(),
        citations: [candidate().citations[0], candidate().citations[0]],
      }),
    ).toThrow('duplicate citations');
    expect(() =>
      normalizeInboxStoryCandidateInput({
        ...candidate(),
        citations: [{ ...candidate().citations[0], revisionSha256: 'bad' }],
      }),
    ).toThrow('SHA-256');
  });

  it('only accepts workflow statuses and human terminal decisions', () => {
    expect(parseInboxCandidateStatus('ready')).toBe('ready');
    expect(parseInboxCandidateStatus('stale')).toBe('stale');
    expect(parseInboxCandidateDecisionAction('defer')).toBe('defer');
    expect(normalizeInboxCandidateDecisionReason(' Not now. ')).toBe(
      'Not now.',
    );
    expect(assertInboxExtractionVersion(1)).toBe(1);
    expect(() => parseInboxCandidateStatus('confirmed')).toThrow(DomainError);
    expect(() => parseInboxCandidateDecisionAction('confirm')).toThrow(
      DomainError,
    );
    expect(() => normalizeInboxCandidateDecisionReason(' ')).toThrow(
      DomainError,
    );
    expect(() => assertInboxExtractionVersion(0)).toThrow(DomainError);
  });
});
