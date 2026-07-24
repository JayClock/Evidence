import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const GATES = ['lint', 'typecheck', 'test', 'build', 'api:check'] as const;
const MAX_SUMMARY = 2_000;
const MAX_OUTPUT = 2 * 1024 * 1024;

export interface CodingQualityCheck {
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  durationMs: number | null;
  summary: string | null;
}

export type QualityCommandRunner = (
  root: string,
  script: string,
  signal?: AbortSignal,
) => Promise<string>;

export class CodingQualityGateRunner {
  constructor(private readonly runCommand: QualityCommandRunner = runScript) {}

  async run(
    worktreeRoot: string,
    signal?: AbortSignal,
    onCheck?: (check: CodingQualityCheck) => void,
  ): Promise<CodingQualityCheck[]> {
    const scripts = await packageScripts(worktreeRoot);
    const checks: CodingQualityCheck[] = [];
    let blocked = false;

    for (const gate of GATES) {
      let check: CodingQualityCheck;
      if (!scripts.has(gate)) {
        check = {
          name: `pnpm ${gate}`,
          status: 'skipped',
          durationMs: null,
          summary: 'The repository does not define this script.',
        };
      } else if (blocked) {
        check = {
          name: `pnpm ${gate}`,
          status: 'skipped',
          durationMs: null,
          summary: 'Skipped after an earlier quality gate failed.',
        };
      } else {
        const startedAt = Date.now();
        try {
          const output = await this.runCommand(worktreeRoot, gate, signal);
          check = {
            name: `pnpm ${gate}`,
            status: 'passed',
            durationMs: Date.now() - startedAt,
            summary: boundedSummary(output, 'Gate passed.'),
          };
        } catch (error) {
          check = {
            name: `pnpm ${gate}`,
            status: 'failed',
            durationMs: Date.now() - startedAt,
            summary: boundedSummary(errorMessage(error), 'Gate failed.'),
          };
          blocked = true;
        }
      }
      checks.push(check);
      onCheck?.(check);
    }
    return checks;
  }
}

async function packageScripts(root: string): Promise<Set<string>> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  } catch {
    return new Set();
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return new Set();
  }
  const scripts = (parsed as { scripts?: unknown }).scripts;
  if (!scripts || typeof scripts !== 'object' || Array.isArray(scripts)) {
    return new Set();
  }
  return new Set(Object.keys(scripts));
}

async function runScript(
  root: string,
  script: string,
  signal?: AbortSignal,
): Promise<string> {
  try {
    const result = await execFileAsync(
      process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
      [script],
      {
        cwd: root,
        encoding: 'utf8',
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
        maxBuffer: MAX_OUTPUT,
        signal,
        timeout: 15 * 60 * 1_000,
        windowsHide: true,
      },
    );
    return `${result.stdout}${result.stderr}`;
  } catch (error) {
    const output = `${outputField(error, 'stdout')}${outputField(error, 'stderr')}`;
    throw new Error(output.trim() || errorMessage(error));
  }
}

function boundedSummary(value: string, fallback: string): string {
  const normalized = value.trim();
  return (normalized || fallback).slice(-MAX_SUMMARY);
}

function outputField(error: unknown, field: 'stdout' | 'stderr'): string {
  if (!error || typeof error !== 'object' || !(field in error)) return '';
  const value = (error as Record<string, unknown>)[field];
  if (typeof value === 'string') return value;
  return value ? Buffer.from(value as Uint8Array).toString() : '';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
