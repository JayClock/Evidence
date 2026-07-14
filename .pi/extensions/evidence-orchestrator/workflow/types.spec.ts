import { describe, expect, it } from 'vitest';
import type { TestProcessSelection, WorkflowState } from './types';

describe('types', () => {
  it('expresses a selected process as immutable Build work-item state', () => {
    const selection: TestProcessSelection = {
      id: 'web-shell',
      path: 'artifacts/iterations/ITER-0001/04-design/selected-test-processes/web-shell.json',
      runtime: 'typescript',
      functional_contexts: ['web-shell'],
    };
    const state: Pick<WorkflowState, 'iteration_id' | 'phase'> = {
      iteration_id: 'ITER-0001',
      phase: 'build',
    };
    expect(selection.runtime).toBe('typescript');
    expect(state.phase).toBe('build');
  });
});
