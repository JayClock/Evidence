import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { basename, join, relative } from 'node:path';

const IGNORED_DIRECTORIES = new Set([
  '.git',
  '.nx',
  'coverage',
  'dist',
  'node_modules',
  'out-tsc',
  'target',
]);
/** Create the directory structure for one isolated iteration artifact root. */
export function ensureProjectDirs(
  cwd: string,
  artifactRoot = join(cwd, 'artifacts'),
): void {
  for (const dir of [
    '.',
    '00-user-input',
    '01-requirements',
    '01-requirements/stories',
    '01-requirements/clarifications',
    '01-requirements/examples',
    '02-domain-model',
    '02-domain-model/model-expansions',
    '03-architecture',
    '03-architecture/selected-test-processes',
    '04-planning',
    '05-code',
    '06-review',
    '07-learning',
    'feedback',
  ])
    mkdirSync(join(artifactRoot, dir), { recursive: true });
  // Keep cwd in the signature to make call sites explicit about project scope.
  void cwd;
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

export function collectArtifacts(
  cwd: string,
  artifactRoot = join(cwd, 'artifacts'),
): string[] {
  return findFiles(
    artifactRoot,
    (path) => path.endsWith('.md') || basename(path) === 'activity-trace.jsonl',
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
