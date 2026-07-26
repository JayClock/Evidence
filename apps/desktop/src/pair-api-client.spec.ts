import { describe, expect, it, vi } from 'vitest';
import type { RecordPairCommandObservationInput } from '@evidence/api-client';
import { PairApiClient } from './pair-api-client';

const sha256 = `sha256:${'a'.repeat(64)}`;

function taskingResponse() {
  return {
    _links: {
      self: {
        href: '/api/workspaces/workspace-1/iterations/iteration-1/tasking',
      },
      'start-pair': {
        href: '/api/workspaces/workspace-1/iterations/iteration-1/pair/runs',
      },
    },
    iteration: {
      id: 'iteration-1',
      loop: 'tasking',
      stage: 'approved',
      version: 8,
      baseCommitSha: 'b'.repeat(40),
      branchName: 'evidence/iter-iteration-1',
    },
    story: { id: 'story-1', reference: 'US-001', title: 'Pair Story' },
    storyRevision: { id: 'revision-2', contentSha256: sha256 },
    approvedPlan: {
      id: 'approved-plan-1',
      contentSha256: sha256,
      plan: { planVersion: 2 },
    },
  };
}

function pairResponse() {
  return {
    _links: {
      self: { href: '/api/workspaces/workspace-1/iterations/iteration-1/pair' },
      'record-command-observation': {
        href: '/api/workspaces/workspace-1/iterations/iteration-1/pair/command-observations',
      },
    },
    iteration: taskingResponse().iteration,
    story: taskingResponse().story,
    storyRevision: taskingResponse().storyRevision,
    approvedPlan: taskingResponse().approvedPlan,
    run: {
      id: 'pair-1',
      version: 2,
      status: 'running',
      checkpoint: 'test_written',
    },
    driverAttempts: [],
    commandObservations: [],
    redReviews: [],
    currentException: null,
    manifest: null,
    decisions: [],
    nextAction: {
      actionId: 'ACT-001',
      expectedPairVersion: 2,
      kind: 'execute_command',
      stage: 'red',
      command: 'pnpm nx test @evidence/desktop --run --testNamePattern=pair',
      timeoutMs: 10_000,
      workUnit: null,
      gate: null,
    },
  };
}

describe('PairApiClient', () => {
  it('starts from the exact HAL-approved Tasking Plan', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(taskingResponse()))
      .mockResolvedValueOnce(
        jsonResponse({
          _links: { self: pairResponse()._links.self },
          pair: pairResponse(),
          leaseToken: 'opaque-lease-token',
        }),
      );
    const client = new PairApiClient({
      apiBaseUrl: 'https://evidence.example/api',
      authorization: 'Bearer local',
      fetch,
    });

    const tasking = await client.getTaskingEntry('workspace-1', 'iteration-1');
    const result = await client.startPair(tasking, 'desktop-1');

    expect(fetch).toHaveBeenNthCalledWith(
      2,
      new URL(
        'https://evidence.example/api/workspaces/workspace-1/iterations/iteration-1/pair/runs',
      ),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          expectedIterationVersion: 8,
          approvedTaskingPlanId: 'approved-plan-1',
          approvedTaskingPlanSha256: sha256,
          executorId: 'desktop-1',
        }),
        headers: expect.objectContaining({ Authorization: 'Bearer local' }),
      }),
    );
    expect(result).toMatchObject({
      leaseToken: 'opaque-lease-token',
      pair: { data: { run: { id: 'pair-1' } } },
    });
  });

  it('sends the opaque Pair lease only as a request header', async () => {
    const response = pairResponse();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(response))
      .mockResolvedValueOnce(
        jsonResponse({
          _links: { self: response._links.self },
          pair: response,
          acceptedRecordId: 'observation-1',
        }),
      );
    const client = new PairApiClient({
      apiBaseUrl: 'https://evidence.example/api',
      fetch,
    });
    const pair = await client.getPair('workspace-1', 'iteration-1');
    const input: RecordPairCommandObservationInput = {
      pairRunId: 'pair-1',
      actionId: 'ACT-001',
      expectedPairVersion: 2,
      stage: 'red',
      command: 'pnpm nx test @evidence/desktop --run --testNamePattern=pair',
      termination: 'exited',
      exitCode: 1,
      signal: null,
      durationMs: 20,
      stdoutSha256: sha256,
      stdoutBytes: 10,
      stdoutLines: 1,
      stderrSha256: sha256,
      stderrBytes: 0,
      stderrLines: 0,
      worktreeSha256: sha256,
      diffSha256: sha256,
    };

    await client.recordCommandObservation(pair, 'opaque-lease-token', input);

    const init = fetch.mock.calls[1]?.[1] as RequestInit;
    expect(init.headers).toMatchObject({
      'X-Evidence-Pair-Lease': 'opaque-lease-token',
    });
    expect(JSON.parse(String(init.body))).not.toHaveProperty('leaseToken');
  });

  it('rejects HAL links outside the configured API root', async () => {
    const fetch = vi.fn().mockResolvedValue(
      jsonResponse({
        ...taskingResponse(),
        _links: {
          'start-pair': { href: 'https://evil.example/api/pair/runs' },
        },
      }),
    );
    const client = new PairApiClient({
      apiBaseUrl: 'https://evidence.example/api',
      fetch,
    });
    const tasking = await client.getTaskingEntry('workspace-1', 'iteration-1');

    await expect(client.startPair(tasking, 'desktop-1')).rejects.toThrow(
      'outside the configured API root',
    );
  });
});

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
