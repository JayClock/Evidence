import { describe, expect, it } from 'vitest';
import { Check } from 'typebox/value';
import {
  clarificationQuestionParam,
  inboxStoryCandidatesParam,
  modelingProfileParam,
  statusParam,
  taskingDraftParam,
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

  it('bounds the status tool to summary or paginated active artifacts', () => {
    expect(Check(statusParam, {})).toBe(true);
    expect(
      Check(statusParam, {
        view: 'artifacts',
        cursor: 'opaque-cursor',
        limit: 50,
      }),
    ).toBe(true);
    expect(Check(statusParam, { view: 'files' })).toBe(false);
    expect(Check(statusParam, { view: 'artifacts', limit: 51 })).toBe(false);
    expect(Check(statusParam, { view: 'summary', unexpected: true })).toBe(
      false,
    );
  });

  it('binds focused filters and optional Nx ownership at TEST scope', () => {
    const candidate = {
      runtimes: [
        {
          id: 'RUNTIME-001',
          runtime: 'typescript',
          functionalContexts: ['workspace'],
          technicalBoundaries: ['react-feature'],
          projectIds: ['@evidence/web'],
        },
      ],
      tests: [
        {
          id: 'TEST-001',
          quadrant: 'Q2',
          intent: 'The workspace is visible.',
          runtimePlanId: 'RUNTIME-001',
          stepId: 'web-q2',
          projectId: '@evidence/web',
          testFilter: 'workspace_visible',
          supportedBy: ['TEST-000'],
          scenarioIds: ['SC-001'],
          businessData: ['workspace=alpha'],
          modelRefs: { entities: ['workspace'], associations: [] },
        },
      ],
      tasks: [
        {
          id: 'TASK-001',
          description: 'Show the workspace.',
          testIds: ['TEST-001'],
          dependsOn: [],
        },
      ],
    };

    expect(Check(taskingDraftParam, candidate)).toBe(true);
    expect(
      Check(taskingDraftParam, {
        ...candidate,
        runtimes: [{ ...candidate.runtimes[0], testFilter: 'runtime-wide' }],
      }),
    ).toBe(false);
    const withoutFilter = Object.fromEntries(
      Object.entries(candidate.tests[0]).filter(
        ([key]) => key !== 'testFilter',
      ),
    );
    expect(
      Check(taskingDraftParam, { ...candidate, tests: [withoutFilter] }),
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
    expect(
      Check(clarificationQuestionParam, {
        storyId: 'US-001',
        question: 'x'.repeat(1537),
        target: 'history',
      }),
    ).toBe(false);
  });
});
