import { describe, expect, it } from 'vitest';
import {
  classifyCommandTermination,
  formatOutputDiagnostic,
  outputDiagnostic,
} from './observation-log';

describe('execution output diagnostics', () => {
  it('preserves a small multiline failure without ANSI control sequences', () => {
    const diagnostic = outputDiagnostic(
      '\u001b[31mcompile error\u001b[0m\nfile.ts:42\nassertion failed',
    );

    expect(diagnostic).toMatchObject({
      lines: 3,
      truncated: false,
      tail: '',
    });
    expect(diagnostic.head).toBe('compile error\nfile.ts:42\nassertion failed');
    expect(formatOutputDiagnostic(diagnostic)).toBe(diagnostic.head);
    expect(diagnostic.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('retains both the compiler prelude and the final assertion for long output', () => {
    const output = [
      'COMPILER: cannot resolve symbol',
      ...Array.from(
        { length: 800 },
        (_, index) => `trace ${index} ${'x'.repeat(20)}`,
      ),
      'ASSERTION: expected visible evidence but received none',
      'FAIL tests/evidence.spec.ts:99',
    ].join('\n');
    const diagnostic = outputDiagnostic(output);
    const summary = formatOutputDiagnostic(diagnostic);

    expect(diagnostic.truncated).toBe(true);
    expect(diagnostic.head).toContain('COMPILER: cannot resolve symbol');
    expect(diagnostic.tail).toContain(
      'ASSERTION: expected visible evidence but received none',
    );
    expect(diagnostic.tail).toContain('FAIL tests/evidence.spec.ts:99');
    expect(Buffer.byteLength(diagnostic.head, 'utf8')).toBeLessThanOrEqual(
      2 * 1024,
    );
    expect(Buffer.byteLength(diagnostic.tail, 'utf8')).toBeLessThanOrEqual(
      4 * 1024,
    );
    expect(Buffer.byteLength(summary, 'utf8')).toBeLessThanOrEqual(2 * 1024);
    expect(summary).toContain('FAIL tests/evidence.spec.ts:99');
  });

  it('does not split Unicode code points when bounding a long line', () => {
    const diagnostic = outputDiagnostic(`开始${'证'.repeat(10_000)}结束`);

    expect(diagnostic.truncated).toBe(true);
    expect(diagnostic.head).not.toContain('�');
    expect(diagnostic.tail).not.toContain('�');
    expect(diagnostic.tail).toContain('结束');
  });

  it('records empty streams without invented content', () => {
    expect(outputDiagnostic('')).toMatchObject({
      bytes: 0,
      lines: 0,
      head: '',
      tail: '',
      truncated: false,
    });
  });

  it('distinguishes exit, timeout, spawn error, and signal termination', () => {
    expect(
      classifyCommandTermination(
        { status: 2, signal: null, error: undefined },
        600_000,
      ),
    ).toEqual({ kind: 'exit', exit_code: 2 });
    expect(
      classifyCommandTermination(
        {
          status: null,
          signal: 'SIGTERM',
          error: Object.assign(new Error('command timed out'), {
            code: 'ETIMEDOUT',
          }),
        },
        600_000,
      ),
    ).toEqual({ kind: 'timeout', timeout_ms: 600_000, signal: 'SIGTERM' });
    expect(
      classifyCommandTermination(
        {
          status: null,
          signal: null,
          error: Object.assign(new Error('spawn failed'), { code: 'ENOENT' }),
        },
        600_000,
      ),
    ).toEqual({ kind: 'spawn_error', error_code: 'ENOENT' });
    expect(
      classifyCommandTermination(
        { status: null, signal: 'SIGKILL', error: undefined },
        600_000,
      ),
    ).toEqual({ kind: 'signal', signal: 'SIGKILL' });
  });
});
