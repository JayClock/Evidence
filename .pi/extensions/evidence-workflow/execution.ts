import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { artifactPath, artifactRelativePath } from './iteration';
import { readState, selectedTestProcesses } from './state';
import { readTestProcess } from './test-processes';

export type TestExecutionStage = 'red' | 'green' | 'refactor' | 'quality_gate';

export interface TestExecutionRequest {
  processId: string;
  stage: TestExecutionStage;
  command: string;
}

export interface TestExecutionRecord {
  version: 1;
  process_id: string;
  stage: TestExecutionStage;
  command: string;
  sequence: number;
  exit_code: number;
  expected_failure: boolean;
  started_at: string;
  completed_at: string;
  stdout_sha256: string;
  stderr_sha256: string;
  git_head: string;
  worktree_sha256: string;
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function git(cwd: string, args: string[]): string {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8' });
  } catch {
    return 'unavailable';
  }
}

function worktreeDigest(cwd: string): string {
  return digest(
    `${git(cwd, ['status', '--porcelain=v1', '--untracked-files=all'])}\n${git(cwd, ['diff', '--binary', 'HEAD'])}`,
  );
}

/**
 * Execute only a code-reviewed quality command declared by the selected process.
 * The append-only record is the source of truth for later TDD evidence validation.
 */
export function executeTestStep(
  cwd: string,
  request: TestExecutionRequest,
): TestExecutionRecord {
  const state = readState(cwd);
  if (state.phase !== 'coding' || !state.active_work_item) {
    throw new Error(
      'A selected coding work item is required to execute a test step.',
    );
  }
  const selection = selectedTestProcesses(state.active_work_item).find(
    ({ id }) => id === request.processId,
  );
  if (!selection) {
    throw new Error(
      `Test process ${request.processId} is not selected for this work item.`,
    );
  }
  const process = readTestProcess(join(cwd, selection.path));
  if (!process.quality_gates.includes(request.command)) {
    throw new Error(
      `Command is not declared by selected test process ${request.processId}: ${request.command}`,
    );
  }

  const startedAt = new Date().toISOString();
  const result = spawnSync(request.command, {
    cwd,
    shell: true,
    encoding: 'utf8',
    timeout: 10 * 60 * 1000,
  });
  const exitCode = result.status ?? (result.error ? 1 : 0);
  const root = artifactPath(
    cwd,
    state,
    `artifacts/05-code/${state.active_work_item.story_id}`,
  );
  mkdirSync(root, { recursive: true });
  const logPath = `${root}/${state.active_work_item.scenario_id}.execution.jsonl`;
  const sequence = (() => {
    try {
      return (
        readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean)
          .length + 1
      );
    } catch {
      return 1;
    }
  })();
  const record: TestExecutionRecord = {
    version: 1,
    process_id: request.processId,
    stage: request.stage,
    command: request.command,
    sequence,
    exit_code: exitCode,
    expected_failure: request.stage === 'red' && exitCode !== 0,
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    stdout_sha256: digest(result.stdout ?? ''),
    stderr_sha256: digest(
      `${result.stderr ?? ''}${result.error?.message ?? ''}`,
    ),
    git_head: git(cwd, ['rev-parse', '--verify', 'HEAD']).trim(),
    worktree_sha256: worktreeDigest(cwd),
  };
  appendFileSync(logPath, `${JSON.stringify(record)}\n`);
  return record;
}

export function executionLogPath(cwd: string): string | undefined {
  const state = readState(cwd);
  if (!state.active_work_item) return undefined;
  return artifactRelativePath(
    state,
    `artifacts/05-code/${state.active_work_item.story_id}/${state.active_work_item.scenario_id}.execution.jsonl`,
  );
}
