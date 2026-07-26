import { describe, expect, it } from 'vitest';
import { DomainError } from '../error';
import type { ProposeTaskingInput } from './tasking';
import {
  normalizeDecideTaskingInput,
  normalizeProposeTaskingInput,
  normalizeRecordNoModelImpactInput,
  type TaskingAuthorityScenario,
} from './tasking-validation';

const sha256 = `sha256:${'a'.repeat(64)}`;

const scenarios: TaskingAuthorityScenario[] = [
  {
    id: 'SC-001',
    title: 'Run the local Tasking Analyst',
    given: ['A confirmed Story Scenario Set exists'],
    when: 'The user runs Tasking in Desktop',
    then: ['A complete Candidate awaits Desk Check'],
    businessData: ['Story Revision v2', 'TEST-001'],
  },
];

function proposal(): ProposeTaskingInput {
  return {
    expectedIterationVersion: 4,
    storyId: 'story-1',
    storyRevisionId: 'revision-2',
    noModelImpactDecisionId: 'model-decision-1',
    noModelImpactDecisionSha256: sha256,
    projectCatalog: {
      projects: [
        {
          id: '@evidence/desktop',
          root: 'apps/desktop',
          targets: ['lint', 'test', 'typecheck', 'package-smoke'],
        },
      ],
    },
    runtimes: [
      {
        id: 'RUNTIME-001',
        runtime: 'typescript',
        functionalContexts: ['delivery'],
        technicalBoundaries: ['electron-main', 'electron-preload'],
        projectIds: ['@evidence/desktop'],
      },
    ],
    tests: [
      {
        id: 'TEST-001',
        quadrant: 'Q1',
        intent: 'The Desktop Tasking boundary preserves local authority.',
        runtimePlanId: 'RUNTIME-001',
        stepId: 'electron-shell-q1',
        testFilter: 'tasking-shell',
        supportedBy: [],
        scenarioIds: ['SC-001'],
        businessData: ['Story Revision v2'],
        modelRefs: { entities: [], associations: [] },
      },
      {
        id: 'TEST-002',
        quadrant: 'Q2',
        intent: 'The confirmed Scenario reaches Desk Check.',
        runtimePlanId: 'RUNTIME-001',
        stepId: 'electron-package-q2',
        testFilter: 'tasking-package',
        supportedBy: ['TEST-001'],
        scenarioIds: ['SC-001'],
        scenarioOutcome: 'A complete Candidate awaits Desk Check',
        businessData: ['TEST-001'],
        modelRefs: { entities: [], associations: [] },
      },
    ],
    tasks: [
      {
        id: 'TASK-001',
        description: 'Drive the local Tasking boundary and package outcome.',
        testIds: ['TEST-001', 'TEST-002'],
        dependsOn: [],
      },
    ],
  };
}

describe('Tasking authority validation', () => {
  it('normalizes explicit no-model-impact authority', () => {
    expect(
      normalizeRecordNoModelImpactInput({
        expectedIterationVersion: 3,
        storyId: 'story-1',
        storyRevisionId: 'revision-2',
        storyRevisionSha256: sha256.toUpperCase(),
        reason: ' This is local workflow glue with no canonical model facts. ',
      }),
    ).toEqual({
      expectedIterationVersion: 3,
      storyId: 'story-1',
      storyRevisionId: 'revision-2',
      storyRevisionSha256: sha256,
      reason: 'This is local workflow glue with no canonical model facts.',
    });
  });

  it('materializes one v3 process with Q1/Q2 commands and locked gates', () => {
    const result = normalizeProposeTaskingInput(proposal(), scenarios);

    expect(result.runtimes).toHaveLength(1);
    expect(result.runtimes[0]).toMatchObject({
      process: { id: 'typescript-electron-shell', version: 3 },
      selectedStepIds: ['electron-shell-q1', 'electron-package-q2'],
      focusedCommands: [
        {
          testId: 'TEST-001',
          command:
            'pnpm nx test @evidence/desktop --run --testNamePattern=tasking-shell',
        },
        {
          testId: 'TEST-002',
          command:
            'pnpm nx test @evidence/desktop --run --testNamePattern=tasking-package',
        },
      ],
    });
    expect(result.runtimes[0]?.qualityGates).toEqual(
      expect.arrayContaining([
        {
          projectId: '@evidence/desktop',
          target: 'typecheck',
          command: 'pnpm nx typecheck @evidence/desktop',
        },
        {
          projectId: null,
          target: null,
          command: 'pnpm nx run @evidence/desktop:package-smoke',
        },
      ]),
    );
    expect(
      result.tests.every((test) => test.modelRefs.entities.length === 0),
    ).toBe(true);
  });

  it('requires every Scenario Then to have one exact Q2 TEST', () => {
    const input = proposal();
    const q2 = input.tests[1];
    if (!q2) throw new Error('Q2 fixture is missing.');
    input.tests[1] = {
      ...q2,
      scenarioOutcome: 'A different outcome',
    };

    expect(() => normalizeProposeTaskingInput(input, scenarios)).toThrow(
      'Q2 must trace one exact Scenario Then',
    );
  });

  it('rejects model references on the no-model-impact route', () => {
    const input = proposal();
    const q1 = input.tests[0];
    if (!q1) throw new Error('Q1 fixture is missing.');
    input.tests[0] = {
      ...q1,
      modelRefs: { entities: ['Story'], associations: [] },
    };

    expect(() => normalizeProposeTaskingInput(input, scenarios)).toThrow(
      'modelRefs must be empty',
    );
  });

  it('requires reasons for every non-approval Desk Check route', () => {
    expect(
      normalizeDecideTaskingInput({
        expectedIterationVersion: 5,
        candidateId: 'tasking-1',
        candidateSha256: sha256,
        action: 'approve',
      }),
    ).toMatchObject({ action: 'approve', reason: null });
    expect(() =>
      normalizeDecideTaskingInput({
        expectedIterationVersion: 5,
        candidateId: 'tasking-1',
        candidateSha256: sha256,
        action: 'process_gap',
      }),
    ).toThrow(DomainError);
  });
});
