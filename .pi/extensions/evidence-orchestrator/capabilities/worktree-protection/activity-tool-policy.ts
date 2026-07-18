import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

export const ACTIVITY_CHILD_ENV = 'EVIDENCE_ACTIVITY_CHILD';
export const ACTIVITY_POLICY_ENV = 'EVIDENCE_ACTIVITY_POLICY_PATH';

export type ActivityWriteMode = 'none' | 'test' | 'production' | 'refactor';

export interface ActivityToolPolicy {
  version: 1;
  role: string;
  projectRoot: string;
  readRoots: string[];
  readDenyPatterns: string[];
  writeMode: ActivityWriteMode;
  writeRoots: string[];
  bash: 'forbidden';
  expiresAt: string;
}

export interface ActivityToolDecision {
  block: boolean;
  reason?: string;
}

const READ_DENY_PATTERNS = [
  '**/.git/**',
  '**/.env*',
  '**/*credential*',
  '**/*secret*',
  '**/*.pem',
  '**/*.key',
] as const;

const WRITE_PROTECTED_PATHS = [
  '.git',
  '.pi',
  'artifacts',
  'engineering/evidence-orchestrator',
  'evidence-state.json',
] as const;

function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function inside(root: string, candidate: string): boolean {
  const fromRoot = relative(root, candidate);
  return (
    fromRoot === '' ||
    (fromRoot !== '..' &&
      !fromRoot.startsWith(`..${sep}`) &&
      !isAbsolute(fromRoot))
  );
}

function canonicalExistingParent(path: string): string {
  let existing = path;
  const suffix: string[] = [];
  while (!existsSync(existing)) {
    const parent = dirname(existing);
    if (parent === existing) {
      throw new Error(`No existing parent for activity path: ${path}.`);
    }
    suffix.unshift(pathSegment(existing));
    existing = parent;
  }
  const canonical = realpathSync(existing);
  return suffix.reduce((current, segment) => join(current, segment), canonical);
}

function pathSegment(path: string): string {
  const parent = dirname(path);
  return path.slice(parent.length + (parent.endsWith(sep) ? 0 : 1));
}

function normalizeToolPath(
  projectRoot: string,
  rawPath: string,
  write: boolean,
): { absolute: string; projectRelative?: string } {
  const withoutAt = rawPath.startsWith('@') ? rawPath.slice(1) : rawPath;
  if (!withoutAt.trim()) throw new Error('Activity tool path is empty.');
  if (write && isAbsolute(withoutAt)) {
    throw new Error('Activity writes must use project-relative paths.');
  }
  const resolved = resolve(projectRoot, withoutAt);
  const absolute = canonicalExistingParent(resolved);
  return {
    absolute,
    ...(inside(projectRoot, absolute)
      ? { projectRelative: relative(projectRoot, absolute) || '.' }
      : {}),
  };
}

function deniedReadPath(projectRelative: string | undefined): boolean {
  if (!projectRelative) return false;
  const segments = projectRelative.toLowerCase().split(/[\\/]/);
  return segments.some(
    (segment) =>
      segment === '.git' ||
      segment === '.env' ||
      segment.startsWith('.env.') ||
      segment.includes('credential') ||
      segment.includes('secret') ||
      segment.endsWith('.pem') ||
      segment.endsWith('.key'),
  );
}

function protectedWritePath(projectRelative: string | undefined): boolean {
  if (!projectRelative) return true;
  return WRITE_PROTECTED_PATHS.some(
    (protectedPath) =>
      projectRelative === protectedPath ||
      projectRelative.startsWith(`${protectedPath}/`),
  );
}

function testPath(path: string): boolean {
  return (
    /(^|\/)(__tests__|tests?)(\/|$)/.test(path) ||
    /\.(test|spec)\.[^/]+$/.test(path) ||
    /(^|\/)(test_[^/]+|[^/]+_test)\.rs$/.test(path)
  );
}

function validatePolicy(policy: ActivityToolPolicy, now = Date.now()): void {
  if (
    policy.version !== 1 ||
    !text(policy.role) ||
    !isAbsolute(policy.projectRoot) ||
    !Array.isArray(policy.readRoots) ||
    policy.readRoots.some((root) => !isAbsolute(root)) ||
    JSON.stringify(policy.readDenyPatterns) !==
      JSON.stringify(READ_DENY_PATTERNS) ||
    !['none', 'test', 'production', 'refactor'].includes(policy.writeMode) ||
    !Array.isArray(policy.writeRoots) ||
    policy.writeRoots.some(
      (root) =>
        !text(root) || isAbsolute(root) || root.split(/[\\/]/).includes('..'),
    ) ||
    policy.bash !== 'forbidden' ||
    !text(policy.expiresAt) ||
    Number.isNaN(new Date(policy.expiresAt).getTime()) ||
    new Date(policy.expiresAt).getTime() <= now
  ) {
    throw new Error('Invalid or expired Evidence activity tool policy.');
  }
  const canonicalProject = realpathSync(policy.projectRoot);
  if (canonicalProject !== policy.projectRoot) {
    throw new Error('Activity project root must be canonical.');
  }
  for (const root of policy.readRoots) {
    if (!existsSync(root) || realpathSync(root) !== root) {
      throw new Error(`Activity read root must be canonical: ${root}.`);
    }
  }
}

export function createActivityToolPolicy(options: {
  cwd: string;
  role: string;
  writeMode?: ActivityWriteMode;
  writeRoots?: string[];
  extraReadRoots?: string[];
  timeoutMs: number;
  now?: number;
}): ActivityToolPolicy {
  if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new Error('Activity tool policy requires a positive timeout.');
  }
  const projectRoot = realpathSync(options.cwd);
  const readRoots = [
    projectRoot,
    ...(options.extraReadRoots ?? []).map((root) => realpathSync(root)),
  ];
  const policy: ActivityToolPolicy = {
    version: 1,
    role: options.role,
    projectRoot,
    readRoots: [...new Set(readRoots)],
    readDenyPatterns: [...READ_DENY_PATTERNS],
    writeMode: options.writeMode ?? 'none',
    writeRoots: [...new Set(options.writeRoots ?? [])],
    bash: 'forbidden',
    expiresAt: new Date(
      (options.now ?? Date.now()) + options.timeoutMs,
    ).toISOString(),
  };
  validatePolicy(policy, options.now ?? Date.now());
  return policy;
}

export function readActivityToolPolicy(
  path: string,
  now = Date.now(),
): ActivityToolPolicy {
  if (!isAbsolute(path) || !existsSync(path) || !statSync(path).isFile()) {
    throw new Error('Evidence activity policy path is invalid.');
  }
  const policy = JSON.parse(readFileSync(path, 'utf8')) as ActivityToolPolicy;
  validatePolicy(policy, now);
  return policy;
}

export function activityToolDecision(
  policy: ActivityToolPolicy,
  toolName: string,
  input: unknown,
  now = Date.now(),
): ActivityToolDecision {
  const expiresAt = Date.parse(policy.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) {
    return {
      block: true,
      reason: 'Evidence activity tool policy expired during execution.',
    };
  }
  if (toolName === 'bash') {
    return { block: true, reason: 'Activity agents cannot execute Bash.' };
  }
  if (!['read', 'edit', 'write'].includes(toolName)) return { block: false };
  const path =
    input && typeof input === 'object' && 'path' in input
      ? (input as { path?: unknown }).path
      : undefined;
  if (!text(path)) {
    return { block: true, reason: `${toolName} requires a valid path.` };
  }

  try {
    const write = toolName === 'edit' || toolName === 'write';
    const normalized = normalizeToolPath(policy.projectRoot, path, write);
    if (write) {
      if (policy.writeMode === 'none') {
        return {
          block: true,
          reason: `${policy.role} is read-only and cannot ${toolName} files.`,
        };
      }
      if (protectedWritePath(normalized.projectRelative)) {
        return {
          block: true,
          reason: `Protected activity path: ${normalized.projectRelative ?? path}.`,
        };
      }
      const allowed = policy.writeRoots.some((root) =>
        inside(resolve(policy.projectRoot, root), normalized.absolute),
      );
      if (!allowed) {
        return {
          block: true,
          reason: `Activity write is outside the ${policy.writeMode} roots: ${path}.`,
        };
      }
      if (
        policy.writeMode === 'test' &&
        normalized.projectRelative &&
        !testPath(normalized.projectRelative) &&
        !normalized.projectRelative.endsWith('.rs')
      ) {
        return {
          block: true,
          reason: `Test Driver cannot write a production path: ${path}.`,
        };
      }
      if (
        policy.writeMode !== 'test' &&
        normalized.projectRelative &&
        testPath(normalized.projectRelative)
      ) {
        return {
          block: true,
          reason: `Production Driver cannot write a test path: ${path}.`,
        };
      }
      if (
        policy.writeMode === 'test' &&
        toolName === 'write' &&
        normalized.projectRelative?.endsWith('.rs') &&
        existsSync(normalized.absolute)
      ) {
        return {
          block: true,
          reason:
            'Test Driver must edit an existing Rust test region, not overwrite its file.',
        };
      }
      return { block: false };
    }

    if (deniedReadPath(normalized.projectRelative)) {
      return { block: true, reason: `Protected activity read path: ${path}.` };
    }
    if (!policy.readRoots.some((root) => inside(root, normalized.absolute))) {
      return {
        block: true,
        reason: `Activity read is outside its declared roots: ${path}.`,
      };
    }
    return { block: false };
  } catch (error) {
    return {
      block: true,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}
