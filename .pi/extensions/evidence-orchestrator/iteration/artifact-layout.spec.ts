import { describe, expect, it } from 'vitest';
import { artifactRelativePath, assertIterationId } from './artifact-layout';
import { DEFAULT_STATE } from './default-state';
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

  it('validates identifiers without allocating from artifact directories', () => {
    expect(() => assertIterationId('iteration-8')).toThrow(
      'Invalid Evidence Orchestrator iteration id',
    );
  });
});
