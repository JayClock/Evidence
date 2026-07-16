import { describe, expect, it, vi } from 'vitest';
import { createGitHubIssueInboxSource } from './inbox-source';

function issue(overrides: Record<string, unknown> = {}) {
  return {
    number: 42,
    title: 'Safely delete a logical entity',
    body: 'Preserve an audit record.',
    url: 'https://github.com/owner/evidence/issues/42',
    state: 'OPEN',
    author: { login: 'domain-expert' },
    labels: [{ name: 'feature' }, { name: 'evidence:ready' }],
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: '2026-07-12T00:00:00Z',
    ...overrides,
  };
}

describe('GitHub Inbox source', () => {
  it('normalizes a GitHub Issue into a provider-neutral capture', async () => {
    const runner = vi
      .fn()
      .mockResolvedValueOnce(
        JSON.stringify({ nameWithOwner: 'owner/evidence' }),
      )
      .mockResolvedValueOnce(JSON.stringify(issue()));

    const captured = await createGitHubIssueInboxSource(runner).capture(
      { issueNumber: 42 },
      '/workspace',
    );

    expect(captured).toEqual({
      source_kind: 'github_issue',
      external_key: 'github:owner/evidence#42',
      uri: 'https://github.com/owner/evidence/issues/42',
      title: 'Safely delete a logical entity',
      body: 'Preserve an audit record.',
      content_type: 'text/markdown',
      provider_metadata: {
        repository: 'owner/evidence',
        issue_number: 42,
        state: 'OPEN',
        author: 'domain-expert',
        labels: ['evidence:ready', 'feature'],
        created_at: '2026-07-01T00:00:00Z',
      },
      source_updated_at: '2026-07-12T00:00:00Z',
    });
    expect(runner).toHaveBeenLastCalledWith(
      expect.arrayContaining([
        'issue',
        'view',
        '42',
        '--repo',
        'owner/evidence',
      ]),
      '/workspace',
      undefined,
    );
  });

  it('uses an explicit repository without resolving the current checkout', async () => {
    const runner = vi.fn().mockResolvedValue(JSON.stringify(issue()));

    await createGitHubIssueInboxSource(runner).capture(
      { issueNumber: 42, repository: 'other/repo' },
      '/workspace',
    );

    expect(runner).toHaveBeenCalledTimes(1);
    expect(runner.mock.calls[0][0]).toContain('other/repo');
  });

  it('rejects malformed and mismatched Issue responses', async () => {
    const malformed = createGitHubIssueInboxSource(
      vi.fn().mockResolvedValue('not-json'),
    );
    await expect(
      malformed.capture(
        { issueNumber: 42, repository: 'owner/evidence' },
        '/workspace',
      ),
    ).rejects.toThrow('invalid JSON');

    const mismatched = createGitHubIssueInboxSource(
      vi.fn().mockResolvedValue(JSON.stringify(issue({ number: 41 }))),
    );
    await expect(
      mismatched.capture(
        { issueNumber: 42, repository: 'owner/evidence' },
        '/workspace',
      ),
    ).rejects.toThrow('expected #42');
  });
});
