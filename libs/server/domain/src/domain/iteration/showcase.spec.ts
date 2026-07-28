import { describe, expect, it } from 'vitest';
import { Ref } from '../core';
import {
  ShowcaseEvaluation,
  ShowcaseProductObservation,
  ShowcaseQ2Observation,
  ShowcaseRiskDecision,
} from './showcase';
import {
  materializeShowcaseQ2Checks,
  normalizeDecideShowcaseInput,
  normalizeShowcaseProductObservationInput,
  normalizeShowcaseRiskDecisionInput,
  showcaseReadinessBlockers,
} from './showcase-validation';
import type { TaskingCandidateDescription } from './tasking';

const sha256 = `sha256:${'a'.repeat(64)}`;
const timestamp = '2026-08-03T00:00:00.000Z';

function plan(): TaskingCandidateDescription {
  return {
    planVersion: 2,
    reference: 'TASKING-001',
    iteration: new Ref('iteration-1'),
    story: new Ref('story-1'),
    storyRevision: new Ref('revision-1'),
    storyRevisionSha256: sha256,
    baseCommitSha: 'b'.repeat(40),
    noModelImpactDecision: new Ref('model-decision-1'),
    noModelImpactDecisionSha256: sha256,
    sequence: 1,
    projectCatalog: {
      projects: [
        {
          id: '@evidence/desktop',
          root: 'apps/desktop',
          targets: ['test'],
        },
      ],
    },
    projectCatalogSha256: sha256,
    tests: [
      {
        id: 'TEST-001',
        quadrant: 'Q1',
        intent: 'Drive behavior',
        runtimePlanId: 'RUNTIME-001',
        processId: 'typescript-electron-shell',
        stepId: 'electron-shell-q1',
        projectId: '@evidence/desktop',
        testFilter: 'showcase',
        supportedBy: [],
        scenarioIds: ['SC-001'],
        scenarioOutcome: null,
        businessData: [],
        modelRefs: { entities: [], associations: [] },
      },
      {
        id: 'TEST-002',
        quadrant: 'Q2',
        intent: 'Observe the product boundary',
        runtimePlanId: 'RUNTIME-001',
        processId: 'typescript-electron-shell',
        stepId: 'electron-package-q2',
        projectId: null,
        testFilter: 'showcase-package',
        supportedBy: ['TEST-001'],
        scenarioIds: ['SC-001'],
        scenarioOutcome: 'The product behavior is observable',
        businessData: ['workspace-1'],
        modelRefs: { entities: [], associations: [] },
      },
    ],
    tasks: [
      {
        id: 'TASK-001',
        description: 'Implement the Story',
        testIds: ['TEST-001', 'TEST-002'],
        dependsOn: [],
        modelRefs: { entities: [], associations: [] },
      },
    ],
    processes: [
      {
        runtimePlanId: 'RUNTIME-001',
        processId: 'typescript-electron-shell',
        processVersion: 3,
        definitionSha256: sha256,
        functionalContexts: ['delivery'],
        technicalBoundaries: ['electron-main'],
        selectedStepIds: ['electron-shell-q1', 'electron-package-q2'],
        projectIds: ['@evidence/desktop'],
        projectCatalogSha256: sha256,
        focusedCommands: [
          {
            testId: 'TEST-001',
            stepId: 'electron-shell-q1',
            projectId: '@evidence/desktop',
            command:
              'pnpm nx test @evidence/desktop --run --testNamePattern=showcase',
          },
          {
            testId: 'TEST-002',
            stepId: 'electron-package-q2',
            projectId: null,
            command: 'pnpm nx run @evidence/desktop:package-smoke',
          },
        ],
        qualityGates: [],
        materializedSha256: sha256,
      },
    ],
    executionBudget: {
      policyId: 'pair-default',
      policyVersion: 2,
      policySha256: sha256,
      activityTimeoutMs: 3_600_000,
      commandTimeoutMs: 600_000,
      maxAgentCalls: 10,
      maxCheckpoints: 30,
      maxRetriesPerFingerprint: 2,
      maxNoProgressCheckpoints: 3,
    },
    contentSha256: sha256,
    proposedBy: 'tasking-analyst',
    proposedAt: timestamp,
  };
}

function q2() {
  return new ShowcaseQ2Observation('q2-1', {
    showcaseRun: new Ref('showcase-1'),
    actionId: 'ACT-001',
    sequence: 1,
    testId: 'TEST-002',
    scenarioIds: ['SC-001'],
    processId: 'typescript-electron-shell',
    stepId: 'electron-package-q2',
    projectId: null,
    command: 'pnpm nx run @evidence/desktop:package-smoke',
    termination: 'exited',
    exitCode: 0,
    signal: null,
    durationMs: 100,
    stdoutSha256: sha256,
    stdoutBytes: 1,
    stdoutLines: 1,
    stderrSha256: sha256,
    stderrBytes: 0,
    stderrLines: 0,
    approvedCommitSha: 'b'.repeat(40),
    worktreeSha256: sha256,
    observedAt: timestamp,
    previousRecordSha256: null,
    recordSha256: sha256,
  });
}

function productObservation() {
  return new ShowcaseProductObservation('product-1', {
    showcaseRun: new Ref('showcase-1'),
    scenarioId: 'SC-001',
    scenarioReference: 'SC-001',
    givenSteps: ['a workspace exists'],
    whenStep: 'the user opens Showcase',
    expectedThenSteps: ['the result is visible'],
    businessData: ['workspace-1'],
    observedOutcomes: ['the result was visible'],
    observation: 'The result appeared in the product surface.',
    valueFeedback: 'The user can validate the delivered value.',
    evidenceRefs: ['evidence:observation-1'],
    observedBy: new Ref('user-1'),
    observedAt: timestamp,
    contentSha256: sha256,
  });
}

function risk(
  quadrant: 'Q3' | 'Q4',
  activities: Array<'usability' | 'security'>,
) {
  return new ShowcaseRiskDecision(`risk-${quadrant}`, {
    showcaseRun: new Ref('showcase-1'),
    quadrant,
    disposition: activities.length ? 'required' : 'not_required',
    activities,
    reason: activities.length ? 'This boundary needs evaluation.' : 'No risk.',
    decidedBy: new Ref('user-1'),
    decidedAt: timestamp,
    contentSha256: sha256,
  });
}

function evaluation(
  quadrant: 'Q3' | 'Q4',
  activity: 'usability' | 'security',
  outcome: 'passed' | 'concern',
  sequence = 1,
) {
  return new ShowcaseEvaluation(`evaluation-${quadrant}-${sequence}`, {
    showcaseRun: new Ref('showcase-1'),
    sequence,
    quadrant,
    activity,
    outcome,
    finding: outcome === 'passed' ? 'The risk is bounded.' : 'Risk remains.',
    evidenceRefs: ['evidence:evaluation-1'],
    observedBy: new Ref('user-1'),
    observedAt: timestamp,
    contentSha256: sha256,
  });
}

describe('Showcase authority', () => {
  it('materializes only approved Q2 checks and their locked commands', () => {
    expect(materializeShowcaseQ2Checks(plan())).toEqual([
      {
        testId: 'TEST-002',
        scenarioIds: ['SC-001'],
        processId: 'typescript-electron-shell',
        stepId: 'electron-package-q2',
        projectId: null,
        command: 'pnpm nx run @evidence/desktop:package-smoke',
      },
    ]);
  });

  it('requires risk dispositions to match their quadrant activities', () => {
    expect(() =>
      normalizeShowcaseRiskDecisionInput({
        expectedShowcaseVersion: 1,
        quadrant: 'Q3',
        disposition: 'required',
        activities: ['security'],
        reason: 'Security belongs to Q4.',
      }),
    ).toThrow(/unsupported Q3 activity/);

    expect(() =>
      normalizeShowcaseRiskDecisionInput({
        expectedShowcaseVersion: 1,
        quadrant: 'Q4',
        disposition: 'not_required',
        activities: ['security'],
        reason: 'No evaluation is needed.',
      }),
    ).toThrow(/cannot select activities/);
  });

  it('rejects local absolute paths as product evidence', () => {
    expect(() =>
      normalizeShowcaseProductObservationInput({
        expectedShowcaseVersion: 1,
        scenarioId: 'scenario-1',
        observedOutcomes: ['Visible'],
        observation: 'Observed.',
        valueFeedback: 'Valuable.',
        evidenceRefs: ['/Users/example/private.png'],
      }),
    ).toThrow(/local absolute paths/);
  });

  it('does not become review-ready while human value evidence is missing', () => {
    expect(
      showcaseReadinessBlockers({
        q2Checks: materializeShowcaseQ2Checks(plan()),
        scenarioIds: ['SC-001'],
        q2Observations: [q2()],
        productObservations: [],
        riskDecisions: [risk('Q3', []), risk('Q4', [])],
        evaluations: [],
      }),
    ).toEqual(['missing_product_observation']);
  });

  it('requires the latest evaluation to pass before independent review', () => {
    expect(
      showcaseReadinessBlockers({
        q2Checks: materializeShowcaseQ2Checks(plan()),
        scenarioIds: ['SC-001'],
        q2Observations: [q2()],
        productObservations: [productObservation()],
        riskDecisions: [risk('Q3', ['usability']), risk('Q4', ['security'])],
        evaluations: [
          evaluation('Q3', 'usability', 'passed'),
          evaluation('Q4', 'security', 'concern'),
          evaluation('Q4', 'security', 'passed', 2),
        ],
      }),
    ).toEqual([]);
  });

  it('requires revise feedback routing but keeps accept human-owned', () => {
    expect(() =>
      normalizeDecideShowcaseInput({
        expectedShowcaseVersion: 3,
        action: 'revise',
        reason: 'The behavior misses the intended value.',
      }),
    ).toThrow(/feedback target/);

    expect(
      normalizeDecideShowcaseInput({
        expectedShowcaseVersion: 3,
        action: 'accept',
        reason: 'The observed behavior delivers the intended value.',
        evidenceBundleSha256: sha256,
        reviewSha256: sha256,
      }),
    ).toMatchObject({ action: 'accept', feedbackTarget: null });
  });
});
