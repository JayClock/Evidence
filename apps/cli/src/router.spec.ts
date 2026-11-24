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
    expect(output.join('')).toContain('migrate-overlay');
    expect(output.join('')).not.toMatch(/api <command>|diff api/);
    expect(await dispatch(['nope'], context)).toBe(1);
    expect(errors.join('')).toContain('Unknown command');
    expect(await dispatch(['check', '--bad'], context)).toBe(1);
    expect(errors.join('')).toContain('Unknown option');
  });
  it('rejects retired commands instead of routing them to new commands', async () => {
    for (const args of [
      ['api', 'inspect'],
      ['api', 'migrate-overlay'],
      ['diff', 'api', 'base', 'target'],
      ['pack', '.evidence/model'],
      ['unpack', 'old.evidence.json'],
      ['check', 'old.evidence.json'],
      ['export', '--model', '.evidence/fm'],
      ['export', '--out', 'delivery'],
      ['timeline'],
      ['simulate'],
      ['role-play'],
    ]) {
      const { context, errors } = captureContext();
      expect(await dispatch(args, context), args.join(' ')).toBe(1);
      expect(errors).not.toEqual([]);
    }
  });

  it('rejects missing migration inputs and unsupported options', async () => {
    for (const args of [
      ['migrate-overlay', '--in', 'legacy.json'],
      ['migrate-overlay', '--out', 'new.json'],
      [
        'migrate-overlay',
        '--in',
        'legacy.json',
        '--out',
        'new.json',
        '--fm',
        'fm',
      ],
      ['migrate-overlay', '--in', 'legacy.json', '--out', 'a', '-o', 'b'],
    ]) {
      const { context, errors, output } = captureContext();
      expect(await dispatch(args, context), args.join(' ')).toBe(1);
      expect(errors).not.toEqual([]);
      expect(output).toEqual([]);
    }
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
    expect(
      await dispatch(['check', 'absent.evidence.json', '--json'], context),
    ).toBe(1);
    expect(JSON.parse(output[0]!)).toMatchObject({ passed: false });
    expect(errors).toEqual([]);
    expect(await dispatch(['check', '--json', '--json'], context)).toBe(1);
    expect(JSON.parse(output[1]!).error).toContain('Duplicate');
  });
});
