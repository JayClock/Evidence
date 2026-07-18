import { afterEach, describe, expect, it } from 'vitest';
import {
  collectArtifacts,
  ensureProjectDirs,
  missingPaths,
} from './artifact-inventory';
import { cleanupWorkspaces, workspace, write } from '../test-support/support';

afterEach(cleanupWorkspaces);

describe('artifacts', () => {
  it('creates and inventories one isolated artifact tree', () => {
    const cwd = workspace();
    ensureProjectDirs(cwd, `${cwd}/artifacts/iterations/ITER-0001`);
    write(cwd, 'artifacts/iterations/ITER-0001/01-requirements/story.md');
    write(cwd, 'artifacts/iterations/ITER-0001/activity-trace.jsonl');

    expect(
      collectArtifacts(cwd, `${cwd}/artifacts/iterations/ITER-0001`),
    ).toEqual([
      'artifacts/iterations/ITER-0001/01-requirements/story.md',
      'artifacts/iterations/ITER-0001/activity-trace.jsonl',
    ]);
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
