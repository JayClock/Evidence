import { describe, expect, it } from 'vitest';
import { DEFAULT_STATE } from './default-state';
import { allowedLoopActions, transitionLoopState } from './transition-graph';
import { FEEDBACK_LOOP_BY_TARGET } from './feedback-routing';
import type { WorkflowLoop, WorkflowState } from './state';

function workflowState(loop: WorkflowLoop): WorkflowState {
  return {
    ...DEFAULT_STATE,
    loop,
  };
}

describe('knowledge-loop catalog', () => {
  it('advances through each loop using the native loop order', () => {
    let state = workflowState('kickoff');
    for (const expected of [
      'understand',
      'tasking',
      'pair',
      'showcase',
      'respond',
      'complete',
    ] as const) {
      if (state.loop === 'tasking') {
        state = { ...state, tasking_stage: 'approved' };
      }
      if (state.loop === 'pair') {
        state = {
          ...state,
          pair_session: {
            version: 2,
            story_id: 'US-001',
            scenario_ids: ['SC-001'],
            git_baseline: 'baseline',
            checkpoint: 'quality_gates_passed',
            task_id: 'TASK-001',
            test_id: 'TEST-001',
            process_id: 'process',
            step_id: 'step',
            completed_task_ids: ['TASK-001'],
            completed_test_ids: ['TEST-001'],
            completed_step_ids: ['process/step'],
            test_paths: ['tests/example.test.ts'],
            production_paths: ['src/example.ts'],
            expected_red: 'Behavior is absent.',
            accepted_reds: [],
            quality_gate_index: 1,
            feedback: [],
            driver_history: [],
            coding_decision: {
              version: 1,
              story_id: 'US-001',
              action: 'approve',
              reason: 'The complete coding evidence is accepted.',
              execution_manifest_path: 'manifest.json',
              execution_manifest_sha256: 'a'.repeat(64),
              artifact_path: 'coding-decision.json',
              decided_by: 'human',
              decided_at: '2026-01-01T00:00:00.000Z',
            },
          },
        };
      }
      if (state.loop === 'showcase') {
        state = { ...state, showcase_stage: 'accepted' };
      }
      if (state.loop === 'respond') {
        state = { ...state, respond_stage: 'complete' };
      }
      state = transitionLoopState(state, { to: expected });
      expect(state.loop).toBe(expected);
    }
  });

  it('blocks Tasking from entering Pair before human Desk Check approval', () => {
    expect(() =>
      transitionLoopState(workflowState('tasking'), { to: 'pair' }),
    ).toThrow('human-approved Desk Check');
  });

  it('blocks Pair from entering Showcase before final quality gates pass', () => {
    expect(() =>
      transitionLoopState(workflowState('pair'), { to: 'showcase' }),
    ).toThrow('every final quality gate passes');
  });

  it('blocks Showcase from entering Respond before human acceptance', () => {
    expect(() =>
      transitionLoopState(workflowState('showcase'), { to: 'respond' }),
    ).toThrow('human accept decision');
  });

  it('blocks Respond completion before human knowledge approval', () => {
    expect(() =>
      transitionLoopState(
        { ...workflowState('respond'), respond_stage: 'drafting' },
        { to: 'complete' },
      ),
    ).toThrow('human-approved knowledge response');
  });

  it('rejects a forward skip', () => {
    expect(() =>
      transitionLoopState(workflowState('kickoff'), { to: 'tasking' }),
    ).toThrow('kickoff -> tasking');
  });

  it('routes typed feedback to the activity that owns the knowledge gap', () => {
    const state = transitionLoopState(
      workflowState('showcase'),
      {
        to: 'understand',
        feedback: {
          target: 'model',
          reason: 'The model cannot explain the observed lifecycle.',
          decided_by: 'human',
        },
      },
      '2026-01-01T00:00:00.000Z',
    );

    expect(state.feedback_history).toEqual([
      {
        target: 'model',
        from_loop: 'showcase',
        to_loop: 'understand',
        reason: 'The model cannot explain the observed lifecycle.',
        decided_by: 'human',
        recorded_at: '2026-01-01T00:00:00.000Z',
      },
    ]);
  });

  it.each(Object.entries(FEEDBACK_LOOP_BY_TARGET))(
    'routes Showcase feedback target %s to %s',
    (target, destination) => {
      const state = transitionLoopState(workflowState('showcase'), {
        to: destination,
        feedback: {
          target: target as keyof typeof FEEDBACK_LOOP_BY_TARGET,
          reason: `Observed ${target} knowledge gap.`,
          decided_by: 'human',
        },
      });
      expect(state.loop).toBe(destination);
      expect(state.feedback_history?.at(-1)).toMatchObject({
        target,
        to_loop: destination,
        decided_by: 'human',
      });
    },
  );

  it('rejects feedback sent to the wrong loop or used as a forward action', () => {
    expect(() =>
      transitionLoopState(workflowState('showcase'), {
        to: 'pair',
        feedback: {
          target: 'model',
          reason: 'The model is incomplete.',
          decided_by: 'human',
        },
      }),
    ).toThrow('must route to understand');
    expect(() =>
      transitionLoopState(workflowState('understand'), {
        to: 'tasking',
        feedback: {
          target: 'test_process',
          reason: 'A process is needed.',
          decided_by: 'system',
        },
      }),
    ).toThrow('Feedback cannot move forward');
  });

  it('reports advance and feedback actions available from the current loop', () => {
    expect(allowedLoopActions('tasking')).toEqual(
      expect.arrayContaining([
        'advance:pair',
        'feedback:problem->kickoff',
        'feedback:model->understand',
        'feedback:test_process->tasking',
      ]),
    );
    expect(allowedLoopActions('complete')).toEqual([]);
  });
});
