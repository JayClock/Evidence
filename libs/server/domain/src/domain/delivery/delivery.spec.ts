import { describe, expect, it } from 'vitest';
import { DomainError } from '../error';
import {
  assertStoryVersion,
  normalizeStoryContentInput,
  normalizeStoryRevisionInput,
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

function revisionInput() {
  return {
    ...candidateInput(),
    scenarios: [
      {
        title: ' Isolate the coding worktree ',
        given: [
          ' The Workspace is bound to a Git repository.\r\nThe repository is accessible. ',
        ],
        when: ' The user starts a Coding Run. ',
        then: [
          ' A dedicated branch and worktree are created. ',
          ' The primary working tree is unchanged. ',
        ],
      },
    ],
  };
}

describe('Story content validation', () => {
  it('normalizes source-cited Story content', () => {
    expect(normalizeStoryContentInput(candidateInput())).toEqual({
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
      normalizeStoryContentInput({
        ...candidateInput(),
        [field]: value,
      }),
    ).toThrow(DomainError);
  });

  it('rejects malformed and duplicate citations', () => {
    expect(() =>
      normalizeStoryContentInput({
        ...candidateInput(),
        citations: [
          ...candidateInput().citations,
          ...candidateInput().citations,
        ],
      }),
    ).toThrow('duplicate citations');
    expect(() =>
      normalizeStoryContentInput({
        ...candidateInput(),
        citations: [
          { ...candidateInput().citations[0], contentSha256: 'sha256:bad' },
        ],
      }),
    ).toThrow('SHA-256 is invalid');
  });

  it('parses only supported cognitive modes', () => {
    expect(parseStoryCognitiveMode('clear')).toBe('clear');
    expect(() => parseStoryCognitiveMode('chaotic')).toThrow(DomainError);
  });
});

describe('Story Revision validation', () => {
  it('normalizes one complete ordered Scenario Set', () => {
    expect(normalizeStoryRevisionInput(revisionInput())).toMatchObject({
      title: 'Local coding agent',
      scenarios: [
        {
          title: 'Isolate the coding worktree',
          given: [
            'The Workspace is bound to a Git repository.\nThe repository is accessible.',
          ],
          when: 'The user starts a Coding Run.',
          then: [
            'A dedicated branch and worktree are created.',
            'The primary working tree is unchanged.',
          ],
        },
      ],
    });
  });

  it.each([
    { scenarios: [] },
    {
      scenarios: [
        { ...revisionInput().scenarios[0], title: 'line one\nline two' },
      ],
    },
    {
      scenarios: [{ ...revisionInput().scenarios[0], given: [] }],
    },
    {
      scenarios: [{ ...revisionInput().scenarios[0], when: ' ' }],
    },
    {
      scenarios: [{ ...revisionInput().scenarios[0], then: [] }],
    },
  ])('rejects an incomplete Scenario Set', (overrides) => {
    expect(() =>
      normalizeStoryRevisionInput({ ...revisionInput(), ...overrides }),
    ).toThrow(DomainError);
  });

  it('limits the Scenario and step counts and validates Story versions', () => {
    expect(() =>
      normalizeStoryRevisionInput({
        ...revisionInput(),
        scenarios: Array.from(
          { length: 51 },
          () => revisionInput().scenarios[0],
        ),
      }),
    ).toThrow('more than 50');
    expect(() =>
      normalizeStoryRevisionInput({
        ...revisionInput(),
        scenarios: [
          {
            ...revisionInput().scenarios[0],
            then: Array.from({ length: 21 }, () => 'One outcome'),
          },
        ],
      }),
    ).toThrow('more than 20');
    expect(assertStoryVersion(1)).toBe(1);
    expect(() => assertStoryVersion(0)).toThrow(DomainError);
  });
});
