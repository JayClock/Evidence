import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { IterationIntakeSnapshot } from '../iteration/state';

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
  return cwd;
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
  write(cwd, '.gitignore', 'node_modules\n');
  execFileSync('git', ['init', '--quiet'], { cwd });
  execFileSync('git', ['add', '.gitignore'], { cwd });
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
