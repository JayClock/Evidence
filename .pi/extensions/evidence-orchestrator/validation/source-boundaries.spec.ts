import { afterEach, describe, expect, it } from 'vitest';
import { cleanupWorkspaces, workspace, write } from '../test-support/support';
import {
  RETIRED_SOURCE_ZONES,
  TARGET_SOURCE_ZONES,
  sourceBoundaryViolations,
  validateSourceBoundaries,
} from './source-boundaries';

afterEach(cleanupWorkspaces);

describe('semantic source boundaries', () => {
  it('defines active source zones and retired directories', () => {
    expect(TARGET_SOURCE_ZONES).toEqual([
      'iteration',
      'loops',
      'capabilities',
      'adapters',
      'validation',
      'test-support',
    ]);
    expect(RETIRED_SOURCE_ZONES).toEqual([
      'workflow',
      'requirements',
      'evidence',
      'testing',
      'runtime',
      'subagents',
      'tests',
      'compatibility',
    ]);
  });

  it('accepts the repository after retiring every technical-stage source directory', () => {
    expect(() =>
      validateSourceBoundaries(
        `${process.cwd()}/.pi/extensions/evidence-orchestrator`,
      ),
    ).not.toThrow();
  });

  it('rejects cross-loop private imports and adapter dependencies from loop code', () => {
    const root = workspace();
    write(root, 'loops/understand/state.ts', 'export const state = true;\n');
    write(root, 'adapters/pi/client.ts', 'export const client = true;\n');
    write(
      root,
      'loops/kickoff/candidate.ts',
      "import '../understand/state';\nimport '../../adapters/pi/client';\n",
    );

    expect(sourceBoundaryViolations(root)).toEqual([
      expect.objectContaining({
        source: 'loops/kickoff/candidate.ts',
        target: 'loops/understand/state.ts',
      }),
      expect.objectContaining({
        source: 'loops/kickoff/candidate.ts',
        target: 'adapters/pi/client.ts',
      }),
    ]);
  });

  it('allows a loop to consume another loop only through its explicit public contract', () => {
    const root = workspace();
    write(
      root,
      'loops/showcase/public.ts',
      'export const acceptedShowcase = true;\n',
    );
    write(
      root,
      'loops/respond/response.ts',
      "import { acceptedShowcase } from '../showcase/public';\nvoid acceptedShowcase;\n",
    );

    expect(sourceBoundaryViolations(root)).toEqual([]);
  });

  it('rejects production source that no extension or validator can reach', () => {
    const root = workspace();
    write(root, 'index.ts', "export { live } from './capabilities/live';\n");
    write(root, 'capabilities/live.ts', 'export const live = true;\n');
    write(root, 'capabilities/orphan.ts', 'export const orphan = true;\n');

    expect(sourceBoundaryViolations(root)).toEqual([
      {
        source: 'capabilities/orphan.ts',
        reason:
          'Production source is unreachable from an extension or validation entrypoint.',
      },
    ]);
  });

  it.each(['runtime', 'compatibility'])(
    'rejects the retired %s directory when it reappears',
    (directory) => {
      const root = workspace();
      write(root, `${directory}/entry.ts`, 'export const old = true;\n');

      expect(sourceBoundaryViolations(root)).toEqual([
        {
          source: `${directory}/entry.ts`,
          reason: 'Source remains in a retired directory.',
        },
      ]);
    },
  );
});
