import { describe, expect, it } from 'vitest';
import { workspace, write } from '../test-support/support';
import {
  evidenceCommandReferences,
  validateEvidenceCommandReferences,
} from './command-references';

describe('Evidence command references', () => {
  it('rejects stale command prose without treating repository paths as commands', () => {
    const cwd = workspace();
    const staleCommand = `/evidence-${'next'}`;
    write(
      cwd,
      '.pi/agents/reviewer.md',
      [
        'Run `/evidence-run` next.',
        `The old command is \`${staleCommand}\`.`,
        'Load `.pi/skills/evidence-pairing/SKILL.md`.',
      ].join('\n'),
    );

    expect(evidenceCommandReferences(cwd)).toEqual([
      {
        command: 'evidence-run',
        path: '.pi/agents/reviewer.md',
        line: 1,
      },
      {
        command: staleCommand.slice(1),
        path: '.pi/agents/reviewer.md',
        line: 2,
      },
    ]);
    expect(() => validateEvidenceCommandReferences(cwd)).toThrow(
      `.pi/agents/reviewer.md:2 ${staleCommand}`,
    );
  });

  it('accepts every registered Evidence command', () => {
    const cwd = workspace();
    write(
      cwd,
      '.pi/extensions/evidence-orchestrator/README.md',
      [
        '`/evidence-new` starts.',
        '`/evidence-inbox` extracts.',
        '`/evidence-explain-diff` explains.',
        '`/evidence-respond` completes.',
      ].join('\n'),
    );

    expect(() => validateEvidenceCommandReferences(cwd)).not.toThrow();
  });
});
