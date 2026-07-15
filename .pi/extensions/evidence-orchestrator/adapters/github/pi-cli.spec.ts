import { describe, expect, it, vi } from 'vitest';
import { createGitHubCliRunner } from './pi-cli';

describe('GitHub CLI runner', () => {
  it('passes cancellation and timeout to Pi process execution', async () => {
    const signal = new AbortController().signal;
    const exec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: '{"nameWithOwner":"owner/repo"}',
      stderr: '',
    });

    await expect(
      createGitHubCliRunner({ exec } as never)(
        ['repo', 'view'],
        '/workspace',
        signal,
      ),
    ).resolves.toContain('owner/repo');
    expect(exec).toHaveBeenCalledWith('gh', ['repo', 'view'], {
      cwd: '/workspace',
      timeout: 10_000,
      signal,
    });
  });

  it('reports GitHub CLI failures', async () => {
    const exec = vi.fn().mockResolvedValue({
      code: 1,
      stdout: '',
      stderr: 'network unavailable',
    });

    await expect(
      createGitHubCliRunner({ exec } as never)([], '/workspace'),
    ).rejects.toThrow('network unavailable');
  });
});
