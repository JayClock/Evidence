import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const workspaces: string[] = [];

export const LEAN_STORY_CARD = `# US-001 编辑既有工作区信息

> **作为**领域建模负责人，
> **我希望**修正既有工作区的信息，
> **从而**让协作者识别正确的协作空间。

**成功信号**：重新进入工作区时显示已确认的新标题。

- **Kickoff 上下文**：[\`kickoff.md\`](./kickoff.md)
`;

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
