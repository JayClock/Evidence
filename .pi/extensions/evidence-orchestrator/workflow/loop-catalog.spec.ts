import { describe, expect, it } from 'vitest';
import { DEFAULT_STATE } from './phase-catalog';
import {
  allowedLoopActions,
  compatibilityPhaseForLoop,
  FEEDBACK_LOOP_BY_TARGET,
  loopForCompatibilityPhase,
  transitionLoopState,
} from './loop-catalog';
import type { WorkflowLoop, WorkflowState } from './types';

function v5State(loop: WorkflowLoop): WorkflowState {
  return {
    ...DEFAULT_STATE,
    workflow_version: 5,
    loop,
    phase: compatibilityPhaseForLoop(loop),
  };
}

describe('v5 knowledge-loop catalog', () => {
  it('advances through each loop without using the legacy phase order', () => {
    let state = v5State('kickoff');
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
            version: 1,
            story_id: 'US-001',
            scenario_id: 'SC-001',
            git_baseline: 'baseline',
            checkpoint: 'quality_gates_passed',
            process_id: 'process',
            step_id: 'step',
            completed_step_ids: ['process/step'],
            test_paths: ['tests/example.test.ts'],
            production_paths: ['src/example.ts'],
            expected_red: 'Behavior is absent.',
            accepted_reds: [],
            quality_gate_index: 1,
            feedback: [],
            driver_history: [],
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
      expect(state.phase).toBe(compatibilityPhaseForLoop(expected));
    }
  });

  it('blocks Tasking from entering Pair before human Desk Check approval', () => {
    expect(() =>
      transitionLoopState(v5State('tasking'), { to: 'pair' }),
    ).toThrow('human-approved Desk Check');
  });

  it('blocks Pair from entering Showcase before final quality gates pass', () => {
    expect(() =>
      transitionLoopState(v5State('pair'), { to: 'showcase' }),
    ).toThrow('every final quality gate passes');
  });

  it('blocks Showcase from entering Respond before human acceptance', () => {
    expect(() =>
      transitionLoopState(v5State('showcase'), { to: 'respond' }),
    ).toThrow('human accept decision');
  });

  it('blocks Respond completion before human knowledge approval', () => {
    expect(() =>
      transitionLoopState(
        { ...v5State('respond'), respond_stage: 'drafting' },
        { to: 'complete' },
      ),
    ).toThrow('human-approved knowledge response');
  });

  it('rejects a forward skip', () => {
    expect(() =>
      transitionLoopState(v5State('kickoff'), { to: 'tasking' }),
    ).toThrow('kickoff -> tasking');
  });

  it('routes typed feedback to the activity that owns the knowledge gap', () => {
    const state = transitionLoopState(
      v5State('showcase'),
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
      const state = transitionLoopState(v5State('showcase'), {
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
      transitionLoopState(v5State('showcase'), {
        to: 'pair',
        feedback: {
          target: 'model',
          reason: 'The model is incomplete.',
          decided_by: 'human',
        },
      }),
    ).toThrow('must route to understand');
    expect(() =>
      transitionLoopState(v5State('understand'), {
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

  it('keeps the temporary phase projection inside one knowledge activity', () => {
    expect(loopForCompatibilityPhase('frame')).toBe('kickoff');
    expect(loopForCompatibilityPhase('clarify')).toBe('understand');
    expect(loopForCompatibilityPhase('specify')).toBe('understand');
    expect(loopForCompatibilityPhase('domain_model')).toBe('understand');
    expect(loopForCompatibilityPhase('planning')).toBe('tasking');
    expect(loopForCompatibilityPhase('coding')).toBe('pair');
  });

  it('does not transition a legacy v4 state', () => {
    expect(() =>
      transitionLoopState(DEFAULT_STATE, { to: 'understand' }),
    ).toThrow('Only a v5 workflow');
  });
});
