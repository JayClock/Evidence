import { describe, expect, it, vi } from 'vitest';
import { readNxProjectCatalog } from './project-catalog';

describe('readNxProjectCatalog', () => {
  it('returns only sorted relative project identities and target names', async () => {
    const readGraph = vi.fn(async () =>
      JSON.stringify({
        graph: {
          nodes: {
            '@evidence/web': {
              data: {
                root: 'apps/web',
                targets: { build: { executor: 'secret' }, test: {} },
                sourceRoot: '/private/source/path',
              },
            },
            ':server-java:domain': {
              data: {
                root: 'libs/server-java/domain',
                targets: { build: {}, spotlessCheck: {}, test: {} },
              },
            },
          },
        },
      }),
    );

    const catalog = await readNxProjectCatalog(
      '/tmp/iteration-worktree',
      undefined,
      readGraph,
    );

    expect(catalog).toEqual({
      projects: [
        {
          id: ':server-java:domain',
          root: 'libs/server-java/domain',
          targets: ['build', 'spotlessCheck', 'test'],
        },
        {
          id: '@evidence/web',
          root: 'apps/web',
          targets: ['build', 'test'],
        },
      ],
    });
    expect(JSON.stringify(catalog)).not.toContain('/private/source/path');
  });

  it('rejects a project root that leaves the Iteration worktree', async () => {
    const readGraph = vi.fn(async () =>
      JSON.stringify({
        graph: {
          nodes: {
            unsafe: { data: { root: '../outside', targets: { test: {} } } },
          },
        },
      }),
    );

    await expect(
      readNxProjectCatalog('/tmp/iteration-worktree', undefined, readGraph),
    ).rejects.toThrow('leaves the Iteration worktree');
  });
});
