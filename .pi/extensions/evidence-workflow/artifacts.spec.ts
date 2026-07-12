import { afterEach, describe, expect, it } from 'vitest';
import {
  collectArtifacts,
  collectCodeFiles,
  ensureProjectDirs,
  missingPaths,
} from './artifacts';
import { cleanupWorkspaces, workspace, write } from './test-support';

afterEach(cleanupWorkspaces);

describe('artifacts', () => {
  it('creates an isolated artifact tree and discovers only source code', () => {
    const cwd = workspace();
    ensureProjectDirs(cwd, `${cwd}/artifacts/iterations/ITER-0001`);
    write(cwd, 'artifacts/iterations/ITER-0001/01-requirements/story.md');
    write(cwd, 'apps/web/src/app.tsx');
    write(cwd, 'apps/web/dist/app.js');

    expect(
      collectArtifacts(cwd, `${cwd}/artifacts/iterations/ITER-0001`),
    ).toEqual(['artifacts/iterations/ITER-0001/01-requirements/story.md']);
    expect(collectCodeFiles(cwd)).toEqual(['apps/web/src/app.tsx']);
  });

  it('reports empty files and directories as missing required outputs', () => {
    const cwd = workspace();
    write(cwd, 'empty.md', '');
    expect(missingPaths(cwd, ['empty.md', 'missing.md', 'missing/'])).toEqual([
      'empty.md',
      'missing.md',
      'missing/',
    ]);
  });
});
