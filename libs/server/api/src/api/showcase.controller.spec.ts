import { describe, expect, it, vi } from 'vitest';
import type { Workspace, WorkspaceShowcase } from '@evidence/server-domain';
import type { ResourceResolver } from './resource-resolver.service';
import { ShowcaseController } from './showcase.controller';

const sha256 = `sha256:${'a'.repeat(64)}`;

function fixture() {
  const stopped = new Error('stop after port capture');
  const showcase = {
    findShowcase: vi.fn(),
    recordQ2Observation: vi.fn(async () => Promise.reject(stopped)),
    recordProductObservation: vi.fn(async () => Promise.reject(stopped)),
    recordRiskDecision: vi.fn(async () => Promise.reject(stopped)),
    recordEvaluation: vi.fn(async () => Promise.reject(stopped)),
    recordReview: vi.fn(async () => Promise.reject(stopped)),
    decideShowcase: vi.fn(async () => Promise.reject(stopped)),
  } satisfies WorkspaceShowcase;
  const workspace = { showcase: () => showcase } as unknown as Workspace;
  const resolver = {
    requireWorkspace: vi.fn(async () => workspace),
    currentUserId: vi.fn(() => 'user-1'),
  } as unknown as ResourceResolver;
  return {
    controller: new ShowcaseController(resolver),
    showcase,
    stopped,
  };
}

describe('ShowcaseController', () => {
  it('records only bounded Q2 execution facts', async () => {
    const { controller, showcase, stopped } = fixture();

    await expect(
      controller.recordQ2Observation('workspace-1', 'iteration-1', {
        showcaseRunId: 'showcase-1',
        actionId: 'ACT-001',
        expectedShowcaseVersion: 1,
        command: 'pnpm nx run @evidence/desktop:package-smoke',
        termination: 'exited',
        exitCode: 0,
        signal: null,
        durationMs: 100,
        stdoutSha256: sha256,
        stdoutBytes: 20,
        stdoutLines: 1,
        stderrSha256: sha256,
        stderrBytes: 0,
        stderrLines: 0,
        approvedCommitSha: 'b'.repeat(40),
        worktreeSha256: sha256,
      }),
    ).rejects.toBe(stopped);

    expect(showcase.recordQ2Observation).toHaveBeenCalledWith(
      'iteration-1',
      expect.objectContaining({
        showcaseRunId: 'showcase-1',
        actionId: 'ACT-001',
        stdoutSha256: sha256,
        stdoutBytes: 20,
        approvedCommitSha: 'b'.repeat(40),
      }),
    );
  });

  it('records the current user as the product observer', async () => {
    const { controller, showcase, stopped } = fixture();

    await expect(
      controller.recordProductObservation('workspace-1', 'iteration-1', {
        expectedShowcaseVersion: 2,
        scenarioId: 'scenario-1',
        observedOutcomes: ['The outcome was visible.'],
        observation: 'Observed in the product surface.',
        valueFeedback: 'The intended value is present.',
        evidenceRefs: ['evidence:observation-1'],
      }),
    ).rejects.toBe(stopped);

    expect(showcase.recordProductObservation).toHaveBeenCalledWith(
      'iteration-1',
      expect.objectContaining({ scenarioId: 'scenario-1' }),
      'user-1',
    );
  });

  it('preserves explicit Q4 evaluation semantics', async () => {
    const { controller, showcase, stopped } = fixture();

    await expect(
      controller.recordEvaluation('workspace-1', 'iteration-1', {
        expectedShowcaseVersion: 5,
        quadrant: 'Q4',
        activity: 'security',
        outcome: 'passed',
        finding: 'The restricted preload boundary remains intact.',
        evidenceRefs: ['evidence:security-1'],
      }),
    ).rejects.toBe(stopped);

    expect(showcase.recordEvaluation).toHaveBeenCalledWith(
      'iteration-1',
      expect.objectContaining({
        quadrant: 'Q4',
        activity: 'security',
        outcome: 'passed',
      }),
      'user-1',
    );
  });

  it('records the current user as the value decision actor', async () => {
    const { controller, showcase, stopped } = fixture();

    await expect(
      controller.decide('workspace-1', 'iteration-1', {
        expectedShowcaseVersion: 7,
        action: 'accept',
        reason: 'The observed product behavior delivers the intended value.',
        evidenceBundleSha256: sha256,
        reviewSha256: sha256,
      }),
    ).rejects.toBe(stopped);

    expect(showcase.decideShowcase).toHaveBeenCalledWith(
      'iteration-1',
      expect.objectContaining({
        action: 'accept',
        evidenceBundleSha256: sha256,
        reviewSha256: sha256,
      }),
      'user-1',
    );
  });
});
