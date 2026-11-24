import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dispatch } from './router.js';
import type { CommandContext } from './context.js';

const cwd = fileURLToPath(new URL('../../../', import.meta.url));
export function captureContext(root = cwd) {
  const output: string[] = [],
    errors: string[] = [];
  const context: CommandContext = {
    cwd: root,
    stdout: (text) => output.push(text),
    stderr: (text) => errors.push(text),
    color: false,
  };
  return { context, output, errors };
}

describe('unified CLI dispatch', () => {
  it('shows help and reports unknown commands and options', async () => {
    const { context, output, errors } = captureContext();
    expect(await dispatch(['--help'], context)).toBe(0);
    expect(output.join('')).toContain('Usage: evidence <command> [options]');
    expect(await dispatch(['nope'], context)).toBe(1);
    expect(errors.join('')).toContain('Unknown command');
    expect(await dispatch(['check', '--bad'], context)).toBe(1);
    expect(errors.join('')).toContain('Unknown option');
  });

  it('discovers the nearest workspace from a project subdirectory', async () => {
    const { context, output } = captureContext(
      new URL(
        '../../../examples/b2b-escrow/.evidence/model/entities',
        import.meta.url,
      ).pathname,
    );
    expect(await dispatch(['check', '--json'], context)).toBe(0);
    expect(JSON.parse(output[0]!)).toMatchObject({ valid: true });
  });
  it('returns machine-readable errors and rejects duplicate arguments', async () => {
    const { context, output, errors } = captureContext();
    expect(await dispatch(['check', 'extra', '--json'], context)).toBe(1);
    expect(JSON.parse(output[0]!)).toMatchObject({
      passed: false,
      error: expect.stringContaining('Unexpected arguments'),
    });
    expect(errors).toEqual([]);
    expect(await dispatch(['check', '--json', '--json'], context)).toBe(1);
    expect(JSON.parse(output[1]!).error).toContain('Duplicate');
  });
});
