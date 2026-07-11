import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { findFiles } from './artifacts';
import type { ActiveWorkItem } from './types';

const CODE_ROOTS = ['apps/', 'libs/'];
const EVIDENCE_SOURCE_ROOTS = [
  '.evidence/entities/',
  '.evidence/associations/',
];
const EXAMPLE_PATTERN = /^(US-\d+)-(SC-\d+)\.md$/i;

function runGit(cwd: string, args: string[]): string {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  } catch {
    throw new Error(
      'Evidence Workflow requires a Git repository with an initial commit to create auditable coding evidence.',
    );
  }
}

function codePaths(paths: string[]): string[] {
  return paths.filter((path) =>
    CODE_ROOTS.some((root) => path.startsWith(root)),
  );
}

function isCodePath(path: string): boolean {
  return CODE_ROOTS.some((root) => path.startsWith(root));
}

function isTestPath(path: string): boolean {
  return /\.(spec|test)\.[^.]+$/i.test(path);
}

function readJson(path: string): unknown {
  if (!existsSync(path))
    throw new Error(`Missing structured evidence: ${path}.`);
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new Error(`Invalid JSON evidence: ${path}.`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function expectRecord(value: unknown, name: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${name} must be a JSON object.`);
  return value;
}

function expectString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${name} must be a non-empty string.`);
  }
  return value;
}

function expectStringArray(value: unknown, name: string): string[] {
  if (
    !Array.isArray(value) ||
    !value.every((entry) => typeof entry === 'string')
  ) {
    throw new Error(`${name} must be an array of strings.`);
  }
  return value;
}

function expectNonEmptyStringArray(value: unknown, name: string): string[] {
  const entries = expectStringArray(value, name);
  if (entries.length === 0) throw new Error(`${name} must not be empty.`);
  return entries;
}

function requireFile(cwd: string, path: string, name: string): void {
  const absolute = join(cwd, path);
  if (!existsSync(absolute) || !statSync(absolute).isFile()) {
    throw new Error(`${name} does not reference an existing file: ${path}.`);
  }
}

function examplePaths(cwd: string): string[] {
  const root = join(cwd, 'artifacts/01-requirements/examples');
  return findFiles(root, (path) =>
    EXAMPLE_PATTERN.test(path.split('/').pop() ?? ''),
  );
}

function sourceModelPaths(cwd: string): string[] {
  return EVIDENCE_SOURCE_ROOTS.flatMap((root) =>
    findFiles(join(cwd, root), (path) => path.endsWith('.md')).map((path) =>
      path.slice(cwd.length + 1),
    ),
  ).sort();
}

function validateModelExpansion(
  cwd: string,
  examplePath: string,
  includedSources: Set<string>,
): void {
  const exampleName = examplePath.split('/').pop() ?? '';
  const match = EXAMPLE_PATTERN.exec(exampleName);
  if (!match) return;
  const storyId = match[1]!.toUpperCase();
  const scenarioId = match[2]!.toUpperCase();
  const expansionPath = `artifacts/02-domain-model/model-expansions/${storyId}-${scenarioId}.json`;
  const expansion = expectRecord(
    readJson(join(cwd, expansionPath)),
    expansionPath,
  );

  if (expansion.version !== 1)
    throw new Error(`${expansionPath}.version must be 1.`);
  const workItem = expectRecord(
    expansion.work_item,
    `${expansionPath}.work_item`,
  );
  if (
    expectString(
      workItem.story_id,
      `${expansionPath}.work_item.story_id`,
    ).toUpperCase() !== storyId
  ) {
    throw new Error(`${expansionPath} must identify ${storyId}.`);
  }
  if (
    expectString(
      workItem.scenario_id,
      `${expansionPath}.work_item.scenario_id`,
    ).toUpperCase() !== scenarioId
  ) {
    throw new Error(`${expansionPath} must identify ${scenarioId}.`);
  }
  if (
    expectString(
      expansion.source_scenario,
      `${expansionPath}.source_scenario`,
    ) !== examplePath
  ) {
    throw new Error(`${expansionPath} must trace to ${examplePath}.`);
  }

  const given = expectRecord(expansion.given, `${expansionPath}.given`);
  expectStringArray(given.entities, `${expansionPath}.given.entities`);
  expectStringArray(
    given.relationships,
    `${expansionPath}.given.relationships`,
  );
  const when = expectRecord(expansion.when, `${expansionPath}.when`);
  expectString(when.command, `${expansionPath}.when.command`);
  const then = expectRecord(expansion.then, `${expansionPath}.then`);
  for (const field of [
    'created_entities',
    'changed_entities',
    'created_relationships',
    'removed_relationships',
  ]) {
    expectStringArray(then[field], `${expansionPath}.then.${field}`);
  }
  expectNonEmptyStringArray(
    expansion.invariants,
    `${expansionPath}.invariants`,
  );
  expectNonEmptyStringArray(expansion.timeline, `${expansionPath}.timeline`);
  const sources = expectNonEmptyStringArray(
    expansion.evidence_sources,
    `${expansionPath}.evidence_sources`,
  );
  for (const source of sources) {
    if (!includedSources.has(source)) {
      throw new Error(
        `${expansionPath} references a source absent from the evidence manifest: ${source}.`,
      );
    }
  }
}

/** Validate that .evidence inputs and all scenario model expansions are auditable. */
export function validateDomainModelEvidence(cwd: string): void {
  const manifestPath =
    'artifacts/02-domain-model/evidence-source-manifest.json';
  const manifest = expectRecord(
    readJson(join(cwd, manifestPath)),
    manifestPath,
  );
  if (manifest.version !== 1)
    throw new Error(`${manifestPath}.version must be 1.`);
  const roots = expectNonEmptyStringArray(
    manifest.source_roots,
    `${manifestPath}.source_roots`,
  );
  for (const root of EVIDENCE_SOURCE_ROOTS) {
    if (!roots.includes(root))
      throw new Error(`${manifestPath} must include ${root}.`);
  }
  const includedPaths = expectNonEmptyStringArray(
    manifest.included_paths,
    `${manifestPath}.included_paths`,
  );
  for (const path of includedPaths) {
    if (!EVIDENCE_SOURCE_ROOTS.some((root) => path.startsWith(root))) {
      throw new Error(
        `${manifestPath} includes a path outside the Evidence model roots: ${path}.`,
      );
    }
    requireFile(cwd, path, `${manifestPath}.included_paths`);
  }

  const expectedSourcePaths = sourceModelPaths(cwd);
  if (expectedSourcePaths.length === 0) {
    throw new Error(
      'No .evidence entity or association Markdown sources were found.',
    );
  }
  const includedSources = new Set(includedPaths);
  for (const source of expectedSourcePaths) {
    if (!includedSources.has(source)) {
      throw new Error(
        `${manifestPath} must include discovered source ${source}.`,
      );
    }
  }

  const examples = examplePaths(cwd);
  if (examples.length === 0) {
    throw new Error(
      'No US-xxx-SC-xxx acceptance examples were found for model expansion.',
    );
  }
  for (const absoluteExamplePath of examples) {
    validateModelExpansion(
      cwd,
      absoluteExamplePath.slice(cwd.length + 1),
      includedSources,
    );
  }
}

/** Refuse ambiguous coding attribution when the work tree already contains code edits. */
export function createCodingGitBaseline(cwd: string): string {
  const dirtyPaths = codePaths(
    runGit(cwd, ['status', '--porcelain=v1', '--untracked-files=all'])
      .split('\n')
      .filter(Boolean)
      .map((line) => line.slice(3).split(' -> ').at(-1)!.replaceAll('"', '')),
  );
  if (dirtyPaths.length > 0) {
    throw new Error(
      `Cannot select a coding work item with pre-existing code changes: ${dirtyPaths.join(', ')}. Commit, stash, or revert them first.`,
    );
  }
  return runGit(cwd, ['rev-parse', '--verify', 'HEAD']);
}

function changedCodePathsSince(cwd: string, baseline: string): string[] {
  const committedOrTracked = runGit(cwd, [
    'diff',
    '--name-only',
    baseline,
    '--',
    'apps',
    'libs',
  ]).split('\n');
  const untracked = runGit(cwd, [
    'ls-files',
    '--others',
    '--exclude-standard',
    '--',
    'apps',
    'libs',
  ]).split('\n');
  return [
    ...new Set(
      codePaths([...committedOrTracked, ...untracked].filter(Boolean)),
    ),
  ].sort();
}

function validateTddStep(
  value: unknown,
  name: string,
  expectedExitCode: number | 'nonzero',
): void {
  const step = expectRecord(value, name);
  expectString(step.command, `${name}.command`);
  if (typeof step.exit_code !== 'number') {
    throw new Error(`${name}.exit_code must be a number.`);
  }
  if (
    expectedExitCode === 'nonzero'
      ? step.exit_code === 0
      : step.exit_code !== expectedExitCode
  ) {
    throw new Error(
      `${name}.exit_code must be ${expectedExitCode === 'nonzero' ? 'non-zero' : expectedExitCode}.`,
    );
  }
}

/** Validate machine-readable TDD and Git evidence for one selected acceptance scenario. */
export function validateScenarioExecutionEvidence(
  cwd: string,
  workItem: ActiveWorkItem,
): void {
  const {
    story_id: storyId,
    scenario_id: scenarioId,
    git_baseline: baseline,
  } = workItem;
  if (!baseline)
    throw new Error(
      'Selected coding work item has no Git baseline. Re-select it before coding.',
    );
  const evidencePath = `artifacts/05-code/${storyId}/${scenarioId}.json`;
  const evidence = expectRecord(
    readJson(join(cwd, evidencePath)),
    evidencePath,
  );
  if (evidence.version !== 1)
    throw new Error(`${evidencePath}.version must be 1.`);

  const recordedWorkItem = expectRecord(
    evidence.work_item,
    `${evidencePath}.work_item`,
  );
  if (
    expectString(
      recordedWorkItem.story_id,
      `${evidencePath}.work_item.story_id`,
    ).toUpperCase() !== storyId
  ) {
    throw new Error(`${evidencePath} must identify ${storyId}.`);
  }
  if (
    expectString(
      recordedWorkItem.scenario_id,
      `${evidencePath}.work_item.scenario_id`,
    ).toUpperCase() !== scenarioId
  ) {
    throw new Error(`${evidencePath} must identify ${scenarioId}.`);
  }
  if (
    expectString(
      recordedWorkItem.git_baseline,
      `${evidencePath}.work_item.git_baseline`,
    ) !== baseline
  ) {
    throw new Error(
      `${evidencePath} Git baseline does not match the selected work item.`,
    );
  }

  const traceability = expectRecord(
    evidence.traceability,
    `${evidencePath}.traceability`,
  );
  const scenarioPath = `artifacts/01-requirements/examples/${storyId}-${scenarioId}.md`;
  if (
    expectString(
      traceability.scenario,
      `${evidencePath}.traceability.scenario`,
    ) !== scenarioPath
  ) {
    throw new Error(`${evidencePath} must trace to ${scenarioPath}.`);
  }
  requireFile(cwd, scenarioPath, `${evidencePath}.traceability.scenario`);
  for (const field of ['q2_tests', 'q1_tests']) {
    for (const testPath of expectNonEmptyStringArray(
      traceability[field],
      `${evidencePath}.traceability.${field}`,
    )) {
      if (!isCodePath(testPath) || !isTestPath(testPath)) {
        throw new Error(
          `${evidencePath}.traceability.${field} must contain test paths under apps/ or libs/.`,
        );
      }
      requireFile(cwd, testPath, `${evidencePath}.traceability.${field}`);
    }
  }
  expectNonEmptyStringArray(
    traceability.functional_contexts,
    `${evidencePath}.traceability.functional_contexts`,
  );

  const recordedChanges = expectNonEmptyStringArray(
    evidence.changed_code_paths,
    `${evidencePath}.changed_code_paths`,
  ).sort();
  if (!recordedChanges.every(isCodePath)) {
    throw new Error(
      `${evidencePath}.changed_code_paths must only contain apps/ or libs/ paths.`,
    );
  }
  const actualChanges = changedCodePathsSince(cwd, baseline);
  if (JSON.stringify(recordedChanges) !== JSON.stringify(actualChanges)) {
    throw new Error(
      `${evidencePath}.changed_code_paths must exactly match Git changes since the work-item baseline.`,
    );
  }
  if (
    !actualChanges.some(isTestPath) ||
    !actualChanges.some((path) => !isTestPath(path))
  ) {
    throw new Error(
      'Coding evidence must include both a changed test file and a changed production code file.',
    );
  }

  const tdd = expectRecord(evidence.tdd, `${evidencePath}.tdd`);
  validateTddStep(tdd.red, `${evidencePath}.tdd.red`, 'nonzero');
  if (
    expectRecord(tdd.red, `${evidencePath}.tdd.red`).expected_failure !== true
  ) {
    throw new Error(`${evidencePath}.tdd.red.expected_failure must be true.`);
  }
  validateTddStep(tdd.green, `${evidencePath}.tdd.green`, 0);
  validateTddStep(tdd.refactor, `${evidencePath}.tdd.refactor`, 0);
}
