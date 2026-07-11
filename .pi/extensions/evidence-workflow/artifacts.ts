import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const CODE_ROOTS = ['apps', 'libs'] as const;
const IGNORED_DIRECTORIES = new Set([
  '.git',
  '.nx',
  'coverage',
  'dist',
  'node_modules',
  'out-tsc',
  'target',
]);
const CODE_FILE_PATTERN =
  /\.(c|cc|cpp|cs|go|h|hpp|java|js|jsx|kt|mjs|mts|py|rs|ts|tsx)$/;

export function ensureProjectDirs(cwd: string): void {
  for (const dir of [
    'artifacts',
    'artifacts/gates',
    'artifacts/00-user-input',
    'artifacts/01-requirements',
    'artifacts/01-requirements/stories',
    'artifacts/01-requirements/clarifications',
    'artifacts/01-requirements/examples',
    'artifacts/02-domain-model',
    'artifacts/02-domain-model/model-expansions',
    'artifacts/03-architecture',
    'artifacts/03-architecture/test-processes',
    'artifacts/04-planning',
    'artifacts/05-code',
    'artifacts/06-reviews',
    'artifacts/07-learning',
  ])
    mkdirSync(join(cwd, dir), { recursive: true });
}

export function findFiles(
  root: string,
  predicate: (path: string) => boolean,
): string[] {
  if (!existsSync(root)) return [];
  const results: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry)) walk(full);
      } else if (predicate(full)) results.push(full);
    }
  };
  walk(root);
  return results.sort();
}

export function collectArtifacts(cwd: string): string[] {
  return findFiles(join(cwd, 'artifacts'), (p) => p.endsWith('.md'))
    .filter((p) => !relative(cwd, p).startsWith('artifacts/gates/'))
    .map((p) => relative(cwd, p));
}

export function collectCodeFiles(cwd: string): string[] {
  return CODE_ROOTS.flatMap((dir) =>
    findFiles(join(cwd, dir), (path) => CODE_FILE_PATTERN.test(path)),
  ).map((path) => relative(cwd, path));
}

export function missingPaths(cwd: string, paths: string[]): string[] {
  return paths.filter((path) => {
    const absolute = join(cwd, path);
    if (!existsSync(absolute)) return true;
    if (!path.endsWith('/')) {
      const stats = statSync(absolute);
      return !stats.isFile() || stats.size === 0;
    }
    return (
      !statSync(absolute).isDirectory() ||
      findFiles(absolute, () => true).length === 0
    );
  });
}
