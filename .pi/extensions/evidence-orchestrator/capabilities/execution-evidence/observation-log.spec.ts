import { describe, expect, it } from 'vitest';
import { formatOutputDiagnostic, outputDiagnostic } from './observation-log';

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
});
