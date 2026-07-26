import { describe, expect, it } from 'vitest';
import { Ref } from '../core';
import type { TaskingCandidateDescription } from './tasking';
import {
  allowedPairExceptionRoutes,
  materializePairExecutionPlan,
  normalizeDecidePairInput,
  normalizePairCommandObservationInput,
} from './pair-validation';

const sha256 = `sha256:${'a'.repeat(64)}`;

function plan(): TaskingCandidateDescription {
  return {
    planVersion: 2,
    reference: 'TASKING-001',
    iteration: new Ref('iteration-1'),
    story: new Ref('story-1'),
    storyRevision: new Ref('revision-2'),
    storyRevisionSha256: sha256,
    baseCommitSha: 'b'.repeat(40),
    noModelImpactDecision: new Ref('no-model-1'),
    noModelImpactDecisionSha256: sha256,
    sequence: 1,
    projectCatalog: {
      projects: [
        {
          id: '@evidence/desktop',
          root: 'apps/desktop',
          targets: ['test', 'typecheck', 'lint', 'package-smoke'],
        },
      ],
    },
    projectCatalogSha256: sha256,
    tests: [
      {
        id: 'TEST-001',
        quadrant: 'Q1',
        intent: 'Drive the local Pair controller.',
        runtimePlanId: 'RUNTIME-001',
        processId: 'typescript-electron-shell',
        stepId: 'electron-shell-q1',
        projectId: null,
        testFilter: 'pair-controller',
        supportedBy: [],
        scenarioIds: ['SC-001'],
        scenarioOutcome: null,
        businessData: ['TEST-001'],
        modelRefs: { entities: [], associations: [] },
      },
      {
        id: 'TEST-002',
        quadrant: 'Q2',
        intent: 'Confirm the packaged Pair outcome.',
        runtimePlanId: 'RUNTIME-001',
        processId: 'typescript-electron-shell',
        stepId: 'electron-package-q2',
        projectId: null,
        testFilter: 'pair-package',
        supportedBy: ['TEST-001'],
        scenarioIds: ['SC-001'],
        scenarioOutcome: 'The approved Pair run is reviewable',
        businessData: ['TEST-001'],
        modelRefs: { entities: [], associations: [] },
      },
    ],
    tasks: [
      {
        id: 'TASK-001',
        description: 'Drive Pair and its packaged acceptance boundary.',
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
        technicalBoundaries: ['electron-main', 'electron-preload'],
        selectedStepIds: ['electron-shell-q1', 'electron-package-q2'],
        projectIds: ['@evidence/desktop'],
        projectCatalogSha256: sha256,
        focusedCommands: [
          {
            testId: 'TEST-001',
            stepId: 'electron-shell-q1',
            projectId: null,
            command:
              'pnpm nx test @evidence/desktop --run --testNamePattern=pair-controller',
          },
          {
            testId: 'TEST-002',
            stepId: 'electron-package-q2',
            projectId: null,
            command:
              'pnpm nx test @evidence/desktop --run --testNamePattern=pair-package',
          },
        ],
        qualityGates: [
          {
            projectId: '@evidence/desktop',
            target: 'test',
            command: 'pnpm nx test @evidence/desktop --run',
          },
          {
            projectId: null,
            target: null,
            command: 'pnpm nx run @evidence/desktop:package-smoke',
          },
        ],
        materializedSha256: sha256,
      },
    ],
    executionBudget: {
      policyId: 'pair-default',
      policyVersion: 1,
      policySha256: sha256,
      activityTimeoutMs: 3_600_000,
      commandTimeoutMs: 600_000,
      maxAgentCalls: 10,
      maxCheckpoints: 34,
      maxRetriesPerFingerprint: 2,
      maxNoProgressCheckpoints: 3,
    },
    contentSha256: sha256,
    proposedBy: 'tasking-analyst',
    proposedAt: '2026-08-02T00:00:00.000Z',
  };
}

describe('Pair authority', () => {
  it('materializes TASK-ordered work units and locked quality gates', () => {
    const result = materializePairExecutionPlan(plan());

    expect(result.workUnits).toHaveLength(2);
    expect(result.workUnits[0]).toMatchObject({
      index: 0,
      stepKey: 'RUNTIME-001:electron-shell-q1',
      task: { id: 'TASK-001' },
      test: { id: 'TEST-001' },
      focusedCommand: {
        command:
          'pnpm nx test @evidence/desktop --run --testNamePattern=pair-controller',
      },
      testRoots: ['apps/desktop/src'],
      productionRoots: ['apps/desktop'],
    });
    expect(result.qualityGates.map(({ command }) => command)).toEqual([
      'pnpm nx test @evidence/desktop --run',
      'pnpm nx run @evidence/desktop:package-smoke',
    ]);
  });

  it('normalizes command evidence without accepting stdout content', () => {
    expect(
      normalizePairCommandObservationInput({
        pairRunId: 'pair-1',
        actionId: 'PAIR-ACT-001',
        expectedPairVersion: 2,
        leaseToken: 'opaque-lease-token',
        stage: 'red',
        command:
          'pnpm nx test @evidence/desktop --run --testNamePattern=pair-controller',
        termination: 'exited',
        exitCode: 1,
        durationMs: 250,
        stdoutSha256: sha256,
        stdoutBytes: 150,
        stdoutLines: 4,
        stderrSha256: sha256,
        stderrBytes: 0,
        stderrLines: 0,
        worktreeSha256: sha256,
        diffSha256: sha256,
      }),
    ).toMatchObject({
      stage: 'red',
      termination: 'exited',
      exitCode: 1,
      signal: null,
      stdoutBytes: 150,
    });
  });

  it('requires exact evidence hashes for Story-level approval', () => {
    expect(() =>
      normalizeDecidePairInput({
        expectedPairVersion: 10,
        action: 'approve',
        reason: 'The complete Story increment matches the approved plan.',
      }),
    ).toThrow('requires Manifest, diff, and commit hashes');

    expect(
      normalizeDecidePairInput({
        expectedPairVersion: 10,
        action: 'approve',
        reason: 'The complete Story increment matches the approved plan.',
        manifestSha256: sha256,
        diffSha256: sha256,
        commitSha: 'b'.repeat(40),
      }),
    ).toMatchObject({ action: 'approve', commitSha: 'b'.repeat(40) });
  });

  it('only exposes checkpoint-safe exception routes', () => {
    expect(allowedPairExceptionRoutes('pseudo_red')).toEqual([
      'back_test',
      'back_tasking',
      'cancel',
    ]);
    expect(allowedPairExceptionRoutes('quality_gate_failed')).toContain(
      'retry_quality',
    );
    expect(allowedPairExceptionRoutes('budget_exhausted')).not.toContain(
      'retry_quality',
    );
  });
});
