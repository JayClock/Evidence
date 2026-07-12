import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const workspaces: string[] = [];

export function workspace(): string {
  const cwd = mkdtempSync(join(tmpdir(), 'evidence-workflow-unit-'));
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
      'user.name=Evidence Workflow Test',
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
