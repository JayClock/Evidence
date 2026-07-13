import { describe, expect, it, vi } from 'vitest';
import {
  listOpenGitHubIssues,
  selectOrCreateGitHubIssue,
} from './issue-picker';

describe('GitHub Issue picker', () => {
  it('lists open Issues from the current repository', async () => {
    const exec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([
        {
          number: 128,
          title: 'Improve iteration startup',
          updatedAt: '2026-07-13T08:00:00Z',
        },
      ]),
      stderr: '',
    });

    await expect(
      listOpenGitHubIssues({ exec } as never, '/workspace'),
    ).resolves.toEqual([
      {
        number: 128,
        title: 'Improve iteration startup',
        updatedAt: '2026-07-13T08:00:00Z',
      },
    ]);
    expect(exec).toHaveBeenCalledWith(
      'gh',
      [
        'issue',
        'list',
        '--state',
        'open',
        '--limit',
        '100',
        '--json',
        'number,title,updatedAt',
      ],
      { cwd: '/workspace', timeout: 10_000 },
    );
  });

  it('returns the Issue selected by the user', async () => {
    const exec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([
        {
          number: 128,
          title: 'Improve iteration startup',
          updatedAt: '2026-07-13T08:00:00Z',
        },
      ]),
      stderr: '',
    });
    const select = vi
      .fn()
      .mockResolvedValue('#128 Improve iteration startup · updated 2026-07-13');

    await expect(
      selectOrCreateGitHubIssue(
        { exec } as never,
        { cwd: '/workspace', hasUI: true, ui: { select } } as never,
      ),
    ).resolves.toBe(128);
    expect(select).toHaveBeenCalledWith(
      'Select or create a GitHub Issue for the new iteration',
      [
        '＋ Create a new GitHub Issue',
        '#128 Improve iteration startup · updated 2026-07-13',
      ],
    );
  });

  it('creates an Issue when the repository has no open Issues', async () => {
    const exec = vi
      .fn()
      .mockResolvedValueOnce({ code: 0, stdout: '[]', stderr: '' })
      .mockResolvedValueOnce({
        code: 0,
        stdout: 'https://github.com/owner/evidence/issues/129\n',
        stderr: '',
      });
    const input = vi.fn().mockResolvedValue('Add a new requirement');
    const editor = vi.fn().mockResolvedValue('The requirement details.');
    const select = vi.fn();

    await expect(
      selectOrCreateGitHubIssue(
        { exec } as never,
        {
          cwd: '/workspace',
          hasUI: true,
          ui: { select, input, editor },
        } as never,
      ),
    ).resolves.toBe(129);
    expect(select).not.toHaveBeenCalled();
    expect(exec).toHaveBeenLastCalledWith(
      'gh',
      [
        'issue',
        'create',
        '--title',
        'Add a new requirement',
        '--body',
        'The requirement details.',
      ],
      { cwd: '/workspace', timeout: 10_000 },
    );
  });

  it('creates an Issue when the create option is selected', async () => {
    const exec = vi
      .fn()
      .mockResolvedValueOnce({
        code: 0,
        stdout: JSON.stringify([
          {
            number: 128,
            title: 'Existing requirement',
            updatedAt: '2026-07-13T08:00:00Z',
          },
        ]),
        stderr: '',
      })
      .mockResolvedValueOnce({
        code: 0,
        stdout: 'https://github.com/owner/evidence/issues/129\n',
        stderr: '',
      });
    const select = vi.fn().mockResolvedValue('＋ Create a new GitHub Issue');
    const input = vi.fn().mockResolvedValue('Add a new requirement');
    const editor = vi.fn().mockResolvedValue('The requirement details.');

    await expect(
      selectOrCreateGitHubIssue(
        { exec } as never,
        {
          cwd: '/workspace',
          hasUI: true,
          ui: { select, input, editor },
        } as never,
      ),
    ).resolves.toBe(129);
  });

  it('reports gh failures with their stderr', async () => {
    const exec = vi.fn().mockResolvedValue({
      code: 1,
      stdout: '',
      stderr: 'authentication required',
    });

    await expect(
      listOpenGitHubIssues({ exec } as never, '/workspace'),
    ).rejects.toThrow('authentication required');
  });

  it('rejects malformed Issue data', async () => {
    const exec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([{ number: 128, title: 'Missing updatedAt' }]),
      stderr: '',
    });

    await expect(
      listOpenGitHubIssues({ exec } as never, '/workspace'),
    ).rejects.toThrow('malformed Issue data');
  });
});
