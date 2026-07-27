import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  captureManualText,
  captureOpenGitHubIssues,
  captureRepositoryMarkdown,
} from './inbox-source-adapters';
import { runGit } from './git-repository';

const temporaryPaths: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryPaths
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

async function repository() {
  const root = await mkdtemp(join(tmpdir(), 'evidence-inbox-source-'));
  temporaryPaths.push(root);
  await runGit(root, ['init']);
  await runGit(root, ['config', 'user.email', 'test@example.com']);
  await runGit(root, ['config', 'user.name', 'Evidence Test']);
  await writeFile(join(root, 'README.md'), '# Repository\n', 'utf8');
  await runGit(root, ['add', 'README.md']);
  await runGit(root, ['commit', '-m', 'test: initialize repository']);
  return root;
}

describe('manual Inbox source adapter', () => {
  it('derives a stable identity from normalized provider-neutral content', () => {
    const first = captureManualText({
      title: ' Requirement ',
      body: 'First line\r\nSecond line',
      contentType: 'text/markdown',
    });
    const replay = captureManualText({
      title: 'Requirement',
      body: 'First line\nSecond line',
      contentType: 'text/markdown',
    });

    expect(first).toEqual(replay);
    expect(first).toMatchObject({
      sourceKind: 'manual_text',
      externalKey: expect.stringMatching(/^manual:[a-f0-9]{64}$/),
      title: 'Requirement',
      body: 'First line\nSecond line',
      uri: null,
      providerMetadata: {},
    });
    expect(
      captureManualText({ title: 'Requirement', body: 'Changed' }).externalKey,
    ).not.toBe(first.externalKey);
  });
});

describe('repository Markdown Inbox source adapter', () => {
  it('uploads only a repository-relative identity and normalized body', async () => {
    const root = await repository();
    await mkdir(join(root, 'requirements'));
    await writeFile(
      join(root, 'requirements', 'coding.md'),
      '# Local coding\r\n\r\nKeep source local.\r\n',
      'utf8',
    );

    const capture = await captureRepositoryMarkdown({
      repositoryRoot: root,
      relativePath: './requirements/coding.md',
    });

    expect(capture).toMatchObject({
      sourceKind: 'local_markdown',
      externalKey: 'workspace:requirements/coding.md',
      title: 'Local coding',
      body: '# Local coding\n\nKeep source local.\n',
      contentType: 'text/markdown',
      uri: null,
      providerMetadata: { relativePath: 'requirements/coding.md' },
      sourceUpdatedAt: expect.stringMatching(/Z$/),
    });
    expect(JSON.stringify(capture)).not.toContain(root);
  });

  it('rejects traversal, non-Markdown, symlink escape, and oversized content', async () => {
    const root = await repository();
    await expect(
      captureRepositoryMarkdown({
        repositoryRoot: root,
        relativePath: '../outside.md',
      }),
    ).rejects.toThrow('repository-relative');
    await expect(
      captureRepositoryMarkdown({
        repositoryRoot: root,
        relativePath: 'README.txt',
      }),
    ).rejects.toThrow('.md or .markdown');

    const outside = await mkdtemp(join(tmpdir(), 'evidence-outside-'));
    temporaryPaths.push(outside);
    await writeFile(join(outside, 'secret.md'), '# Secret\n', 'utf8');
    await symlink(join(outside, 'secret.md'), join(root, 'escape.md'));
    await expect(
      captureRepositoryMarkdown({
        repositoryRoot: root,
        relativePath: 'escape.md',
      }),
    ).rejects.toThrow('escapes the bound repository');

    await writeFile(join(root, 'large.md'), 'a'.repeat(1024 * 1024 + 1));
    await expect(
      captureRepositoryMarkdown({
        repositoryRoot: root,
        relativePath: 'large.md',
      }),
    ).rejects.toThrow('1 MiB');
  });
});

describe('GitHub Issue Inbox source adapter', () => {
  it('imports every open Issue from the bound Workspace origin', async () => {
    const root = await repository();
    await runGit(root, [
      'remote',
      'add',
      'origin',
      'git@github.com:Earendil/Evidence.git',
    ]);
    const runner = vi.fn(async () =>
      JSON.stringify([
        {
          number: 42,
          title: 'Desktop Inbox',
          body: 'Capture this requirement.',
          url: 'https://github.com/earendil/evidence/issues/42',
          updatedAt: '2026-01-01T08:00:00+08:00',
          state: 'OPEN',
          labels: [{ name: 'feature' }, { name: 'desktop' }],
        },
        {
          number: 43,
          title: 'Empty description',
          body: '',
          url: 'https://github.com/earendil/evidence/issues/43',
          updatedAt: '2026-01-02T00:00:00Z',
          state: 'OPEN',
          labels: [],
        },
      ]),
    );

    const captures = await captureOpenGitHubIssues(
      { repositoryRoot: root },
      runner,
    );

    expect(runner).toHaveBeenCalledWith('gh', [
      'issue',
      'list',
      '--repo',
      'Earendil/Evidence',
      '--state',
      'open',
      '--limit',
      '2147483647',
      '--json',
      'number,title,body,url,updatedAt,state,labels',
    ]);
    expect(captures).toEqual([
      {
        sourceKind: 'github_issue',
        externalKey: 'github:earendil/evidence#42',
        title: 'Desktop Inbox',
        body: 'Capture this requirement.',
        contentType: 'text/markdown',
        uri: 'https://github.com/earendil/evidence/issues/42',
        providerMetadata: {
          repository: 'earendil/evidence',
          number: 42,
          state: 'open',
          labels: ['feature', 'desktop'],
        },
        sourceUpdatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        sourceKind: 'github_issue',
        externalKey: 'github:earendil/evidence#43',
        title: 'Empty description',
        body: '# Empty description\n',
        contentType: 'text/markdown',
        uri: 'https://github.com/earendil/evidence/issues/43',
        providerMetadata: {
          repository: 'earendil/evidence',
          number: 43,
          state: 'open',
          labels: [],
        },
        sourceUpdatedAt: '2026-01-02T00:00:00.000Z',
      },
    ]);
  });

  it('returns an empty import when the repository has no open Issues', async () => {
    const root = await repository();
    await runGit(root, [
      'remote',
      'add',
      'origin',
      'https://github.com/earendil/evidence.git',
    ]);

    await expect(
      captureOpenGitHubIssues({ repositoryRoot: root }, async () => '[]'),
    ).resolves.toEqual([]);
  });

  it('rejects a provider response that changes source identity', async () => {
    const root = await repository();
    await runGit(root, [
      'remote',
      'add',
      'origin',
      'https://github.com/earendil/evidence.git',
    ]);

    await expect(
      captureOpenGitHubIssues({ repositoryRoot: root }, async () =>
        JSON.stringify([
          {
            number: 42,
            title: 'Different repository',
            body: 'Wrong identity.',
            url: 'https://github.com/other/evidence/issues/42',
            updatedAt: '2026-01-01T00:00:00Z',
            state: 'OPEN',
            labels: [],
          },
        ]),
      ),
    ).rejects.toThrow('identity changed');
  });

  it('rejects a bound Workspace without a github.com origin', async () => {
    const root = await repository();
    await runGit(root, [
      'remote',
      'add',
      'origin',
      'https://gitlab.com/earendil/evidence.git',
    ]);

    await expect(
      captureOpenGitHubIssues({ repositoryRoot: root }),
    ).rejects.toThrow('must point to github.com');
  });
});
