import { describe, expect, it, vi } from 'vitest';
import {
  PairCommandRunner,
  parseLockedPairCommand,
} from './pair-command-runner';

describe('PairCommandRunner', () => {
  it.each([
    [
      'pnpm nx test @evidence/desktop --run --testNamePattern=pair-controller',
      [
        'nx',
        'test',
        '@evidence/desktop',
        '--run',
        '--testNamePattern=pair-controller',
      ],
    ],
    [
      'pnpm nx test @evidence/server-domain --run',
      ['nx', 'test', '@evidence/server-domain', '--run'],
    ],
    [
      'pnpm nx typecheck @evidence/server-api',
      ['nx', 'typecheck', '@evidence/server-api'],
    ],
    [
      'pnpm nx lint @evidence/web-feature-delivery',
      ['nx', 'lint', '@evidence/web-feature-delivery'],
    ],
    [
      'pnpm nx run @evidence/desktop:package-smoke',
      ['nx', 'run', '@evidence/desktop:package-smoke'],
    ],
  ])('parses the exact approved Nx grammar: %s', (command, args) => {
    expect(parseLockedPairCommand(command)).toMatchObject({ command, args });
  });

  it.each([
    'pnpm nx test app --run; rm -rf .',
    'pnpm  nx test app --run',
    'pnpm nx build app',
    'npm run test',
    'pnpm nx run app:arbitrary',
    'pnpm nx test app --run --testNamePattern=',
    ' pnpm nx test app --run',
  ])('rejects a command outside the locked grammar: %s', (command) => {
    expect(() => parseLockedPairCommand(command)).toThrow();
  });

  it('executes without a shell and returns only bounded observation facts', async () => {
    let capturedOptions:
      | { env: NodeJS.ProcessEnv; shell?: unknown }
      | undefined;
    const execute = vi.fn(
      async (
        _executable: string,
        _args: string[],
        options: { env: NodeJS.ProcessEnv; shell?: unknown },
      ) => {
        capturedOptions = options;
        return { stdout: 'one\ntwo\n', stderr: '' };
      },
    );
    const times = [1_000, 1_025];
    const runner = new PairCommandRunner(execute, () => times.shift() ?? 1_025);

    const result = await runner.run(
      'pnpm nx test @evidence/desktop --run --testNamePattern=pair',
      { cwd: '/tmp/worktree', timeoutMs: 10_000 },
    );

    expect(execute).toHaveBeenCalledWith(
      process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
      ['nx', 'test', '@evidence/desktop', '--run', '--testNamePattern=pair'],
      expect.objectContaining({
        cwd: '/tmp/worktree',
        timeout: 10_000,
        windowsHide: true,
        env: expect.objectContaining({
          CI: '1',
          GIT_TERMINAL_PROMPT: '0',
        }),
      }),
    );
    expect(capturedOptions).not.toHaveProperty('shell');
    expect(capturedOptions?.env).not.toHaveProperty(
      'EVIDENCE_API_AUTHORIZATION',
    );
    expect(result).toMatchObject({
      termination: 'exited',
      exitCode: 0,
      durationMs: 25,
      stdout: 'one\ntwo\n',
      stdoutBytes: 8,
      stdoutLines: 2,
      stdoutSha256: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
    });
  });

  it('records a normal non-zero exit without converting it to a runtime error', async () => {
    const failure = Object.assign(new Error('test failed'), {
      code: 1,
      stdout: 'assertion failed\n',
      stderr: '',
    });
    const runner = new PairCommandRunner(
      vi.fn(async () => Promise.reject(failure)),
    );

    await expect(
      runner.run('pnpm nx test @evidence/desktop --run', {
        cwd: '/tmp/worktree',
        timeoutMs: 10_000,
      }),
    ).resolves.toMatchObject({
      termination: 'exited',
      exitCode: 1,
      signal: null,
      stdout: 'assertion failed\n',
    });
  });

  it('distinguishes timeout from signal and spawn failures', async () => {
    const timedOut = Object.assign(new Error('timed out'), {
      killed: true,
      signal: 'SIGTERM',
      stdout: '',
      stderr: '',
    });
    const runner = new PairCommandRunner(
      vi.fn(async () => Promise.reject(timedOut)),
    );

    await expect(
      runner.run('pnpm nx lint @evidence/desktop', {
        cwd: '/tmp/worktree',
        timeoutMs: 250,
      }),
    ).resolves.toMatchObject({
      termination: 'timed_out',
      exitCode: null,
      signal: 'SIGTERM',
      stderr: 'Command exceeded its 250 ms timeout.',
    });
  });
});
