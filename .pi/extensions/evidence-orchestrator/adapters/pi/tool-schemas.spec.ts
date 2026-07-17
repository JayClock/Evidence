import { describe, expect, it } from 'vitest';
import { Check } from 'typebox/value';
import {
  clarificationQuestionParam,
  inboxStoryCandidatesParam,
  modelingProfileParam,
} from './tool-schemas';

describe('Pi tool schemas', () => {
  it('rejects unknown properties at every object boundary', () => {
    const candidate = {
      sourceIds: ['INBOX-0001'],
      candidates: [
        {
          title: 'Retain evidence',
          problem: 'Evidence is missing.',
          role: 'owner',
          goal: 'retain evidence',
          value: 'support audit',
          cognitiveMode: 'complex',
          citations: [
            {
              inboxId: 'INBOX-0001',
              revisionSha256: 'a'.repeat(64),
              locator: 'whole source',
            },
          ],
        },
      ],
    };

    expect(Check(inboxStoryCandidatesParam, candidate)).toBe(true);
    expect(
      Check(inboxStoryCandidatesParam, {
        ...candidate,
        unexpected: true,
      }),
    ).toBe(false);
    expect(
      Check(inboxStoryCandidatesParam, {
        ...candidate,
        candidates: [{ ...candidate.candidates[0], unexpected: true }],
      }),
    ).toBe(false);
  });

  it('uses provider-compatible string enums with inferred literal values', () => {
    expect(modelingProfileParam.properties.subject).toMatchObject({
      type: 'string',
      enum: ['business', 'domain', 'tool'],
    });
    expect(modelingProfileParam.properties.subject).not.toHaveProperty('anyOf');
    expect(
      Check(modelingProfileParam, {
        subject: 'tool',
        method: 'algorithmic',
        modelChangeRequired: 'false',
        reason: 'The Scenario describes a deterministic tool.',
      }),
    ).toBe(true);
    expect(
      Check(modelingProfileParam, {
        subject: 'service',
        method: 'algorithmic',
        modelChangeRequired: 'false',
        reason: 'Unsupported subject.',
      }),
    ).toBe(false);
  });

  it('constrains clarification targets instead of accepting arbitrary strings', () => {
    expect(
      Check(clarificationQuestionParam, {
        storyId: 'US-001',
        question: 'Who confirms the result?',
        target: 'history',
      }),
    ).toBe(true);
    expect(
      Check(clarificationQuestionParam, {
        storyId: 'US-001',
        question: 'Who confirms the result?',
        target: 'implementation',
      }),
    ).toBe(false);
  });
});
