import { readFileSync, writeFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import {
  readState,
  readStateSnapshot,
  statePath,
} from '../iteration/state-repository';
import { statusMarkdown } from '../runtime/status';
import { cleanupWorkspaces, workspace, write } from './support';

afterEach(cleanupWorkspaces);

describe('immutable pre-v5 iteration reader', () => {
  it.each([
    { phase: 'complete', halted: undefined, terminal: 'complete' },
    {
      phase: 'review',
      halted: {
        phase: 'review',
        reason: 'Product owner stopped the iteration.',
        recorded_at: '2026-01-01T00:00:00.000Z',
      },
      terminal: 'halted',
    },
  ])('reads $terminal state without migration', (fixture) => {
    const cwd = workspace();
    const source = `${JSON.stringify(
      {
        iteration_id: 'ITER-0001',
        phase: fixture.phase,
        ...(fixture.halted ? { halted: fixture.halted } : {}),
        pi: { enabled: true, version: 4 },
      },
      null,
      2,
    )}\n`;
    writeFileSync(statePath(cwd), source);
    write(
      cwd,
      'artifacts/iterations/ITER-0001/05-code/US-001/SC-001.json',
      '{"hand_authored":true}\n',
    );

    expect(readStateSnapshot(cwd)).toMatchObject({
      workflow_version: 4,
      terminal: fixture.terminal,
    });
    expect(statusMarkdown(cwd)).toContain('immutable/read-only');
    expect(statusMarkdown(cwd)).toContain('SC-001.json');
    expect(() => readState(cwd)).toThrow('read-only');
    expect(readFileSync(statePath(cwd), 'utf8')).toBe(source);
    expect(
      readFileSync(
        `${cwd}/artifacts/iterations/ITER-0001/05-code/US-001/SC-001.json`,
        'utf8',
      ),
    ).toBe('{"hand_authored":true}\n');
  });

  it('rejects an active pre-v5 state rather than resuming or converting it', () => {
    const cwd = workspace();
    writeFileSync(
      statePath(cwd),
      `${JSON.stringify({ iteration_id: 'ITER-0001', phase: 'coding' })}\n`,
    );

    expect(() => readStateSnapshot(cwd)).toThrow('still active');
  });
});
