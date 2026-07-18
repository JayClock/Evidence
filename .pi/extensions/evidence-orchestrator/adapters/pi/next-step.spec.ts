import { describe, expect, it } from 'vitest';
import { DEFAULT_STATE } from '../../iteration/default-state';
import { nextStepGuidance } from './next-step';

describe('multi-Story next step guidance', () => {
  it('addresses every Story command with the State Iteration id', () => {
    expect(nextStepGuidance('/unused', DEFAULT_STATE)).toContain(
      '/evidence-run ITER-0001',
    );
    expect(
      nextStepGuidance('/unused', {
        ...DEFAULT_STATE,
        kickoff_candidate: {
          version: 1,
          title: 'Candidate',
          problem: 'Problem',
          role: 'Owner',
          goal: 'Goal',
          value: 'Value',
          cognitive_mode: 'clear',
          source_refs: ['INBOX-0001'],
          proposed_at: '2026-01-01T00:00:00.000Z',
          artifact_path: 'candidate.json',
        },
      }),
    ).toContain('/evidence-kickoff ITER-0001');
    expect(
      nextStepGuidance('/unused', {
        ...DEFAULT_STATE,
        loop: 'tasking',
        tasking_stage: 'desk_check',
      }),
    ).toContain('/evidence-desk-check ITER-0001');
    expect(
      nextStepGuidance('/unused', {
        ...DEFAULT_STATE,
        loop: 'respond',
        respond_stage: 'decision',
      }),
    ).toContain('/evidence-respond ITER-0001');
  });

  it('addresses a clarification answer with both Iteration and question ids', () => {
    const guidance = nextStepGuidance('/unused', {
      ...DEFAULT_STATE,
      loop: 'understand',
      understand_stage: 'tqa',
      pending_clarification: {
        question_id: 'Q-007',
        story_id: 'US-001',
        question: 'Who confirms it?',
        target: 'history',
        asked_at: '2026-01-01T00:00:00.000Z',
      },
    });

    expect(guidance).toContain('/evidence-answer ITER-0001 Q-007 <answer>');
  });
});
