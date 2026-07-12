import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { findFiles } from './artifact-index';
import { readTestProcess } from '../testing/process-catalog';
import type { ActiveWorkItem } from '../workflow/types';

const CODE_ROOTS = ['apps/', 'libs/'];
const EVIDENCE_SOURCE_ROOTS = [
  '.evidence/entities/',
  '.evidence/associations/',
];
const EXAMPLE_PATTERN = /^(US-\d+)-(SC-\d+)\.md$/i;
const MODEL_FILE_PATTERN = /\.ya?ml$/i;

function runGit(cwd: string, args: string[]): string {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  } catch {
    throw new Error(
      'Evidence Orchestrator requires a Git repository with an initial commit to create auditable coding evidence.',
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

function examplePaths(cwd: string, artifactRoot: string): string[] {
  const root = join(cwd, artifactRoot, '01-requirements/examples');
  return findFiles(root, (path) =>
    EXAMPLE_PATTERN.test(path.split('/').pop() ?? ''),
  );
}

function sourceModelPaths(cwd: string): string[] {
  return EVIDENCE_SOURCE_ROOTS.flatMap((root) =>
    findFiles(join(cwd, root), (path) => MODEL_FILE_PATTERN.test(path)).map(
      (path) => path.slice(cwd.length + 1),
    ),
  ).sort();
}

interface ModelIndex {
  entityIds: Set<string>;
  associationIds: Set<string>;
}

function frontmatterValue(text: string, key: string): string | undefined {
  const match = new RegExp(`^${key}:\\s*(.+?)\\s*$`, 'm').exec(text);
  return match?.[1]?.replace(/^['"]|['"]$/g, '');
}

function buildModelIndex(cwd: string, paths: string[]): ModelIndex {
  const entityIds = new Set<string>();
  const associationIds = new Set<string>();
  const allIds = new Set<string>();
  for (const path of paths) {
    const text = readFileSync(join(cwd, path), 'utf8');
    const id = frontmatterValue(text, 'id');
    if (!id)
      throw new Error(`Canonical model file has no frontmatter id: ${path}.`);
    if (allIds.has(id))
      throw new Error(`Canonical model contains duplicate id ${id}.`);
    allIds.add(id);
    if (path.startsWith('.evidence/entities/')) entityIds.add(id);
    else associationIds.add(id);
  }

  for (const path of paths.filter((entry) =>
    entry.startsWith('.evidence/associations/'),
  )) {
    const text = readFileSync(join(cwd, path), 'utf8');
    const source = frontmatterValue(text, 'source');
    const target = frontmatterValue(text, 'target');
    if (
      !source ||
      !target ||
      !entityIds.has(source) ||
      !entityIds.has(target)
    ) {
      throw new Error(
        `Association ${path} must reference existing source and target entity ids.`,
      );
    }
  }
  return { entityIds, associationIds };
}

function validateModelExpansion(
  cwd: string,
  artifactRoot: string,
  examplePath: string,
  modelIndex: ModelIndex,
): void {
  const exampleName = examplePath.split('/').pop() ?? '';
  const match = EXAMPLE_PATTERN.exec(exampleName);
  const storyId = match?.[1]?.toUpperCase();
  const scenarioId = match?.[2]?.toUpperCase();
  if (!storyId || !scenarioId) return;
  const expansionPath = `${artifactRoot}/02-domain-model/model-expansions/${storyId}-${scenarioId}.json`;
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
  const modelRefs = expectRecord(
    expansion.model_refs,
    `${expansionPath}.model_refs`,
  );
  for (const id of expectNonEmptyStringArray(
    modelRefs.entities,
    `${expansionPath}.model_refs.entities`,
  )) {
    if (!modelIndex.entityIds.has(id)) {
      throw new Error(
        `${expansionPath} references unknown model entity id ${id}.`,
      );
    }
  }
  for (const id of expectStringArray(
    modelRefs.associations,
    `${expansionPath}.model_refs.associations`,
  )) {
    if (!modelIndex.associationIds.has(id)) {
      throw new Error(
        `${expansionPath} references unknown model association id ${id}.`,
      );
    }
  }
}

interface ModelChanges {
  added: string[];
  changed: string[];
  removed: string[];
}

function changedModelPathsSince(cwd: string, baseline: string): ModelChanges {
  runGit(cwd, ['cat-file', '-e', `${baseline}^{commit}`]);
  const changes: ModelChanges = { added: [], changed: [], removed: [] };
  const tracked = runGit(cwd, [
    'diff',
    '--name-status',
    baseline,
    '--',
    '.evidence',
  ])
    .split('\n')
    .filter(Boolean);
  for (const line of tracked) {
    const [status = '', ...pathParts] = line.split('\t');
    const path = pathParts.at(-1);
    if (!path) continue;
    if (status.startsWith('A')) changes.added.push(path);
    else if (status.startsWith('D')) changes.removed.push(path);
    else changes.changed.push(path);
  }
  changes.added.push(
    ...runGit(cwd, [
      'ls-files',
      '--others',
      '--exclude-standard',
      '--',
      '.evidence',
    ])
      .split('\n')
      .filter(Boolean),
  );
  for (const paths of Object.values(changes)) paths.sort();
  return changes;
}

/** Validate .evidence as the canonical project model and artifacts as iteration evidence. */
export function validateDomainModelEvidence(
  cwd: string,
  artifactRoot = 'artifacts',
): void {
  const modelMetadataPath = '.evidence/model.json';
  const modelMetadata = expectRecord(
    readJson(join(cwd, modelMetadataPath)),
    modelMetadataPath,
  );
  if (modelMetadata.version !== 1)
    throw new Error(`${modelMetadataPath}.version must be 1.`);
  expectString(modelMetadata.project_name, `${modelMetadataPath}.project_name`);
  expectString(modelMetadata.purpose, `${modelMetadataPath}.purpose`);

  const snapshotPath = `${artifactRoot}/02-domain-model/model-snapshot.json`;
  const snapshot = expectRecord(
    readJson(join(cwd, snapshotPath)),
    snapshotPath,
  );
  if (snapshot.version !== 1)
    throw new Error(`${snapshotPath}.version must be 1.`);
  const baseline = expectString(
    snapshot.git_baseline,
    `${snapshotPath}.git_baseline`,
  );
  if (snapshot.model_root !== '.evidence/') {
    throw new Error(`${snapshotPath}.model_root must be .evidence/.`);
  }
  const includedPaths = expectNonEmptyStringArray(
    snapshot.included_paths,
    `${snapshotPath}.included_paths`,
  ).sort();
  for (const path of includedPaths) {
    if (!EVIDENCE_SOURCE_ROOTS.some((root) => path.startsWith(root))) {
      throw new Error(
        `${snapshotPath} includes a path outside the canonical model: ${path}.`,
      );
    }
    requireFile(cwd, path, `${snapshotPath}.included_paths`);
  }

  const expectedSourcePaths = sourceModelPaths(cwd);
  if (expectedSourcePaths.length === 0) {
    throw new Error(
      'The canonical .evidence model has no entity or association files.',
    );
  }
  if (JSON.stringify(includedPaths) !== JSON.stringify(expectedSourcePaths)) {
    throw new Error(
      `${snapshotPath}.included_paths must exactly match the canonical .evidence model.`,
    );
  }
  const modelIndex = buildModelIndex(cwd, expectedSourcePaths);

  const deltaPath = `${artifactRoot}/02-domain-model/model-delta.json`;
  const delta = expectRecord(readJson(join(cwd, deltaPath)), deltaPath);
  if (delta.version !== 1) throw new Error(`${deltaPath}.version must be 1.`);
  if (
    expectString(delta.git_baseline, `${deltaPath}.git_baseline`) !== baseline
  ) {
    throw new Error(
      `${deltaPath} and ${snapshotPath} must use the same Git baseline.`,
    );
  }
  expectString(delta.reason, `${deltaPath}.reason`);
  const actualChanges = changedModelPathsSince(cwd, baseline);
  for (const field of ['added', 'changed', 'removed'] as const) {
    const recorded = expectStringArray(
      delta[field],
      `${deltaPath}.${field}`,
    ).sort();
    if (JSON.stringify(recorded) !== JSON.stringify(actualChanges[field])) {
      throw new Error(
        `${deltaPath}.${field} must exactly match .evidence Git changes since baseline.`,
      );
    }
  }

  const examples = examplePaths(cwd, artifactRoot);
  if (examples.length === 0) {
    throw new Error(
      'No US-xxx-SC-xxx acceptance examples were found for model expansion.',
    );
  }
  for (const absoluteExamplePath of examples) {
    validateModelExpansion(
      cwd,
      artifactRoot,
      absoluteExamplePath.slice(cwd.length + 1),
      modelIndex,
    );
  }
}

/** Refuse ambiguous coding attribution when the work tree already contains code edits. */
export function createCodingGitBaseline(cwd: string): string {
  const dirtyPaths = codePaths(
    runGit(cwd, ['status', '--porcelain=v1', '--untracked-files=all'])
      .split('\n')
      .filter(Boolean)
      .map((line) =>
        (line.slice(3).split(' -> ').at(-1) ?? '').replaceAll('"', ''),
      ),
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

function sameStrings(left: string[], right: string[]): boolean {
  return (
    JSON.stringify([...new Set(left)].sort()) ===
    JSON.stringify([...new Set(right)].sort())
  );
}

function validateTestPaths(cwd: string, paths: string[], name: string): void {
  for (const testPath of paths) {
    if (!isCodePath(testPath) || !isTestPath(testPath)) {
      throw new Error(`${name} must contain test paths under apps/ or libs/.`);
    }
    requireFile(cwd, testPath, name);
  }
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

function validateObservedExecutions(
  cwd: string,
  artifactRoot: string,
  workItem: ActiveWorkItem,
  evidencePath: string,
  processId: string,
  tdd: Record<string, unknown>,
  qualityGates: unknown[],
): void {
  const logPath = join(
    cwd,
    artifactRoot,
    '05-code',
    workItem.story_id,
    `${workItem.scenario_id}.execution.jsonl`,
  );
  if (!existsSync(logPath)) {
    throw new Error(
      `${evidencePath} requires tool-observed execution log ${logPath}.`,
    );
  }
  const records = readFileSync(logPath, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line, index) =>
      expectRecord(JSON.parse(line), `${logPath}:${index + 1}`),
    );
  const hasRecord = (stage: string, command: string, exitCode: number) =>
    records.some(
      (record) =>
        record.process_id === processId &&
        record.stage === stage &&
        record.command === command &&
        record.exit_code === exitCode,
    );
  for (const stage of ['red', 'green', 'refactor'] as const) {
    const step = expectRecord(tdd[stage], `${evidencePath}.tdd.${stage}`);
    const exitCode = step.exit_code as number;
    const command = expectString(
      step.command,
      `${evidencePath}.tdd.${stage}.command`,
    );
    if (!hasRecord(stage, command, exitCode)) {
      throw new Error(
        `${evidencePath} has no observed ${stage} execution for ${processId}.`,
      );
    }
  }
  for (const gate of qualityGates) {
    const value = expectRecord(
      gate,
      `${evidencePath}.test_process.quality_gates`,
    );
    const command = expectString(
      value.command,
      `${evidencePath}.test_process.quality_gates.command`,
    );
    if (!hasRecord('quality_gate', command, 0)) {
      throw new Error(
        `${evidencePath} has no observed quality gate execution for ${processId}: ${command}.`,
      );
    }
  }
}

function validateCompositeProcessEvidence(
  cwd: string,
  artifactRoot: string,
  workItem: ActiveWorkItem,
  evidencePath: string,
  evidence: Record<string, unknown>,
  selections: NonNullable<ActiveWorkItem['test_plan']>['processes'],
): void {
  if (selections.length < 2) return;
  if (!Array.isArray(evidence.test_processes)) {
    throw new Error(
      `${evidencePath}.test_processes must record every process in a multi-runtime test plan.`,
    );
  }
  if (evidence.test_processes.length !== selections.length) {
    throw new Error(
      `${evidencePath}.test_processes must record every selected process.`,
    );
  }
  for (const selection of selections) {
    const recorded = evidence.test_processes
      .map((value, index) =>
        expectRecord(value, `${evidencePath}.test_processes[${index}]`),
      )
      .find(
        (value) => value.id === selection.id && value.path === selection.path,
      );
    if (
      !recorded ||
      !Array.isArray(recorded.steps) ||
      !Array.isArray(recorded.quality_gates)
    ) {
      throw new Error(
        `${evidencePath} is missing complete evidence for test process ${selection.id}.`,
      );
    }
    const definition = readTestProcess(join(cwd, selection.path));
    if (recorded.steps.length !== definition.steps.length) {
      throw new Error(
        `${evidencePath} must record every step for test process ${selection.id}.`,
      );
    }
    for (const definitionStep of definition.steps) {
      const step = recorded.steps
        .map((value, index) =>
          expectRecord(
            value,
            `${evidencePath}.test_processes.${selection.id}.steps[${index}]`,
          ),
        )
        .find((value) => value.id === definitionStep.id);
      if (
        !step ||
        step.quadrant !== definitionStep.quadrant ||
        step.functional_context !== definitionStep.functional_context ||
        step.test_double !== definitionStep.test_double
      ) {
        throw new Error(
          `${evidencePath} does not match step ${definitionStep.id} in ${selection.id}.`,
        );
      }
      validateTestPaths(
        cwd,
        expectNonEmptyStringArray(
          step.tests,
          `${evidencePath}.test_processes.${selection.id}.steps.${definitionStep.id}.tests`,
        ),
        `${evidencePath}.test_processes.${selection.id}.steps.${definitionStep.id}.tests`,
      );
      const stepTdd = expectRecord(
        step.tdd,
        `${evidencePath}.test_processes.${selection.id}.steps.${definitionStep.id}.tdd`,
      );
      validateTddStep(
        stepTdd.red,
        `${evidencePath}.test_processes.${selection.id}.steps.${definitionStep.id}.tdd.red`,
        'nonzero',
      );
      validateTddStep(
        stepTdd.green,
        `${evidencePath}.test_processes.${selection.id}.steps.${definitionStep.id}.tdd.green`,
        0,
      );
      validateTddStep(
        stepTdd.refactor,
        `${evidencePath}.test_processes.${selection.id}.steps.${definitionStep.id}.tdd.refactor`,
        0,
      );
      if (workItem.test_plan?.execution_evidence_version === 1) {
        validateObservedExecutions(
          cwd,
          artifactRoot,
          workItem,
          evidencePath,
          selection.id,
          stepTdd,
          [],
        );
      }
    }
    for (const command of definition.quality_gates) {
      const gate = recorded.quality_gates.find(
        (value) =>
          isRecord(value) && value.command === command && value.exit_code === 0,
      );
      if (!gate)
        throw new Error(
          `${evidencePath} must record quality gate ${command} for ${selection.id}.`,
        );
      if (workItem.test_plan?.execution_evidence_version === 1) {
        const firstStep = expectRecord(
          recorded.steps[0],
          `${evidencePath}.test_processes.${selection.id}.steps[0]`,
        );
        validateObservedExecutions(
          cwd,
          artifactRoot,
          workItem,
          evidencePath,
          selection.id,
          expectRecord(
            firstStep.tdd,
            `${evidencePath}.test_processes.${selection.id}.steps[0].tdd`,
          ),
          [gate],
        );
      }
    }
  }
}

/** Validate machine-readable TDD and Git evidence for one selected acceptance scenario. */
export function validateScenarioExecutionEvidence(
  cwd: string,
  workItem: ActiveWorkItem,
  artifactRoot = 'artifacts',
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
  const selectedProcesses =
    workItem.test_plan?.processes ??
    (workItem.test_process ? [workItem.test_process] : []);
  const selectedProcess = selectedProcesses[0];
  if (!selectedProcess) {
    throw new Error(
      'Selected coding work item has no test process. Select one before changing code.',
    );
  }
  const process = readTestProcess(join(cwd, selectedProcess.path));
  if (process.id !== selectedProcess.id) {
    throw new Error(
      `Selected test process id ${selectedProcess.id} does not match ${selectedProcess.path}.`,
    );
  }
  if (process.applies_to.runtime !== selectedProcess.runtime) {
    throw new Error(
      `Selected test process runtime does not match ${selectedProcess.path}.`,
    );
  }
  if (
    !selectedProcesses.every((selection) => {
      const definition = readTestProcess(join(cwd, selection.path));
      return selection.functional_contexts.every((context) =>
        definition.applies_to.functional_contexts.includes(context),
      );
    })
  ) {
    throw new Error(
      `Selected test process does not cover every selected functional context.`,
    );
  }
  const evidencePath = `${artifactRoot}/05-code/${storyId}/${scenarioId}.json`;
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
  const recordedProcess = expectRecord(
    recordedWorkItem.test_process,
    `${evidencePath}.work_item.test_process`,
  );
  for (const [field, expected] of Object.entries({
    id: selectedProcess.id,
    path: selectedProcess.path,
    runtime: selectedProcess.runtime,
  })) {
    if (
      expectString(
        recordedProcess[field],
        `${evidencePath}.work_item.test_process.${field}`,
      ) !== expected
    ) {
      throw new Error(
        `${evidencePath} test process does not match the selected work item.`,
      );
    }
  }
  if (
    !sameStrings(
      expectNonEmptyStringArray(
        recordedProcess.functional_contexts,
        `${evidencePath}.work_item.test_process.functional_contexts`,
      ),
      selectedProcess.functional_contexts,
    )
  ) {
    throw new Error(
      `${evidencePath} test process contexts do not match the selected work item.`,
    );
  }
  if (selectedProcesses.length > 1) {
    const recordedPlan = expectRecord(
      recordedWorkItem.test_plan,
      `${evidencePath}.work_item.test_plan`,
    );
    if (recordedPlan.version !== 1 || !Array.isArray(recordedPlan.processes)) {
      throw new Error(
        `${evidencePath}.work_item.test_plan must record version=1 and every selected process.`,
      );
    }
    const recordedSelections = recordedPlan.processes.map((entry, index) =>
      expectRecord(
        entry,
        `${evidencePath}.work_item.test_plan.processes[${index}]`,
      ),
    );
    if (
      recordedSelections.length !== selectedProcesses.length ||
      !selectedProcesses.every((selection) =>
        recordedSelections.some(
          (recorded) =>
            recorded.id === selection.id &&
            recorded.path === selection.path &&
            recorded.runtime === selection.runtime,
        ),
      )
    ) {
      throw new Error(
        `${evidencePath} test plan does not match the selected work item.`,
      );
    }
  }

  const traceability = expectRecord(
    evidence.traceability,
    `${evidencePath}.traceability`,
  );
  const scenarioPath = `${artifactRoot}/01-requirements/examples/${storyId}-${scenarioId}.md`;
  if (
    expectString(
      traceability.scenario,
      `${evidencePath}.traceability.scenario`,
    ) !== scenarioPath
  ) {
    throw new Error(`${evidencePath} must trace to ${scenarioPath}.`);
  }
  requireFile(cwd, scenarioPath, `${evidencePath}.traceability.scenario`);
  const q2Tests = expectNonEmptyStringArray(
    traceability.q2_tests,
    `${evidencePath}.traceability.q2_tests`,
  );
  const q1Tests = expectNonEmptyStringArray(
    traceability.q1_tests,
    `${evidencePath}.traceability.q1_tests`,
  );
  validateTestPaths(cwd, q2Tests, `${evidencePath}.traceability.q2_tests`);
  validateTestPaths(cwd, q1Tests, `${evidencePath}.traceability.q1_tests`);
  const functionalContexts = expectNonEmptyStringArray(
    traceability.functional_contexts,
    `${evidencePath}.traceability.functional_contexts`,
  );
  const allSelectedContexts = selectedProcesses.flatMap(
    ({ functional_contexts }) => functional_contexts,
  );
  if (!sameStrings(functionalContexts, allSelectedContexts)) {
    throw new Error(
      `${evidencePath} must trace exactly to the selected functional contexts.`,
    );
  }

  const processEvidence = expectRecord(
    evidence.test_process,
    `${evidencePath}.test_process`,
  );
  if (
    expectString(processEvidence.id, `${evidencePath}.test_process.id`) !==
      process.id ||
    expectString(processEvidence.path, `${evidencePath}.test_process.path`) !==
      selectedProcess.path
  ) {
    throw new Error(`${evidencePath} must identify the selected test process.`);
  }
  if (!Array.isArray(processEvidence.steps)) {
    throw new Error(`${evidencePath}.test_process.steps must be an array.`);
  }
  const evidenceSteps = processEvidence.steps.map((step, index) =>
    expectRecord(step, `${evidencePath}.test_process.steps[${index}]`),
  );
  if (evidenceSteps.length !== process.steps.length) {
    throw new Error(
      `${evidencePath} must record every selected test-process step.`,
    );
  }
  const processQ1Tests: string[] = [];
  const processQ2Tests: string[] = [];
  const processChangedCodePaths: string[] = [];
  for (const processStep of process.steps) {
    const step = evidenceSteps.find(
      (candidate) => candidate.id === processStep.id,
    );
    if (!step) {
      throw new Error(
        `${evidencePath} is missing test-process step ${processStep.id}.`,
      );
    }
    for (const [field, expected] of Object.entries({
      quadrant: processStep.quadrant,
      functional_context: processStep.functional_context,
      test_double: processStep.test_double,
    })) {
      if (
        expectString(
          step[field],
          `${evidencePath}.test_process.steps.${processStep.id}.${field}`,
        ) !== expected
      ) {
        throw new Error(
          `${evidencePath} test-process step ${processStep.id} does not match its definition.`,
        );
      }
    }
    const stepTests = expectNonEmptyStringArray(
      step.tests,
      `${evidencePath}.test_process.steps.${processStep.id}.tests`,
    );
    validateTestPaths(
      cwd,
      stepTests,
      `${evidencePath}.test_process.steps.${processStep.id}.tests`,
    );
    if (processStep.quadrant === 'Q1') processQ1Tests.push(...stepTests);
    else processQ2Tests.push(...stepTests);
    const stepChanges = expectNonEmptyStringArray(
      step.changed_code_paths,
      `${evidencePath}.test_process.steps.${processStep.id}.changed_code_paths`,
    );
    if (!stepChanges.every(isCodePath)) {
      throw new Error(
        `${evidencePath} test-process step ${processStep.id} changed_code_paths must only contain apps/ or libs/ paths.`,
      );
    }
    processChangedCodePaths.push(...stepChanges);
    const stepTdd = expectRecord(
      step.tdd,
      `${evidencePath}.test_process.steps.${processStep.id}.tdd`,
    );
    validateTddStep(
      stepTdd.red,
      `${evidencePath}.test_process.steps.${processStep.id}.tdd.red`,
      'nonzero',
    );
    if (
      expectRecord(
        stepTdd.red,
        `${evidencePath}.test_process.steps.${processStep.id}.tdd.red`,
      ).expected_failure !== true
    ) {
      throw new Error(
        `${evidencePath} test-process Red step ${processStep.id} must be an expected failure.`,
      );
    }
    validateTddStep(
      stepTdd.green,
      `${evidencePath}.test_process.steps.${processStep.id}.tdd.green`,
      0,
    );
    validateTddStep(
      stepTdd.refactor,
      `${evidencePath}.test_process.steps.${processStep.id}.tdd.refactor`,
      0,
    );
  }
  if (
    selectedProcesses.length === 1 &&
    (!sameStrings(q1Tests, processQ1Tests) ||
      !sameStrings(q2Tests, processQ2Tests))
  ) {
    throw new Error(
      `${evidencePath} Q1/Q2 traceability must exactly match test-process steps.`,
    );
  }
  const qualityGates = processEvidence.quality_gates;
  if (
    !Array.isArray(qualityGates) ||
    qualityGates.length !== process.quality_gates.length
  ) {
    throw new Error(
      `${evidencePath}.test_process.quality_gates must record every defined gate.`,
    );
  }
  for (const command of process.quality_gates) {
    const gate = qualityGates.find(
      (candidate) => isRecord(candidate) && candidate.command === command,
    );
    if (
      !gate ||
      expectRecord(gate, `${evidencePath}.test_process.quality_gates`)
        .exit_code !== 0
    ) {
      throw new Error(
        `${evidencePath} quality gate ${command} must exit with 0.`,
      );
    }
  }

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
  if (!sameStrings(processChangedCodePaths, actualChanges)) {
    throw new Error(
      `${evidencePath} test-process step changes must exactly cover Git changes since the work-item baseline.`,
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
  validateCompositeProcessEvidence(
    cwd,
    artifactRoot,
    workItem,
    evidencePath,
    evidence,
    selectedProcesses,
  );
  if (workItem.test_plan?.execution_evidence_version === 1) {
    validateObservedExecutions(
      cwd,
      artifactRoot,
      workItem,
      evidencePath,
      process.id,
      tdd,
      qualityGates as unknown[],
    );
  }
}
