import { describe, expect, it, vi } from 'vitest';
import type { RecordShowcaseQ2ObservationInput } from '@evidence/api-client';
import { ShowcaseApiClient } from './api-client';

const sha256 = `sha256:${'a'.repeat(64)}`;

function showcaseResponse() {
  return {
    _links: {
      self: {
        href: '/api/workspaces/workspace-1/iterations/iteration-1/showcase',
      },
      'record-q2-observation': {
        href: '/api/workspaces/workspace-1/iterations/iteration-1/showcase/q2-observations',
      },
    },
    iteration: { id: 'iteration-1' },
    story: { id: 'story-1' },
    storyRevision: { id: 'revision-1' },
    approvedPlan: { id: 'plan-1', plan: { tests: [] } },
    pairRun: {
      id: 'pair-1',
      baseCommitSha: 'b'.repeat(40),
      branchName: 'evidence/iter-iteration-1',
    },
    pairManifest: { id: 'manifest-1' },
    run: { id: 'showcase-1', version: 1, stage: 'setup' },
    q2Observations: [],
    productObservations: [],
    riskDecisions: [],
    evaluations: [],
    review: null,
    decision: null,
    nextAction: {
      actionId: 'ACT-001',
      expectedShowcaseVersion: 1,
      kind: 'execute_q2',
      testId: 'TEST-002',
      scenarioIds: ['scenario-1'],
      processId: 'typescript-electron-shell',
      stepId: 'electron-package-q2',
      projectId: null,
      command: 'pnpm nx run @evidence/desktop:package-smoke',
      timeoutMs: 10_000,
      approvedCommitSha: 'c'.repeat(40),
    },
  };
}

describe('ShowcaseApiClient', () => {
  it('posts only bounded Q2 evidence through the advertised HAL relation', async () => {
    const response = showcaseResponse();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(response))
      .mockResolvedValueOnce(
        jsonResponse({
          _links: { self: response._links.self },
          showcase: response,
          acceptedRecordId: 'q2-observation-1',
        }),
      );
    const client = new ShowcaseApiClient({
      apiBaseUrl: 'https://evidence.example/api',
      authorization: 'Bearer local',
      fetch,
    });
    const showcase = await client.getShowcase('workspace-1', 'iteration-1');
    const input: RecordShowcaseQ2ObservationInput = {
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
      approvedCommitSha: 'c'.repeat(40),
      worktreeSha256: sha256,
    };

    await client.recordQ2Observation(showcase, input);

    expect(fetch).toHaveBeenNthCalledWith(
      2,
      new URL(
        'https://evidence.example/api/workspaces/workspace-1/iterations/iteration-1/showcase/q2-observations',
      ),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(input),
        headers: expect.objectContaining({ Authorization: 'Bearer local' }),
      }),
    );
    expect(
      JSON.parse(String(fetch.mock.calls[1]?.[1]?.body)),
    ).not.toHaveProperty('stdout');
  });

  it('rejects Showcase HAL links outside the configured API root', async () => {
    const response = showcaseResponse();
    const fetch = vi.fn().mockResolvedValue(
      jsonResponse({
        ...response,
        _links: {
          ...response._links,
          'record-q2-observation': {
            href: 'https://evil.example/api/showcase/q2-observations',
          },
        },
      }),
    );
    const client = new ShowcaseApiClient({
      apiBaseUrl: 'https://evidence.example/api',
      fetch,
    });
    const showcase = await client.getShowcase('workspace-1', 'iteration-1');

    await expect(
      client.recordQ2Observation(showcase, {
        showcaseRunId: 'showcase-1',
        actionId: 'ACT-001',
        expectedShowcaseVersion: 1,
        command: 'pnpm nx run @evidence/desktop:package-smoke',
        termination: 'exited',
        exitCode: 0,
        durationMs: 10,
        stdoutSha256: sha256,
        stdoutBytes: 0,
        stdoutLines: 0,
        stderrSha256: sha256,
        stderrBytes: 0,
        stderrLines: 0,
        approvedCommitSha: 'c'.repeat(40),
        worktreeSha256: sha256,
      }),
    ).rejects.toThrow('outside the configured API root');
  });
});

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
