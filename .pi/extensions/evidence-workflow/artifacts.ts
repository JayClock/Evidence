import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export function ensureProjectDirs(cwd: string): void {
  for (const dir of [
    "src",
    "tests",
    "artifacts",
    "artifacts/gates",
    "artifacts/00-user-input",
    "artifacts/01-requirements",
    "artifacts/02-domain-model",
    "artifacts/03-architecture",
    "artifacts/04-planning",
    "artifacts/05-code",
    "artifacts/06-reviews",
  ]) mkdirSync(join(cwd, dir), { recursive: true });
}

export function findFiles(root: string, predicate: (path: string) => boolean): string[] {
  if (!existsSync(root)) return [];
  const results: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (predicate(full)) results.push(full);
    }
  };
  walk(root);
  return results.sort();
}

export function collectArtifacts(cwd: string): string[] {
  return findFiles(join(cwd, "artifacts"), (p) => p.endsWith(".md"))
    .filter((p) => !relative(cwd, p).startsWith("artifacts/gates/"))
    .map((p) => relative(cwd, p));
}

export function collectCodeFiles(cwd: string): string[] {
  return ["src", "tests"]
    .flatMap((dir) => findFiles(join(cwd, dir), (p) => /\.(py|ts|tsx|js|jsx|go|rs|java|kt|cs)$/.test(p)))
    .map((p) => relative(cwd, p));
}
