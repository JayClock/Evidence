import { afterEach, describe, expect, it } from 'vitest';
import {
  artifactRelativePath,
  assertIterationId,
  nextIterationId,
} from './iteration-paths';
import { DEFAULT_STATE } from './phase-catalog';
import { cleanupWorkspaces, workspace, write } from '../tests/support';

afterEach(cleanupWorkspaces);

describe('iteration', () => {
  it('resolves logical paths under the active immutable iteration', () => {
    expect(
      artifactRelativePath(
        DEFAULT_STATE,
        'artifacts/03-architecture/test-processes/rust.json',
      ),
    ).toBe(
      'artifacts/iterations/ITER-0001/03-architecture/test-processes/rust.json',
    );
  });

  it('validates identifiers and allocates the next identifier', () => {
    const cwd = workspace();
    write(cwd, 'artifacts/iterations/ITER-0007/seed.md');
    expect(nextIterationId(cwd)).toBe('ITER-0008');
    expect(() => assertIterationId('iteration-8')).toThrow(
      'Invalid Evidence Orchestrator iteration id',
    );
  });
});
