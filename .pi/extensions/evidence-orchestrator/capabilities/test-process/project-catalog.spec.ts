import { describe, expect, it } from 'vitest';
import {
  assertNxProjectCatalog,
  assertProjectHasTarget,
  assertTestProject,
  createNxProjectCatalog,
  readNxProjectCatalog,
  resolveNxProjectOwner,
  type NxProjectCommandRunner,
} from './project-catalog';

describe('Nx project catalog', () => {
  it('canonicalizes names, roots, and inferred target names before hashing', () => {
    const first = createNxProjectCatalog([
      {
        name: '@evidence/web',
        root: './apps/web/',
        sourceRoot: './apps/web/src/',
        targetNames: ['typecheck', 'test', 'lint'],
      },
      {
        name: 'api-client',
        root: 'libs/web/api-client',
        targetNames: ['lint', 'test'],
      },
    ]);
    const second = createNxProjectCatalog([
      {
        name: 'api-client',
        root: 'libs/web/api-client',
        targetNames: ['test', 'lint'],
      },
      {
        name: '@evidence/web',
        root: 'apps/web',
        sourceRoot: 'apps/web/src',
        targetNames: ['lint', 'typecheck', 'test'],
      },
    ]);

    expect(first).toEqual(second);
    expect(first.projects.map(({ name }) => name)).toEqual([
      '@evidence/web',
      'api-client',
    ]);
    expect(first.project_catalog_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(() =>
      assertNxProjectCatalog({
        ...first,
        project_catalog_sha256: '0'.repeat(64),
      }),
    ).toThrow('hash drifted');
  });

  it('uses the unique longest project-root prefix for path ownership', () => {
    const catalog = createNxProjectCatalog([
      {
        name: '@evidence/source',
        root: '.',
        targetNames: ['test'],
      },
      {
        name: '@evidence/web-libs',
        root: 'libs/web',
        targetNames: ['test'],
      },
      {
        name: 'api-client',
        root: 'libs/web/api-client',
        targetNames: ['test'],
      },
    ]);

    expect(
      resolveNxProjectOwner(
        catalog,
        'libs/web/api-client/src/lib/api-client.spec.ts',
      ).name,
    ).toBe('api-client');
    expect(resolveNxProjectOwner(catalog, 'nx.json').name).toBe(
      '@evidence/source',
    );

    const ambiguous = createNxProjectCatalog([
      { name: 'one', root: 'libs/shared', targetNames: ['test'] },
      { name: 'two', root: 'libs/shared', targetNames: ['test'] },
    ]);
    expect(() =>
      resolveNxProjectOwner(ambiguous, 'libs/shared/src/value.spec.ts'),
    ).toThrow('Multiple selected Nx projects own path');
  });

  it('rejects missing targets, unrelated nearest-test roots, and root ownership', () => {
    const catalog = createNxProjectCatalog([
      {
        name: '@evidence/server-nest-api',
        root: 'libs/server-nest/api',
        targetNames: ['lint', 'typecheck'],
      },
      {
        name: '@evidence/web',
        root: 'apps/web',
        targetNames: ['lint', 'test', 'typecheck'],
      },
      {
        name: '@evidence/source',
        root: '.',
        targetNames: ['test'],
      },
    ]);

    expect(() =>
      assertTestProject(catalog, '@evidence/server-nest-api', [
        'libs/server-nest/api/src',
      ]),
    ).toThrow('has no test target');
    expect(() =>
      assertTestProject(catalog, '@evidence/web', ['libs/web']),
    ).toThrow('does not intersect');
    expect(() =>
      assertTestProject(catalog, '@evidence/source', ['apps/web/src']),
    ).toThrow('Workspace-root Nx project');
    const web = catalog.projects.find(({ name }) => name === '@evidence/web');
    if (!web) throw new Error('Web fixture project is missing.');
    expect(() => assertProjectHasTarget(web, 'build;rm')).toThrow(
      'unsafe Nx target',
    );
  });

  it('loads only graph-confirmed projects through resolved Nx configuration', () => {
    const calls: string[][] = [];
    const runner: NxProjectCommandRunner = (_cwd, args) => {
      calls.push([...args]);
      if (args[0] === 'graph') {
        return JSON.stringify({
          graph: {
            nodes: {
              '@evidence/web': {},
              'api-client': {},
            },
          },
        });
      }
      const id = args[2];
      if (id === '@evidence/web') {
        return JSON.stringify({
          name: id,
          root: 'apps/web',
          sourceRoot: 'apps/web/src',
          targets: { test: {}, lint: {}, typecheck: {} },
        });
      }
      return JSON.stringify({
        name: id,
        root: 'libs/web/api-client',
        sourceRoot: 'libs/web/api-client/src',
        targets: { test: {}, lint: {} },
      });
    };

    const catalog = readNxProjectCatalog(
      '/workspace',
      ['api-client', '@evidence/web'],
      runner,
    );

    expect(calls).toEqual([
      ['graph', '--print'],
      ['show', 'project', '@evidence/web', '--json'],
      ['show', 'project', 'api-client', '--json'],
    ]);
    expect(catalog.projects).toEqual([
      {
        name: '@evidence/web',
        root: 'apps/web',
        sourceRoot: 'apps/web/src',
        targetNames: ['lint', 'test', 'typecheck'],
      },
      {
        name: 'api-client',
        root: 'libs/web/api-client',
        sourceRoot: 'libs/web/api-client/src',
        targetNames: ['lint', 'test'],
      },
    ]);
  });

  it('reads Web and Nest ownership from this workspace resolved graph', () => {
    const catalog = readNxProjectCatalog(process.cwd(), [
      '@evidence/web',
      '@evidence/web-feature-diagrams',
      'api-client',
      '@evidence/server-nest',
      '@evidence/server-nest-domain',
      '@evidence/server-nest-persistent',
      '@evidence/server-nest-api',
    ]);
    const byName = new Map(
      catalog.projects.map((project) => [project.name, project]),
    );

    expect(byName.get('@evidence/web')).toMatchObject({
      root: 'apps/web',
      sourceRoot: 'apps/web/src',
      targetNames: expect.arrayContaining(['test', 'typecheck', 'lint']),
    });
    expect(byName.get('@evidence/web-feature-diagrams')).toMatchObject({
      root: 'libs/web/web-feature-diagrams',
      targetNames: expect.arrayContaining(['test', 'typecheck', 'lint']),
    });
    expect(byName.get('api-client')).toMatchObject({
      root: 'libs/web/api-client',
      targetNames: expect.arrayContaining(['test', 'typecheck', 'lint']),
    });
    expect(byName.get('@evidence/server-nest-domain')?.targetNames).toEqual(
      expect.arrayContaining(['test', 'typecheck', 'lint']),
    );
    expect(byName.get('@evidence/server-nest-persistent')?.targetNames).toEqual(
      expect.arrayContaining(['test', 'typecheck', 'lint']),
    );
    expect(byName.get('@evidence/server-nest')?.targetNames).toContain('test');
    expect(byName.get('@evidence/server-nest-api')?.targetNames).not.toContain(
      'test',
    );
  }, 30_000);

  it('rejects unsafe or missing project ids before accepting resolved output', () => {
    const runner: NxProjectCommandRunner = () =>
      JSON.stringify({ graph: { nodes: {} } });

    expect(() =>
      readNxProjectCatalog('/workspace', ['web;rm'], runner),
    ).toThrow('unsafe Nx project id');
    expect(() =>
      readNxProjectCatalog('/workspace', ['missing'], runner),
    ).toThrow('does not contain: missing');
  });
});
