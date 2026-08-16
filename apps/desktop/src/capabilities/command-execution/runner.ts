import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { localCommandEnvironment } from '../../adapters/node/command-environment';

const execFileAsync = promisify(execFile);
const SAFE_TOKEN = /^[A-Za-z0-9_@./:=-]+$/;
const MAX_TIMEOUT_MS = 30 * 60 * 1_000;
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;

export type PairCommandTermination =
  | 'exited'
  | 'timed_out'
  | 'signaled'
  | 'spawn_error';

export interface LockedPairCommand {
  command: string;
  executable: string;
  args: string[];
}

export interface PairCommandResult {
  command: string;
  executable: string;
  args: string[];
  termination: PairCommandTermination;
  exitCode: number | null;
  signal: string | null;
  durationMs: number;
  stdout: string;
  stderr: string;
  stdoutSha256: string;
  stdoutBytes: number;
  stdoutLines: number;
  stderrSha256: string;
  stderrBytes: number;
  stderrLines: number;
}

interface PairCommandOptions {
  cwd: string;
  timeoutMs: number;
  signal?: AbortSignal;
}

interface PairCommandExecutorOptions {
  cwd: string;
  encoding: 'utf8';
  env: NodeJS.ProcessEnv;
  maxBuffer: number;
  timeout: number;
  windowsHide: true;
  signal?: AbortSignal;
}

type PairCommandExecutor = (
  executable: string,
  args: string[],
  options: PairCommandExecutorOptions,
) => Promise<{ stdout: string; stderr: string }>;

export class PairCommandRunner {
  constructor(
    private readonly execute: PairCommandExecutor = executeFile,
    private readonly clock: () => number = Date.now,
  ) {}

  async run(
    commandInput: string,
    options: PairCommandOptions,
  ): Promise<PairCommandResult> {
    const command = parseLockedPairCommand(commandInput);
    const timeoutMs = normalizeTimeout(options.timeoutMs);
    const startedAt = this.clock();
    let stdout = '';
    let stderr = '';
    let termination: PairCommandTermination = 'exited';
    let exitCode: number | null = 0;
    let signal: string | null = null;

    try {
      const output = await this.execute(command.executable, command.args, {
        cwd: resolve(options.cwd),
        encoding: 'utf8',
        env: localCommandEnvironment(),
        maxBuffer: MAX_OUTPUT_BYTES,
        timeout: timeoutMs,
        windowsHide: true,
        ...(options.signal ? { signal: options.signal } : {}),
      });
      stdout = output.stdout;
      stderr = output.stderr;
    } catch (error) {
      const failure = commandFailure(error, timeoutMs, options.signal);
      stdout = failure.stdout;
      stderr = failure.stderr;
      termination = failure.termination;
      exitCode = failure.exitCode;
      signal = failure.signal;
    }

    return result(
      command,
      termination,
      exitCode,
      signal,
      Math.max(this.clock() - startedAt, 0),
      stdout,
      stderr,
    );
  }
}

export function parseLockedPairCommand(value: string): LockedPairCommand {
  const command = typeof value === 'string' ? value.trim() : '';
  if (!command || command !== value || /\s{2,}/.test(command)) {
    throw new Error('Pair command is not a canonical locked command.');
  }
  const tokens = command.split(' ');
  if (tokens.some((token) => !SAFE_TOKEN.test(token))) {
    throw new Error('Pair command contains an unsafe token.');
  }
  if (tokens[0] !== 'pnpm' || tokens[1] !== 'nx') {
    throw new Error('Pair command must use the locked pnpm Nx boundary.');
  }
  const nxCommand = tokens[2];
  if (nxCommand === 'test') {
    const project = tokens[3];
    const option = tokens[4];
    const filter = tokens[5];
    const fullJavaGate = tokens.length === 4 && project;
    const focusedJavaTest =
      tokens.length === 5 &&
      project &&
      option?.startsWith('--testClassName=') &&
      option !== '--testClassName=';
    const typescriptTest =
      (tokens.length === 5 || tokens.length === 6) &&
      project &&
      option === '--run' &&
      (filter === undefined ||
        (filter.startsWith('--testNamePattern=') &&
          filter !== '--testNamePattern='));
    if (!fullJavaGate && !focusedJavaTest && !typescriptTest) {
      throw new Error('Pair test command does not match the approved grammar.');
    }
    return locked(command, tokens.slice(1));
  }
  if (
    nxCommand === 'build' ||
    nxCommand === 'typecheck' ||
    nxCommand === 'lint'
  ) {
    if (tokens.length !== 4 || !tokens[3]) {
      throw new Error('Pair project gate does not match the approved grammar.');
    }
    return locked(command, tokens.slice(1));
  }
  if (
    nxCommand === 'run' &&
    tokens.length === 4 &&
    (tokens[3] === '@evidence/desktop:package-smoke' ||
      tokens[3]?.endsWith(':spotlessCheck'))
  ) {
    return locked(command, tokens.slice(1));
  }
  throw new Error('Pair command is outside the approved Nx grammar.');
}

function locked(command: string, args: string[]): LockedPairCommand {
  return {
    command,
    executable: process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    args,
  };
}

function normalizeTimeout(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_TIMEOUT_MS) {
    throw new Error('Pair command timeout is outside the bounded policy.');
  }
  return value;
}

function commandFailure(
  error: unknown,
  timeoutMs: number,
  abortSignal: AbortSignal | undefined,
): {
  termination: PairCommandTermination;
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
} {
  const failure = error as {
    code?: number | string | null;
    signal?: string | null;
    killed?: boolean;
    stdout?: string | Buffer;
    stderr?: string | Buffer;
    message?: string;
  };
  const stdout = outputText(failure.stdout);
  const stderr = outputText(failure.stderr);
  if (typeof failure.code === 'number') {
    return {
      termination: 'exited',
      exitCode: failure.code,
      signal: null,
      stdout,
      stderr,
    };
  }
  if (abortSignal?.aborted) {
    return {
      termination: 'signaled',
      exitCode: null,
      signal: failure.signal ?? 'SIGTERM',
      stdout,
      stderr,
    };
  }
  if (failure.killed && failure.signal) {
    return {
      termination: 'timed_out',
      exitCode: null,
      signal: failure.signal,
      stdout,
      stderr: stderr || `Command exceeded its ${String(timeoutMs)} ms timeout.`,
    };
  }
  if (failure.signal) {
    return {
      termination: 'signaled',
      exitCode: null,
      signal: failure.signal,
      stdout,
      stderr,
    };
  }
  return {
    termination: 'spawn_error',
    exitCode: null,
    signal: null,
    stdout,
    stderr: stderr || failure.message || 'Pair command could not start.',
  };
}

function result(
  command: LockedPairCommand,
  termination: PairCommandTermination,
  exitCode: number | null,
  signal: string | null,
  durationMs: number,
  stdout: string,
  stderr: string,
): PairCommandResult {
  return {
    command: command.command,
    executable: command.executable,
    args: command.args,
    termination,
    exitCode,
    signal,
    durationMs,
    stdout,
    stderr,
    stdoutSha256: digest(stdout),
    stdoutBytes: Buffer.byteLength(stdout),
    stdoutLines: lineCount(stdout),
    stderrSha256: digest(stderr),
    stderrBytes: Buffer.byteLength(stderr),
    stderrLines: lineCount(stderr),
  };
}

async function executeFile(
  executable: string,
  args: string[],
  options: PairCommandExecutorOptions,
): Promise<{ stdout: string; stderr: string }> {
  const output = await execFileAsync(executable, args, options);
  return {
    stdout: output.stdout,
    stderr: output.stderr,
  };
}

function outputText(value: string | Buffer | undefined): string {
  if (Buffer.isBuffer(value)) return value.toString('utf8');
  return typeof value === 'string' ? value : '';
}

function digest(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function lineCount(value: string): number {
  if (!value) return 0;
  const matches = value.match(/\n/g)?.length ?? 0;
  return matches + (value.endsWith('\n') ? 0 : 1);
}
