import { afterEach, describe, expect, it } from 'vitest';
import { answerGate, completePhase, resolvePendingGate } from './gates';
import { DEFAULT_STATE, PHASE_META } from './phase-catalog';
import { writeState } from './state-store';
import {
  cleanupWorkspaces,
  LEAN_STORY_CARD,
  workspace,
  writeIterationArtifact,
} from '../tests/support';

afterEach(cleanupWorkspaces);

function writeFrameOutputs(cwd: string, storyCard = LEAN_STORY_CARD): void {
  for (const output of PHASE_META.frame.outputs) {
    writeIterationArtifact(
      cwd,
      output.endsWith('/')
        ? `${output.slice('artifacts/'.length)}US-001.md`
        : output.slice('artifacts/'.length),
      output.endsWith('/') ? storyCard : 'content',
    );
  }
}

describe('gates', () => {
  it('returns a revise decision to the owning phase', () => {
    const cwd = workspace();
    writeState(cwd, {
      ...DEFAULT_STATE,
      gate_config: { ...DEFAULT_STATE.gate_config, frame: 'review' },
    });
    writeFrameOutputs(cwd);
    completePhase(cwd, 'frame', 'review required');
    answerGate(cwd, 'GATE-101-frame', 'revise: clarify the scope');
    expect(resolvePendingGate(cwd)).toMatchObject({ phase: 'frame', round: 1 });
  });

  it('reserves v5 Kickoff completion for the human decision', () => {
    const cwd = workspace();
    writeState(cwd, {
      ...DEFAULT_STATE,
      workflow_version: 5,
      loop: 'kickoff',
    });
    writeFrameOutputs(cwd);

    expect(() => completePhase(cwd, 'frame')).toThrow(
      'Only a human /evidence-kickoff confirmation',
    );
  });

  it('does not split v5 Understand into clarify, specify, or validate completion', () => {
    const cwd = workspace();
    writeState(cwd, {
      ...DEFAULT_STATE,
      workflow_version: 5,
      loop: 'understand',
      phase: 'clarify',
      understand_stage: 'tqa',
    });

    expect(() => completePhase(cwd, 'clarify')).toThrow(
      'Only a human /evidence-scenario decision',
    );
  });

  it('rejects completion when a required output is absent', () => {
    const cwd = workspace();
    writeState(cwd, DEFAULT_STATE);
    expect(() => completePhase(cwd, 'frame')).toThrow(
      'missing required outputs',
    );
  });

  it('rejects a story card that mixes Card with clarification content', () => {
    const cwd = workspace();
    writeState(cwd, DEFAULT_STATE);
    writeFrameOutputs(
      cwd,
      `${LEAN_STORY_CARD}\n## 待澄清问题\n\n1. 谁可以编辑？\n`,
    );

    expect(() => completePhase(cwd, 'frame')).toThrow(
      'forbidden section "待澄清问题"',
    );
  });
});
