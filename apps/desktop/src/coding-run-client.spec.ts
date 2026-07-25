import { describe, expect, it, vi } from 'vitest';
import { CodingRunClient } from './coding-run-client';

const baseCommitSha = 'a'.repeat(40);
const diffSha256 = `sha256:${'b'.repeat(64)}`;

function response(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function runResource(
  status: 'running' | 'review_required' = 'running',
  version = 1,
) {
  return {
    _links: {
      self: { href: '/api/workspaces/workspace-1/coding-runs/run-1' },
      review: {
        href: '/api/workspaces/workspace-1/coding-runs/run-1/review',
      },
      fail: { href: '/api/workspaces/workspace-1/coding-runs/run-1/fail' },
      cancel: {
        href: '/api/workspaces/workspace-1/coding-runs/run-1/cancel',
      },
      ...(status === 'review_required'
        ? {
            accept: {
              href: '/api/workspaces/workspace-1/coding-runs/run-1/accept',
            },
            reject: {
              href: '/api/workspaces/workspace-1/coding-runs/run-1/reject',
            },
          }
        : {}),
    },
    id: 'run-1',
    storyId: 'story-1',
    storyRevisionId: 'revision-2',
    status,
    version,
    baseCommitSha,
    diffSha256: status === 'running' ? null : diffSha256,
    changedFileCount: status === 'running' ? null : 2,
    commitSha: null,
  };
}

describe('CodingRunClient', () => {
  it('follows Server HAL commands without sending local paths or full diffs', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response({
          _links: {
            'start-coding-run': {
              href: '/api/workspaces/workspace-1/stories/story-1/coding-runs',
            },
          },
          id: 'story-1',
          latestRevisionId: 'revision-2',
          latestScenarioCount: 1,
        }),
      )
      .mockResolvedValueOnce(response(runResource(), 201))
      .mockResolvedValueOnce(response(runResource('review_required', 2)));
    const client = new CodingRunClient({
      apiBaseUrl: 'https://api.example.test/api',
      authorization: 'Bearer secret',
      fetch: fetchMock,
    });

    const story = await client.getStory('workspace-1', 'story-1');
    const run = await client.start(story, {
      storyRevisionId: 'revision-2',
      baseCommitSha,
    });
    await client.submitForReview(run, {
      diffSha256,
      changedFileCount: 2,
      qualityChecks: [
        {
          name: 'pnpm test',
          status: 'passed',
          durationMs: 1200,
          summary: 'Gate passed.',
        },
      ],
    });

    expect(fetchMock.mock.calls[0]?.[0].toString()).toBe(
      'https://api.example.test/api/workspaces/workspace-1/stories/story-1',
    );
    const startBody = String(fetchMock.mock.calls[1]?.[1]?.body);
    const reviewBody = String(fetchMock.mock.calls[2]?.[1]?.body);
    expect(startBody).toContain(baseCommitSha);
    expect(reviewBody).toContain(diffSha256);
    expect(`${startBody}${reviewBody}`).not.toContain('/Users/');
    expect(`${startBody}${reviewBody}`).not.toContain('diff --git');
    expect(fetchMock.mock.calls[1]?.[1]?.headers).toMatchObject({
      Authorization: 'Bearer secret',
    });
  });

  it('loads one persisted run for Desktop recovery', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response(runResource('review_required', 2)));
    const client = new CodingRunClient({
      apiBaseUrl: 'https://api.example.test/api',
      fetch: fetchMock,
    });

    await expect(client.getRun('workspace-1', 'run-1')).resolves.toMatchObject({
      id: 'run-1',
      status: 'review_required',
      changedFileCount: 2,
    });
    expect(fetchMock.mock.calls[0]?.[0].toString()).toBe(
      'https://api.example.test/api/workspaces/workspace-1/coding-runs/run-1',
    );
  });

  it('rejects cross-origin HAL links', async () => {
    const client = new CodingRunClient({
      apiBaseUrl: 'https://api.example.test/api',
      fetch: vi.fn<typeof fetch>(),
    });

    await expect(
      client.start(
        {
          id: 'story-1',
          latestRevisionId: 'revision-2',
          latestScenarioCount: 1,
          links: { 'start-coding-run': 'https://evil.test/api/runs' },
        },
        { storyRevisionId: 'revision-2', baseCommitSha },
      ),
    ).rejects.toThrow('outside the configured API root');
  });
});
