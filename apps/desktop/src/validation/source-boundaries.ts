import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative, resolve, sep } from 'node:path';

export const DESKTOP_SOURCE_ZONES = [
  'adapters',
  'capabilities',
  'electron',
  'features',
  'iteration',
  'loops',
  'validation',
] as const;

type DesktopSourceZone = (typeof DESKTOP_SOURCE_ZONES)[number];

export interface DesktopSourceBoundaryViolation {
  source: string;
  target?: string;
  reason: string;
}

interface SourceLocation {
  zone: DesktopSourceZone | 'root' | 'unknown';
  owner?: string;
  publicContract?: boolean;
}

const ROOT_ENTRYPOINTS = new Set(['main.ts', 'preload.ts']);
const IMPORT_PATTERN =
  /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?['"](\.[^'"]+)['"]/g;

function normalized(path: string): string {
  return path.split(sep).join('/');
}

function location(path: string): SourceLocation {
  const source = normalized(path);
  const [first, second] = source.split('/');
  if (!source.includes('/')) return { zone: 'root' };
  if (!(DESKTOP_SOURCE_ZONES as readonly string[]).includes(first)) {
    return { zone: 'unknown' };
  }
  return {
    zone: first as DesktopSourceZone,
    owner: first === 'loops' || first === 'features' ? second : undefined,
    publicContract: source.endsWith('/public.ts'),
  };
}

function sourceFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const files: string[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory)) {
      const path = join(directory, entry);
      if (statSync(path).isDirectory()) visit(path);
      else files.push(path);
    }
  };
  visit(root);
  return files.sort();
}

function resolveImport(source: string, specifier: string): string | undefined {
  const base = resolve(source, '..', specifier);
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.mts`,
    join(base, 'index.ts'),
  ]) {
    if (existsSync(candidate) && extname(candidate)) return candidate;
  }
  return undefined;
}

function localImports(sourceRoot: string, sourcePath: string): string[] {
  const content = readFileSync(sourcePath, 'utf8');
  return [...content.matchAll(IMPORT_PATTERN)]
    .map((match) => resolveImport(sourcePath, match[1]))
    .filter((path): path is string => Boolean(path?.startsWith(sourceRoot)));
}

function boundaryReason(
  source: SourceLocation,
  target: SourceLocation,
): string | undefined {
  if (source.zone === 'loops') {
    if (['electron', 'features', 'iteration'].includes(target.zone)) {
      return `A loop must not depend on ${target.zone}.`;
    }
    if (
      target.zone === 'loops' &&
      source.owner !== target.owner &&
      !target.publicContract
    ) {
      return `Loop ${source.owner ?? '?'} must not import private code from loop ${target.owner ?? '?'}.`;
    }
  }
  if (source.zone === 'features') {
    if (['electron', 'iteration', 'loops'].includes(target.zone)) {
      return `A feature must not depend on ${target.zone}.`;
    }
    if (
      target.zone === 'features' &&
      source.owner !== target.owner &&
      !target.publicContract
    ) {
      return `Feature ${source.owner ?? '?'} must not import private code from feature ${target.owner ?? '?'}.`;
    }
  }
  if (source.zone === 'iteration') {
    if (['electron', 'features', 'loops'].includes(target.zone)) {
      return `Iteration provisioning must not depend on ${target.zone}.`;
    }
  }
  if (source.zone === 'capabilities') {
    if (['electron', 'features', 'iteration', 'loops'].includes(target.zone)) {
      return `A shared capability must not depend on ${target.zone}.`;
    }
  }
  if (source.zone === 'adapters') {
    if (['electron', 'features', 'iteration', 'loops'].includes(target.zone)) {
      return `An external adapter must not depend on ${target.zone}.`;
    }
  }
  return undefined;
}

export function desktopSourceBoundaryViolations(
  sourceRoot: string,
): DesktopSourceBoundaryViolation[] {
  const root = resolve(sourceRoot);
  const files = sourceFiles(root).filter(
    (path) =>
      /\.(?:ts|mts)$/.test(path) &&
      !/\.(?:spec|test)\.(?:ts|mts)$/.test(path),
  );
  const violations: DesktopSourceBoundaryViolation[] = [];

  for (const sourcePath of files) {
    const source = normalized(relative(root, sourcePath));
    const sourceLocation = location(source);
    if (sourceLocation.zone === 'root' && !ROOT_ENTRYPOINTS.has(source)) {
      violations.push({
        source,
        reason: 'Only main.ts and preload.ts may remain at the source root.',
      });
    }
    if (sourceLocation.zone === 'unknown') {
      violations.push({
        source,
        reason: 'Source is outside a named Desktop ownership zone.',
      });
    }
    if (source.split('/').some((segment) => segment.startsWith('intake-'))) {
      violations.push({
        source,
        reason:
          'Intake is a domain artifact, not a shared Desktop source bucket.',
      });
    }

    for (const targetPath of localImports(root, sourcePath)) {
      const target = normalized(relative(root, targetPath));
      const reason = boundaryReason(sourceLocation, location(target));
      if (reason) violations.push({ source, target, reason });
    }
  }

  return violations;
}

export function validateDesktopSourceBoundaries(sourceRoot: string): void {
  const violations = desktopSourceBoundaryViolations(sourceRoot);
  if (violations.length === 0) return;
  throw new Error(
    `Desktop source boundaries failed:\n${violations
      .map(
        ({ source, target, reason }) =>
          `- ${source}${target ? ` -> ${target}` : ''}: ${reason}`,
      )
      .join('\n')}`,
  );
}
