import { describe, expect, it } from 'vitest';
import type { TestProcessSelection, WorkflowState } from './state';

describe('types', () => {
  it('expresses a selected process inside a native Pair work item', () => {
    const selection: TestProcessSelection = {
      id: 'web-shell',
      path: 'artifacts/iterations/ITER-0001/03-architecture/selected-test-processes/web-shell.json',
      runtime: 'typescript',
      functional_contexts: ['workspace'],
      technical_boundaries: ['react-feature'],
      process_version: 2,
    };
    const state: Pick<
      WorkflowState,
      'iteration_id' | 'workflow_version' | 'loop'
    > = {
      iteration_id: 'ITER-0001',
      workflow_version: 5,
      loop: 'pair',
    };

    expect(selection.process_version).toBe(2);
    expect(state).toEqual({
      iteration_id: 'ITER-0001',
      workflow_version: 5,
      loop: 'pair',
    });
  });
});
