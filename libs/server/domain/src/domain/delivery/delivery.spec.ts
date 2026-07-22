import { describe, expect, it } from 'vitest';
import { DomainError } from '../error';
import {
  assertStoryCandidateVersion,
  normalizeStoryCandidateInput,
  parseStoryCandidateStatus,
  parseStoryCognitiveMode,
} from './validation';

const hash = `sha256:${'a'.repeat(64)}`;

function candidateInput() {
  return {
    title: ' Local coding agent ',
    problem: ' Sources are reviewed remotely.\r\nLocal execution is separate. ',
    role: ' Workspace maintainer ',
    goal: 'Run coding work in an isolated repository.',
    value: 'Source code and credentials stay local.',
    cognitiveMode: 'complicated' as const,
    citations: [
      {
        inboxItemId: ' inbox-1 ',
        inboxRevisionId: ' revision-1 ',
        contentSha256: hash.toUpperCase(),
        locator: ' whole-source ',
      },
    ],
  };
}

describe('Story Candidate validation', () => {
  it('normalizes one source-cited candidate without granting authority', () => {
    expect(normalizeStoryCandidateInput(candidateInput())).toEqual({
      title: 'Local coding agent',
      problem: 'Sources are reviewed remotely.\nLocal execution is separate.',
      role: 'Workspace maintainer',
      goal: 'Run coding work in an isolated repository.',
      value: 'Source code and credentials stay local.',
      cognitiveMode: 'complicated',
      citations: [
        {
          inboxItemId: 'inbox-1',
          inboxRevisionId: 'revision-1',
          contentSha256: hash,
          locator: 'whole-source',
        },
      ],
    });
  });

  it.each([
    { field: 'title', value: 'line one\nline two' },
    { field: 'problem', value: ' ' },
    { field: 'role', value: ' ' },
    { field: 'goal', value: ' ' },
    { field: 'value', value: ' ' },
    { field: 'citations', value: [] },
  ])('rejects invalid $field', ({ field, value }) => {
    expect(() =>
      normalizeStoryCandidateInput({
        ...candidateInput(),
        [field]: value,
      }),
    ).toThrow(DomainError);
  });

  it('rejects malformed and duplicate citations', () => {
    expect(() =>
      normalizeStoryCandidateInput({
        ...candidateInput(),
        citations: [
          ...candidateInput().citations,
          ...candidateInput().citations,
        ],
      }),
    ).toThrow('duplicate citations');
    expect(() =>
      normalizeStoryCandidateInput({
        ...candidateInput(),
        citations: [
          { ...candidateInput().citations[0], contentSha256: 'sha256:bad' },
        ],
      }),
    ).toThrow('SHA-256 is invalid');
  });

  it('parses only supported modes, statuses, and positive versions', () => {
    expect(parseStoryCognitiveMode('clear')).toBe('clear');
    expect(parseStoryCandidateStatus('pending')).toBe('pending');
    expect(assertStoryCandidateVersion(1)).toBe(1);
    expect(() => parseStoryCognitiveMode('chaotic')).toThrow(DomainError);
    expect(() => parseStoryCandidateStatus('accepted')).toThrow(DomainError);
    expect(() => assertStoryCandidateVersion(0)).toThrow(DomainError);
  });
});
