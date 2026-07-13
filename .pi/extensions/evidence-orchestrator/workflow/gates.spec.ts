import { afterEach, describe, expect, it } from 'vitest';
import { answerGate, completePhase, resolvePendingGate } from './gates';
import { DEFAULT_STATE, PHASE_META } from './phase-catalog';
import { writeState } from './state-store';
import {
  cleanupWorkspaces,
  workspace,
  writeIterationArtifact,
} from '../tests/support';

afterEach(cleanupWorkspaces);

describe('gates', () => {
  it('returns a revise decision to the owning phase', () => {
    const cwd = workspace();
    writeState(cwd, {
      ...DEFAULT_STATE,
      gate_config: { ...DEFAULT_STATE.gate_config, frame: 'review' },
    });
    for (const output of PHASE_META.frame.outputs) {
      writeIterationArtifact(
        cwd,
        output.endsWith('/')
          ? `${output.slice('artifacts/'.length)}US-001.md`
          : output.slice('artifacts/'.length),
      );
    }
    completePhase(cwd, 'frame', 'review required');
    answerGate(cwd, 'GATE-101-frame', 'revise: clarify the scope');
    expect(resolvePendingGate(cwd)).toMatchObject({ phase: 'frame', round: 1 });
  });

  it('rejects completion when a required output is absent', () => {
    const cwd = workspace();
    writeState(cwd, DEFAULT_STATE);
    expect(() => completePhase(cwd, 'frame')).toThrow(
      'missing required outputs',
    );
  });
});
