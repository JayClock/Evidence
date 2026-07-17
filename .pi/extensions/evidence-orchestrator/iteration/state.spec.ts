import { describe, expect, it } from 'vitest';
import { DEFAULT_STATE } from './default-state';
import { normalizeState } from './state-codec';
import {
  completedWorkItem,
  requireCompletedWorkItem,
  type CompletedWorkItem,
  type TestProcessSelection,
  type WorkflowState,
} from './state';

describe('types', () => {
  it('expresses a selected process inside a native Pair work item', () => {
    const selection: TestProcessSelection = {
      id: 'web-shell',
      path: 'artifacts/iterations/ITER-0001/03-architecture/selected-test-processes/web-shell.json',
      runtime: 'typescript',
      functional_contexts: ['workspace'],
      technical_boundaries: ['react-feature'],
      process_version: 3,
      definition_sha256: 'a'.repeat(64),
      selected_step_ids: ['unit'],
      project_ids: [],
      command_variables_by_test: {
        'TEST-001': { test_filter: 'workspace' },
      },
      focused_commands: [
        { test_id: 'TEST-001', step_id: 'unit', command: 'pnpm test' },
      ],
      quality_gate_commands: [{ command: 'pnpm test' }],
      materialized_sha256: 'b'.repeat(64),
    };
    const state: Pick<WorkflowState, 'iteration_id' | 'loop'> = {
      iteration_id: 'ITER-0001',
      loop: 'pair',
    };

    expect(selection.process_version).toBe(3);
    expect(state).toEqual({
      iteration_id: 'ITER-0001',
      loop: 'pair',
    });
  });

  it('exposes at most one completed Story through a singular accessor', () => {
    const item = { story_id: 'US-001' } as CompletedWorkItem;

    expect(completedWorkItem({ completed_work_items: [item] })).toBe(item);
    expect(completedWorkItem({})).toBeUndefined();
    expect(() => requireCompletedWorkItem({})).toThrow(
      'The Evidence iteration has no completed Story.',
    );
    expect(() =>
      completedWorkItem({ completed_work_items: [item, item] }),
    ).toThrow('An Evidence iteration can complete only one Story.');
    expect(() =>
      normalizeState({
        ...DEFAULT_STATE,
        completed_work_items: [item, item],
      }),
    ).toThrow('An Evidence iteration can complete only one Story.');
  });
});
