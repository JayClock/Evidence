import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { isAbsolute } from 'node:path';

export interface NxWorkspaceProject {
  name: string;
  root: string;
  sourceRoot?: string;
  targetNames: string[];
}

export interface NxProjectCatalog {
  version: 1;
  projects: NxWorkspaceProject[];
  project_catalog_sha256: string;
}

export type NxProjectCommandRunner = (
  cwd: string,
  args: readonly string[],
) => string;

const SAFE_PROJECT_ID = /^[A-Za-z0-9_@./:-]+$/;
const SAFE_TARGET = /^[A-Za-z0-9_@./:-]+$/;

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function record(value: unknown, name: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${name} must be a JSON object.`);
  return value;
}

function nonEmpty(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} must be a non-empty string.`);
  }
  return value.trim();
}

function normalizeProjectId(value: string, name: string): string {
  const result = nonEmpty(value, name);
  if (!SAFE_PROJECT_ID.test(result) || result.includes('..')) {
    throw new Error(`${name} has an unsafe Nx project id.`);
  }
  return result;
}

function normalizeWorkspacePath(
  value: unknown,
  name: string,
  options: { allowDot?: boolean } = {},
): string {
  const raw = nonEmpty(value, name).replaceAll('\\', '/');
  const normalized = raw.replace(/^\.\//, '').replace(/\/$/, '') || '.';
  if (
    isAbsolute(raw) ||
    normalized.startsWith('/') ||
    normalized.split('/').includes('..') ||
    (!options.allowDot && normalized === '.')
  ) {
    throw new Error(`${name} must be a safe workspace-relative path.`);
  }
  return normalized;
}

function normalizeTarget(value: unknown, name: string): string {
  const result = nonEmpty(value, name);
  if (!SAFE_TARGET.test(result) || result.includes('..')) {
    throw new Error(`${name} has an unsafe Nx target name.`);
  }
  return result;
}

function canonicalProject(
  value: NxWorkspaceProject,
  index: number,
): NxWorkspaceProject {
  const name = normalizeProjectId(value.name, `projects[${index}].name`);
  const root = normalizeWorkspacePath(value.root, `projects[${index}].root`, {
    allowDot: true,
  });
  const sourceRoot =
    value.sourceRoot === undefined
      ? undefined
      : normalizeWorkspacePath(
          value.sourceRoot,
          `projects[${index}].sourceRoot`,
          { allowDot: true },
        );
  if (!Array.isArray(value.targetNames)) {
    throw new Error(`projects[${index}].targetNames must be an array.`);
  }
  const targetNames = value.targetNames
    .map((target, targetIndex) =>
      normalizeTarget(target, `projects[${index}].targetNames[${targetIndex}]`),
    )
    .sort();
  if (new Set(targetNames).size !== targetNames.length) {
    throw new Error(`${name} targetNames must be unique.`);
  }
  return {
    name,
    root,
    ...(sourceRoot ? { sourceRoot } : {}),
    targetNames,
  };
}

function unsignedCatalog(projects: NxWorkspaceProject[]): {
  version: 1;
  projects: NxWorkspaceProject[];
} {
  return { version: 1, projects };
}

export function createNxProjectCatalog(
  projects: NxWorkspaceProject[],
): NxProjectCatalog {
  if (!Array.isArray(projects) || projects.length === 0) {
    throw new Error('Nx project catalog requires at least one project.');
  }
  const canonical = projects
    .map(canonicalProject)
    .sort((left, right) => left.name.localeCompare(right.name));
  if (new Set(canonical.map(({ name }) => name)).size !== canonical.length) {
    throw new Error('Nx project catalog names must be unique.');
  }
  const unsigned = unsignedCatalog(canonical);
  return {
    ...unsigned,
    project_catalog_sha256: digest(JSON.stringify(unsigned)),
  };
}

export function assertNxProjectCatalog(
  catalog: NxProjectCatalog,
): NxProjectCatalog {
  const canonical = createNxProjectCatalog(catalog.projects);
  if (
    catalog.version !== 1 ||
    catalog.project_catalog_sha256 !== canonical.project_catalog_sha256 ||
    JSON.stringify(catalog.projects) !== JSON.stringify(canonical.projects)
  ) {
    throw new Error('Nx project catalog is not canonical or its hash drifted.');
  }
  return catalog;
}

export function serializeNxProjectCatalog(catalog: NxProjectCatalog): string {
  assertNxProjectCatalog(catalog);
  return `${JSON.stringify(catalog, null, 2)}\n`;
}

function parseJsonOutput(output: string, name: string): unknown {
  const firstObject = output.indexOf('{');
  const firstArray = output.indexOf('[');
  const starts = [firstObject, firstArray].filter((index) => index >= 0);
  const start = starts.length > 0 ? Math.min(...starts) : -1;
  if (start < 0) throw new Error(`${name} did not return JSON.`);
  try {
    return JSON.parse(output.slice(start)) as unknown;
  } catch {
    throw new Error(`${name} did not return valid JSON.`);
  }
}

export const runNxProjectCommand: NxProjectCommandRunner = (cwd, args) =>
  execFileSync('pnpm', ['nx', ...args], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
  });

/** Resolve inferred Nx ownership and targets; project.json is never read directly. */
export function readNxProjectCatalog(
  cwd: string,
  projectIds: string[],
  runner: NxProjectCommandRunner = runNxProjectCommand,
): NxProjectCatalog {
  if (!Array.isArray(projectIds) || projectIds.length === 0) {
    throw new Error('At least one planned Nx project id is required.');
  }
  const requested = projectIds
    .map((id, index) => normalizeProjectId(id, `projectIds[${index}]`))
    .sort();
  if (new Set(requested).size !== requested.length) {
    throw new Error('Planned Nx project ids must be unique.');
  }

  const graph = record(
    parseJsonOutput(runner(cwd, ['graph', '--print']), 'nx graph --print'),
    'Nx project graph',
  );
  const graphBody = record(graph.graph, 'Nx project graph.graph');
  const graphNodes = record(graphBody.nodes, 'Nx project graph.graph.nodes');
  const missing = requested.filter((id) => !Object.hasOwn(graphNodes, id));
  if (missing.length > 0) {
    throw new Error(
      `Nx project graph does not contain: ${missing.join(', ')}.`,
    );
  }

  const projects = requested.map((id) => {
    const resolved = record(
      parseJsonOutput(
        runner(cwd, ['show', 'project', id, '--json']),
        `nx show project ${id} --json`,
      ),
      `Nx project ${id}`,
    );
    const targets = record(resolved.targets, `Nx project ${id}.targets`);
    const name = nonEmpty(resolved.name, `Nx project ${id}.name`);
    if (name !== id) {
      throw new Error(
        `Nx project ${id} resolved with a different name: ${name}.`,
      );
    }
    const sourceRoot =
      resolved.sourceRoot === null || resolved.sourceRoot === undefined
        ? undefined
        : nonEmpty(resolved.sourceRoot, `Nx project ${id}.sourceRoot`);
    return {
      name,
      root: nonEmpty(resolved.root, `Nx project ${id}.root`),
      ...(sourceRoot ? { sourceRoot } : {}),
      targetNames: Object.keys(targets),
    };
  });
  return createNxProjectCatalog(projects);
}

export function nxProject(
  catalog: NxProjectCatalog,
  projectId: string,
): NxWorkspaceProject {
  assertNxProjectCatalog(catalog);
  const normalized = normalizeProjectId(projectId, 'projectId');
  const project = catalog.projects.find(({ name }) => name === normalized);
  if (!project) {
    throw new Error(
      `Nx project is not present in the selected catalog: ${normalized}.`,
    );
  }
  return project;
}

function insideRoot(path: string, root: string): boolean {
  return root === '.' || path === root || path.startsWith(`${root}/`);
}

function rootSpecificity(root: string): number {
  return root === '.' ? 0 : root.split('/').length * 10_000 + root.length;
}

/** Resolve one path by longest project-root prefix; ties are rejected. */
export function resolveNxProjectOwner(
  catalog: NxProjectCatalog,
  path: string,
): NxWorkspaceProject {
  assertNxProjectCatalog(catalog);
  const normalizedPath = normalizeWorkspacePath(path, 'changed path', {
    allowDot: false,
  });
  const matches = catalog.projects.filter(({ root }) =>
    insideRoot(normalizedPath, root),
  );
  if (matches.length === 0) {
    throw new Error(`No selected Nx project owns path: ${normalizedPath}.`);
  }
  const highest = Math.max(...matches.map(({ root }) => rootSpecificity(root)));
  const owners = matches.filter(
    ({ root }) => rootSpecificity(root) === highest,
  );
  if (owners.length !== 1) {
    throw new Error(
      `Multiple selected Nx projects own path ${normalizedPath}: ${owners.map(({ name }) => name).join(', ')}.`,
    );
  }
  const owner = owners[0];
  if (!owner) throw new Error(`Nx owner disappeared for ${normalizedPath}.`);
  return owner;
}

function pathsOverlap(left: string, right: string): boolean {
  return insideRoot(left, right) || insideRoot(right, left);
}

export function assertProjectIntersectsTestRoots(
  project: NxWorkspaceProject,
  roots: string[],
  subject = project.name,
): void {
  if (!Array.isArray(roots) || roots.length === 0) {
    throw new Error(`${subject} requires at least one nearest-test root.`);
  }
  const normalizedRoots = roots.map((root, index) =>
    normalizeWorkspacePath(root, `${subject}.nearest_test.roots[${index}]`, {
      allowDot: false,
    }),
  );
  if (!normalizedRoots.some((root) => pathsOverlap(project.root, root))) {
    throw new Error(
      `Nx project ${project.name} root ${project.root} does not intersect nearest-test roots: ${normalizedRoots.join(', ')}.`,
    );
  }
}

export function assertProjectHasTarget(
  project: NxWorkspaceProject,
  target: string,
): void {
  const normalized = normalizeTarget(target, `${project.name}.target`);
  if (!project.targetNames.includes(normalized)) {
    throw new Error(`Nx project ${project.name} has no ${normalized} target.`);
  }
}

export function assertTestProject(
  catalog: NxProjectCatalog,
  projectId: string,
  nearestTestRoots: string[],
): NxWorkspaceProject {
  const project = nxProject(catalog, projectId);
  if (project.root === '.') {
    throw new Error(
      `Workspace-root Nx project ${project.name} cannot own a focused product TEST.`,
    );
  }
  assertProjectHasTarget(project, 'test');
  assertProjectIntersectsTestRoots(project, nearestTestRoots);
  return project;
}
