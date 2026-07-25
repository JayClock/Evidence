import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import {
  CODING_QUALITY_GATE_NAMES,
  type CodingQualityGateName,
  type LockedCodingQualityGateScripts,
} from './coding-agent-protocol';
import { codingCommandEnvironment } from './coding-command-environment';

const execFileAsync = promisify(execFile);
const GATES = CODING_QUALITY_GATE_NAMES;
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

  async lock(worktreeRoot: string): Promise<LockedCodingQualityGateScripts> {
    const scripts = await packageScripts(worktreeRoot);
    return Object.fromEntries(
      GATES.flatMap((gate) => {
        const script = scripts.get(gate);
        return script === undefined ? [] : [[gate, script]];
      }),
    );
  }

  async run(
    worktreeRoot: string,
    lockedScripts: LockedCodingQualityGateScripts,
    signal?: AbortSignal,
    onCheck?: (check: CodingQualityCheck) => void,
  ): Promise<CodingQualityCheck[]> {
    const checks: CodingQualityCheck[] = [];
    let blocked = false;

    for (const gate of GATES) {
      let check: CodingQualityCheck;
      const lockedScript = lockedScripts[gate];
      if (lockedScript === undefined) {
        check = {
          name: `pnpm ${gate}`,
          status: 'skipped',
          durationMs: null,
          summary: 'The repository did not define this script at Run start.',
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
          await assertLockedScript(worktreeRoot, gate, lockedScript);
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

async function assertLockedScript(
  root: string,
  gate: CodingQualityGateName,
  expected: string,
): Promise<void> {
  if ((await packageScripts(root)).get(gate) !== expected) {
    throw new Error(
      `Quality gate pnpm ${gate} changed after the Coding Run started.`,
    );
  }
}

async function packageScripts(root: string): Promise<Map<string, string>> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  } catch {
    return new Map();
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return new Map();
  }
  const scripts = (parsed as { scripts?: unknown }).scripts;
  if (!scripts || typeof scripts !== 'object' || Array.isArray(scripts)) {
    return new Map();
  }
  return new Map(
    Object.entries(scripts).flatMap(([name, command]) =>
      typeof command === 'string' && command.trim()
        ? [[name, command] as const]
        : [],
    ),
  );
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
        env: codingCommandEnvironment(),
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
