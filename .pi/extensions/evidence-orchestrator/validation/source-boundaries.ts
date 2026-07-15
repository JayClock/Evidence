import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative, resolve, sep } from 'node:path';

export const TARGET_SOURCE_ZONES = [
  'iteration',
  'loops',
  'capabilities',
  'adapters',
  'validation',
  'test-support',
] as const;

export const RETIRED_SOURCE_ZONES = [
  'workflow',
  'requirements',
  'evidence',
  'testing',
  'runtime',
  'subagents',
  'tests',
  'compatibility',
] as const;

type TargetZone = (typeof TARGET_SOURCE_ZONES)[number];

export interface SourceBoundaryViolation {
  source: string;
  target?: string;
  reason: string;
}

interface SourceLocation {
  zone: TargetZone | 'root' | 'retired';
  loop?: string;
  publicContract?: boolean;
}

const IMPORT_PATTERN =
  /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?['"](\.[^'"]+)['"]/g;

function normalized(path: string): string {
  return path.split(sep).join('/');
}

function location(path: string): SourceLocation {
  const [first, second] = normalized(path).split('/');
  if (first === 'loops') {
    return {
      zone: 'loops',
      loop: second,
      publicContract: normalized(path).endsWith('/public.ts'),
    };
  }
  if ((TARGET_SOURCE_ZONES as readonly string[]).includes(first)) {
    return { zone: first as TargetZone };
  }
  if ((RETIRED_SOURCE_ZONES as readonly string[]).includes(first)) {
    return { zone: 'retired' };
  }
  return { zone: 'root' };
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

function boundaryReason(
  source: SourceLocation,
  target: SourceLocation,
): string | undefined {
  if (source.zone === 'loops') {
    if (target.zone === 'adapters') {
      return 'Loop code must not depend on Pi or external adapters.';
    }
    if (
      target.zone === 'loops' &&
      source.loop &&
      target.loop &&
      source.loop !== target.loop &&
      !target.publicContract
    ) {
      return `Loop ${source.loop} must not import private code from loop ${target.loop}.`;
    }
  }
  if (source.zone === 'capabilities') {
    if (['loops', 'adapters'].includes(target.zone)) {
      return `A shared capability must not depend on ${target.zone}.`;
    }
  }
  if (
    source.zone === 'iteration' &&
    ['loops', 'capabilities', 'adapters'].includes(target.zone)
  ) {
    return `Iteration semantics must not depend on ${target.zone}.`;
  }
  return undefined;
}

/** Validate the semantic source layout without treating colocated specs as production dependencies. */
export function sourceBoundaryViolations(
  extensionRoot: string,
): SourceBoundaryViolation[] {
  const files = sourceFiles(extensionRoot).filter(
    (path) =>
      /\.(?:ts|mts)$/.test(path) &&
      !/\.spec\.(?:ts|mts)$/.test(path) &&
      !normalized(relative(extensionRoot, path)).startsWith('test-support/'),
  );
  const violations: SourceBoundaryViolation[] = [];

  for (const sourcePath of files) {
    const sourceRelative = normalized(relative(extensionRoot, sourcePath));
    const sourceLocation = location(sourceRelative);
    if (sourceLocation.zone === 'retired') {
      violations.push({
        source: sourceRelative,
        reason: 'Source remains in a retired directory.',
      });
    }
    const content = readFileSync(sourcePath, 'utf8');
    for (const match of content.matchAll(IMPORT_PATTERN)) {
      const targetPath = resolveImport(sourcePath, match[1]);
      if (!targetPath || !targetPath.startsWith(`${extensionRoot}${sep}`))
        continue;
      const targetRelative = normalized(relative(extensionRoot, targetPath));
      const reason = boundaryReason(sourceLocation, location(targetRelative));
      if (reason) {
        violations.push({
          source: sourceRelative,
          target: targetRelative,
          reason,
        });
      }
    }
  }
  return violations;
}

export function validateSourceBoundaries(extensionRoot: string): void {
  const violations = sourceBoundaryViolations(extensionRoot);
  if (violations.length === 0) return;
  throw new Error(
    `Evidence Orchestrator source boundaries failed:\n${violations
      .map(
        ({ source, target, reason }) =>
          `- ${source}${target ? ` -> ${target}` : ''}: ${reason}`,
      )
      .join('\n')}`,
  );
}
