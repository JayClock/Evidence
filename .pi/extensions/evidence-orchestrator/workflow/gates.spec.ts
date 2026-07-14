import { afterEach, describe, expect, it } from 'vitest';
import { answerGate, completePhase, resolvePendingGate } from './gates';
import { DEFAULT_STATE } from './phase-catalog';
import { writeState } from './state-store';
import {
  cleanupWorkspaces,
  LEAN_STORY_CARD,
  workspace,
  writeIterationArtifact,
} from '../tests/support';

afterEach(cleanupWorkspaces);

function writeKickoffOutputs(cwd: string, story = LEAN_STORY_CARD): void {
  writeIterationArtifact(cwd, '01-kickoff/kickoff.md', '# Kickoff\n');
  writeIterationArtifact(cwd, '01-kickoff/story.md', story);
}

describe('feedback Gates', () => {
  it('creates the Kickoff human feedback point and supports revise', () => {
    const cwd = workspace();
    writeState(cwd, DEFAULT_STATE);
    writeKickoffOutputs(cwd);

    const advanced = completePhase(cwd, 'kickoff', 'Value ready for review');
    expect(advanced).toMatchObject({
      phase: 'discover',
      pending_gate: 'GATE-101-kickoff',
    });

    answerGate(cwd, 'GATE-101-kickoff', 'revise: narrow the value signal');
    expect(resolvePendingGate(cwd)).toMatchObject({
      phase: 'kickoff',
      round: 1,
      pending_gate: null,
    });
  });

  it('rejects completion when a required output is absent', () => {
    const cwd = workspace();
    writeState(cwd, DEFAULT_STATE);
    expect(() => completePhase(cwd, 'kickoff')).toThrow(
      'missing required outputs',
    );
  });

  it('rejects a Story Card that contains a prewritten question list', () => {
    const cwd = workspace();
    writeState(cwd, DEFAULT_STATE);
    writeKickoffOutputs(
      cwd,
      `${LEAN_STORY_CARD}\n## 待澄清问题\n\n1. 谁可以编辑？\n`,
    );
    expect(() => completePhase(cwd, 'kickoff')).toThrow(
      'forbidden section "待澄清问题"',
    );
  });
});
