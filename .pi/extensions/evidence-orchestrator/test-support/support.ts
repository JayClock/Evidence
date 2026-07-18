import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  ExecutionBudgetEnvelope,
  IterationIntakeSnapshot,
} from '../iteration/state';

export const TEST_FLOW_POLICY = {
  max_active_stories: 3,
  lanes: {
    discovery: 2,
    planning: 2,
    ready: 3,
    delivery: 1,
    review: 2,
  },
  resources: {
    pair_runner: 1,
    activity_per_story: 1,
  },
  lease_timeout_ms: 900_000,
} as const;

export const TEST_EXECUTION_BUDGET_POLICY = {
  version: 1,
  activity: { timeout_ms: 900_000 },
  command: { timeout_ms: 600_000 },
  pair: {
    emergency_max_checkpoints: 200,
    max_retries_per_failure_fingerprint: 2,
    max_no_progress_checkpoints: null,
    extra_agent_call_ratio: null,
  },
  iteration: {
    soft_ratio: 0.8,
    max_duration_ms: null,
    max_input_tokens: null,
    max_output_tokens: null,
    max_reported_cost_usd: null,
  },
} as const;

const workspaces: string[] = [];

export const LEAN_STORY_CARD = `# US-001 编辑既有工作区信息

> **作为**领域建模负责人，
> **我希望**修正既有工作区的信息，
> **从而**让协作者识别正确的协作空间。

- **问题上下文**：[\`../problem-statement.md\`](../problem-statement.md)
`;

export function testIntakeSnapshot(): IterationIntakeSnapshot {
  return {
    version: 1,
    candidate_id: 'CAND-0001',
    candidate_snapshot_path:
      'artifacts/iterations/ITER-0001/00-user-input/story-candidate.json',
    candidate_snapshot_sha256: `sha256:${'a'.repeat(64)}`,
    source_revisions: [
      {
        inbox_id: 'INBOX-0001',
        revision_sha256: `sha256:${'b'.repeat(64)}`,
        snapshot_path:
          'artifacts/iterations/ITER-0001/00-user-input/sources/INBOX-0001.json',
        snapshot_sha256: `sha256:${'c'.repeat(64)}`,
      },
    ],
    manifest_path: 'artifacts/iterations/ITER-0001/00-user-input/intake.json',
    projection_path:
      'artifacts/iterations/ITER-0001/00-user-input/requirements.md',
    content_sha256: `sha256:${'d'.repeat(64)}`,
    frozen_at: '2026-01-01T00:00:00.000Z',
  };
}

export function workspace(): string {
  const cwd = mkdtempSync(join(tmpdir(), 'evidence-orchestrator-unit-'));
  workspaces.push(cwd);
  writeTestExecutionBudgetPolicy(cwd);
  writeTestFlowPolicy(cwd);
  return cwd;
}

export function testExecutionBudgetEnvelope(
  overrides: Partial<ExecutionBudgetEnvelope> = {},
): ExecutionBudgetEnvelope {
  return {
    version: 1,
    policy_path: 'engineering/evidence-orchestrator/execution-budget.json',
    policy_sha256: 'e'.repeat(64),
    activity_timeout_ms: 900_000,
    command_timeout_ms: 600_000,
    expected_pair_agent_calls: 4,
    max_pair_agent_calls: null,
    emergency_max_checkpoints: 200,
    max_retries_per_failure_fingerprint: 2,
    max_no_progress_checkpoints: null,
    max_duration_ms: null,
    max_input_tokens: null,
    max_output_tokens: null,
    max_reported_cost_usd: null,
    soft_ratio: 0.8,
    approved_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

export function writeTestFlowPolicy(cwd: string): void {
  write(
    cwd,
    'engineering/evidence-orchestrator/flow-policy.json',
    `${JSON.stringify(TEST_FLOW_POLICY, null, 2)}\n`,
  );
}

export function writeTestExecutionBudgetPolicy(cwd: string): void {
  write(
    cwd,
    'engineering/evidence-orchestrator/execution-budget.json',
    `${JSON.stringify(TEST_EXECUTION_BUDGET_POLICY, null, 2)}\n`,
  );
}

export function write(cwd: string, path: string, content = 'content'): void {
  const absolute = join(cwd, path);
  mkdirSync(join(absolute, '..'), { recursive: true });
  writeFileSync(absolute, content);
}

export function writeIterationArtifact(
  cwd: string,
  path: string,
  content = 'content',
): void {
  write(cwd, `artifacts/iterations/ITER-0001/${path}`, content);
}

export function initializeGitRepository(cwd: string): void {
  write(
    cwd,
    '.gitignore',
    'node_modules\n/.worktrees/evidence/\n/.evidence-iteration-state.json\n',
  );
  writeTestExecutionBudgetPolicy(cwd);
  writeTestFlowPolicy(cwd);
  execFileSync('git', ['init', '--quiet'], { cwd });
  execFileSync(
    'git',
    [
      'add',
      '.gitignore',
      'engineering/evidence-orchestrator/execution-budget.json',
      'engineering/evidence-orchestrator/flow-policy.json',
    ],
    { cwd },
  );
  execFileSync(
    'git',
    [
      '-c',
      'user.name=Evidence Orchestrator Test',
      '-c',
      'user.email=workflow@example.test',
      'commit',
      '--quiet',
      '-m',
      'initial',
    ],
    { cwd },
  );
}

export function cleanupWorkspaces(): void {
  for (const cwd of workspaces.splice(0)) {
    rmSync(cwd, { recursive: true, force: true });
  }
}
