import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { findFiles } from '../../iteration/artifact-inventory';
import type { TestDouble, TestProcessRuntime } from '../../iteration/state';

interface TestBoundaryDouble {
  boundary: string;
  test_double: TestDouble;
}

export interface FocusedCommandDefinition {
  template: string;
  allowed_variables: string[];
}

export type QualityGateScope = 'test_projects' | 'planned_projects' | 'process';

export interface QualityGateDefinition {
  scope: QualityGateScope;
  required_target?: string;
  template: string;
  allowed_variables: string[];
}

export interface TestProcessStep {
  id: string;
  quadrant: 'Q1' | 'Q2';
  functional_contexts: string[];
  purpose: string;
  real_boundaries: string[];
  replaced_boundaries: TestBoundaryDouble[];
  nearest_test: { rule: string; roots: string[] };
  focused_command: FocusedCommandDefinition;
  red: {
    expected_failure_kind: 'behavior';
    expected_failure: string;
  };
  green: { done_when: string };
  refactor: { done_when: string };
}

export interface TestProcessDefinition {
  version: 3;
  id: string;
  owner: string;
  runtime: TestProcessRuntime;
  functional_contexts: string[];
  technical_boundaries: string[];
  applies_when: string;
  steps: TestProcessStep[];
  quality_gates: QualityGateDefinition[];
}

export interface FocusedCommandBinding {
  test_id: string;
  step_id: string;
  variables: Record<string, string>;
}

export interface MaterializedFocusedCommand {
  test_id: string;
  step_id: string;
  project_id?: string;
  command: string;
}

export interface MaterializedQualityGate {
  project_id?: string;
  target?: string;
  command: string;
}

export interface MaterializedProcessHashInput {
  processId: string;
  definitionSha256: string;
  projectIds: string[];
  projectCatalogSha256?: string;
  commandVariablesByTest: Record<string, Record<string, string>>;
  focusedCommands: MaterializedFocusedCommand[];
  qualityGateCommands: MaterializedQualityGate[];
}

const RUNTIMES = new Set<TestProcessRuntime>(['rust', 'typescript', 'tauri']);
const TEST_DOUBLES = new Set<TestDouble>([
  'real',
  'fake',
  'stub',
  'spy',
  'mock',
]);
const COMMAND_VARIABLES = new Set(['project', 'test_filter']);
const COMMAND_VARIABLE_VALUE = /^[A-Za-z0-9_@./:-]+$/;
const PLACEHOLDER = /\{\{([a-z_]+)\}\}/g;
const PROCESS_ID = /^[a-z0-9][a-z0-9-]*$/;
const TEST_ID = /^TEST-\d{3,}$/;
const TARGET_NAME = /^[A-Za-z0-9_-]+$/;
const QUALITY_GATE_SCOPES = new Set<QualityGateScope>([
  'test_projects',
  'planned_projects',
  'process',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function record(value: unknown, name: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${name} must be a JSON object.`);
  return value;
}

function strictRecord(
  value: unknown,
  name: string,
  allowedFields: readonly string[],
): Record<string, unknown> {
  const result = record(value, name);
  const unsupported = Object.keys(result).filter(
    (field) => !allowedFields.includes(field),
  );
  if (unsupported.length > 0) {
    throw new Error(
      `${name} contains unsupported fields: ${unsupported.join(', ')}.`,
    );
  }
  return result;
}

function string(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} must be a non-empty string.`);
  }
  return value.trim();
}

function strings(
  value: unknown,
  name: string,
  options: { allowEmpty?: boolean } = {},
): string[] {
  if (!Array.isArray(value) || (!options.allowEmpty && value.length === 0)) {
    throw new Error(
      `${name} must be ${options.allowEmpty ? 'a' : 'a non-empty'} string array.`,
    );
  }
  const result = value.map((entry, index) =>
    string(entry, `${name}[${index}]`),
  );
  if (new Set(result).size !== result.length) {
    throw new Error(`${name} must contain unique values.`);
  }
  return result;
}

function readJson(path: string): unknown {
  if (!existsSync(path)) {
    throw new Error(`Test process file not found: ${path}.`);
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as unknown;
  } catch {
    throw new Error(`Test process file is not valid JSON: ${path}.`);
  }
}

function runtime(value: unknown, name: string): TestProcessRuntime {
  const result = string(value, name) as TestProcessRuntime;
  if (!RUNTIMES.has(result)) {
    throw new Error(`${name} is unsupported: ${result}.`);
  }
  return result;
}

function validateQuadrants(path: string, steps: TestProcessStep[]): void {
  if (steps.some(({ id }) => !PROCESS_ID.test(id))) {
    throw new Error(`${path}.steps ids must use lowercase kebab-case.`);
  }
  if (new Set(steps.map(({ id }) => id)).size !== steps.length) {
    throw new Error(`${path}.steps ids must be unique.`);
  }
  if (!steps.some(({ quadrant }) => quadrant === 'Q1')) {
    throw new Error(`${path}.steps must include at least one Q1 step.`);
  }
  if (!steps.some(({ quadrant }) => quadrant === 'Q2')) {
    throw new Error(`${path}.steps must include at least one Q2 step.`);
  }
}

function quadrant(value: unknown, name: string): 'Q1' | 'Q2' {
  const result = string(value, name);
  if (result !== 'Q1' && result !== 'Q2') {
    throw new Error(`${name} must be Q1 or Q2.`);
  }
  return result;
}

function testDouble(value: unknown, name: string): TestDouble {
  const result = string(value, name) as TestDouble;
  if (!TEST_DOUBLES.has(result)) {
    throw new Error(`${name} is unsupported: ${result}.`);
  }
  return result;
}

function commandDefinition(
  value: unknown,
  name: string,
): FocusedCommandDefinition {
  const source = strictRecord(value, name, ['template', 'allowed_variables']);
  const template = string(source.template, `${name}.template`);
  const allowedVariables = strings(
    source.allowed_variables,
    `${name}.allowed_variables`,
    { allowEmpty: true },
  );
  if (allowedVariables.some((variable) => !COMMAND_VARIABLES.has(variable))) {
    throw new Error(
      `${name}.allowed_variables contains an unsupported variable.`,
    );
  }
  const placeholders = [...template.matchAll(PLACEHOLDER)].map(
    (match) => match[1],
  );
  if (
    JSON.stringify([...new Set(placeholders)].sort()) !==
    JSON.stringify([...allowedVariables].sort())
  ) {
    throw new Error(
      `${name}.allowed_variables must exactly match template placeholders.`,
    );
  }
  return { template, allowed_variables: allowedVariables };
}

function focusedCommand(
  value: unknown,
  name: string,
): FocusedCommandDefinition {
  const command = commandDefinition(value, name);
  if (!command.allowed_variables.includes('test_filter')) {
    throw new Error(`${name} must declare test_filter.`);
  }
  return command;
}

function qualityGateScope(value: unknown, name: string): QualityGateScope {
  const result = string(value, name) as QualityGateScope;
  if (!QUALITY_GATE_SCOPES.has(result)) {
    throw new Error(`${name} is unsupported: ${result}.`);
  }
  return result;
}

function qualityGate(value: unknown, name: string): QualityGateDefinition {
  const source = strictRecord(value, name, [
    'scope',
    'required_target',
    'template',
    'allowed_variables',
  ]);
  const scope = qualityGateScope(source.scope, `${name}.scope`);
  const command = commandDefinition(
    {
      template: source.template,
      allowed_variables: source.allowed_variables,
    },
    name,
  );
  if (scope === 'process') {
    if (
      source.required_target !== undefined ||
      command.allowed_variables.length > 0
    ) {
      throw new Error(
        `${name} process scope must be static and omit required_target.`,
      );
    }
    return { scope, ...command };
  }
  const requiredTarget = string(
    source.required_target,
    `${name}.required_target`,
  );
  if (!TARGET_NAME.test(requiredTarget)) {
    throw new Error(`${name}.required_target has an unsafe target name.`);
  }
  if (
    command.allowed_variables.length !== 1 ||
    command.allowed_variables[0] !== 'project'
  ) {
    throw new Error(
      `${name} project scope must declare only the project variable.`,
    );
  }
  return {
    scope,
    required_target: requiredTarget,
    ...command,
  };
}

function parseStep(
  value: unknown,
  index: number,
  path: string,
  capabilities: string[],
  technicalBoundaries: string[],
): TestProcessStep {
  const name = `${path}.steps[${index}]`;
  const step = strictRecord(value, name, [
    'id',
    'purpose',
    'quadrant',
    'functional_contexts',
    'real_boundaries',
    'replaced_boundaries',
    'nearest_test',
    'focused_command',
    'red',
    'green',
    'refactor',
  ]);
  const contexts = strings(
    step.functional_contexts,
    `${name}.functional_contexts`,
  );
  if (!contexts.every((context) => capabilities.includes(context))) {
    throw new Error(
      `${name}.functional_contexts must be declared capabilities.`,
    );
  }
  const realBoundaries = strings(
    step.real_boundaries,
    `${name}.real_boundaries`,
  );
  if (!Array.isArray(step.replaced_boundaries)) {
    throw new Error(`${name}.replaced_boundaries must be an array.`);
  }
  const replacedBoundaries = step.replaced_boundaries.map(
    (entry, boundaryIndex) => {
      const boundary = strictRecord(
        entry,
        `${name}.replaced_boundaries[${boundaryIndex}]`,
        ['boundary', 'test_double'],
      );
      return {
        boundary: string(
          boundary.boundary,
          `${name}.replaced_boundaries[${boundaryIndex}].boundary`,
        ),
        test_double: testDouble(
          boundary.test_double,
          `${name}.replaced_boundaries[${boundaryIndex}].test_double`,
        ),
      };
    },
  );
  if (replacedBoundaries.some(({ test_double }) => test_double === 'real')) {
    throw new Error(`${name}.replaced_boundaries must use a test double.`);
  }
  const allBoundaries = [
    ...realBoundaries,
    ...replacedBoundaries.map(({ boundary }) => boundary),
  ];
  if (new Set(allBoundaries).size !== allBoundaries.length) {
    throw new Error(`${name} must not repeat a real or replaced boundary.`);
  }
  if (
    !allBoundaries.every((boundary) => technicalBoundaries.includes(boundary))
  ) {
    throw new Error(`${name} references an undeclared technical boundary.`);
  }
  const nearest = strictRecord(step.nearest_test, `${name}.nearest_test`, [
    'rule',
    'roots',
  ]);
  const red = strictRecord(step.red, `${name}.red`, [
    'expected_failure_kind',
    'expected_failure',
  ]);
  if (red.expected_failure_kind !== 'behavior') {
    throw new Error(`${name}.red.expected_failure_kind must be behavior.`);
  }
  const green = strictRecord(step.green, `${name}.green`, ['done_when']);
  const refactor = strictRecord(step.refactor, `${name}.refactor`, [
    'done_when',
  ]);
  return {
    id: string(step.id, `${name}.id`),
    quadrant: quadrant(step.quadrant, `${name}.quadrant`),
    functional_contexts: contexts,
    purpose: string(step.purpose, `${name}.purpose`),
    real_boundaries: realBoundaries,
    replaced_boundaries: replacedBoundaries,
    nearest_test: {
      rule: string(nearest.rule, `${name}.nearest_test.rule`),
      roots: strings(nearest.roots, `${name}.nearest_test.roots`),
    },
    focused_command: focusedCommand(
      step.focused_command,
      `${name}.focused_command`,
    ),
    red: {
      expected_failure_kind: 'behavior',
      expected_failure: string(
        red.expected_failure,
        `${name}.red.expected_failure`,
      ),
    },
    green: {
      done_when: string(green.done_when, `${name}.green.done_when`),
    },
    refactor: {
      done_when: string(refactor.done_when, `${name}.refactor.done_when`),
    },
  };
}

function readV3(
  path: string,
  source: Record<string, unknown>,
): TestProcessDefinition {
  const processRuntime = runtime(source.runtime, `${path}.runtime`);
  const appliesTo = strictRecord(source.applies_to, `${path}.applies_to`, [
    'capabilities',
    'technical_boundaries',
    'when',
  ]);
  const capabilities = strings(
    appliesTo.capabilities,
    `${path}.applies_to.capabilities`,
  );
  const technicalBoundaries = strings(
    appliesTo.technical_boundaries,
    `${path}.applies_to.technical_boundaries`,
  );
  if (!Array.isArray(source.steps) || source.steps.length === 0) {
    throw new Error(`${path}.steps must be a non-empty array.`);
  }
  const steps = source.steps.map((value, index) =>
    parseStep(value, index, path, capabilities, technicalBoundaries),
  );
  validateQuadrants(path, steps);
  if (
    !Array.isArray(source.quality_gates) ||
    source.quality_gates.length === 0
  ) {
    throw new Error(`${path}.quality_gates must be a non-empty array.`);
  }
  const qualityGates = source.quality_gates.map((gate, index) =>
    qualityGate(gate, `${path}.quality_gates[${index}]`),
  );
  if (
    new Set(qualityGates.map((gate) => JSON.stringify(gate))).size !==
    qualityGates.length
  ) {
    throw new Error(`${path}.quality_gates must be unique.`);
  }
  return {
    version: 3,
    id: string(source.id, `${path}.id`),
    owner: string(source.owner, `${path}.owner`),
    runtime: processRuntime,
    functional_contexts: capabilities,
    technical_boundaries: technicalBoundaries,
    applies_when: string(appliesTo.when, `${path}.applies_to.when`),
    steps,
    quality_gates: qualityGates,
  };
}

export function catalogTestProcessDirectory(cwd: string): string {
  return join(cwd, 'engineering/evidence-orchestrator/test-processes');
}

export function readTestProcess(path: string): TestProcessDefinition {
  const source = strictRecord(readJson(path), path, [
    'version',
    'id',
    'owner',
    'runtime',
    'applies_to',
    'steps',
    'quality_gates',
  ]);
  const id = string(source.id, `${path}.id`);
  if (!PROCESS_ID.test(id)) {
    throw new Error(`${path}.id must use lowercase kebab-case.`);
  }
  if (source.version !== 3) {
    throw new Error(`${path}.version must be 3 for active Tasking.`);
  }
  return readV3(path, source);
}

export function testProcessDefinitionSha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function canonicalVariablesByTest(
  variables: Record<string, Record<string, string>>,
): Record<string, Record<string, string>> {
  return Object.fromEntries(
    Object.entries(variables)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([testId, values]) => [
        testId,
        Object.fromEntries(Object.entries(values).sort()),
      ]),
  );
}

export function materializedProcessSha256(
  input: MaterializedProcessHashInput,
): string {
  const canonical = JSON.stringify({
    process_id: input.processId,
    definition_sha256: input.definitionSha256,
    project_ids: [...input.projectIds].sort(),
    ...(input.projectCatalogSha256
      ? { project_catalog_sha256: input.projectCatalogSha256 }
      : {}),
    command_variables_by_test: canonicalVariablesByTest(
      input.commandVariablesByTest,
    ),
    focused_commands: [...input.focusedCommands].sort((left, right) =>
      left.test_id.localeCompare(right.test_id),
    ),
    quality_gate_commands: input.qualityGateCommands,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

function validateVariables(
  variables: Record<string, string>,
  allowed: string[],
  subject: string,
): void {
  const names = Object.keys(variables).sort();
  if (JSON.stringify(names) !== JSON.stringify([...allowed].sort())) {
    throw new Error(
      `${subject} variables must exactly match: ${allowed.join(', ')}.`,
    );
  }
  for (const [name, value] of Object.entries(variables)) {
    if (
      !COMMAND_VARIABLE_VALUE.test(value) ||
      value.includes('..') ||
      value.trim() !== value
    ) {
      throw new Error(`${subject} variable ${name} has an unsafe value.`);
    }
  }
}

function materializeCommand(
  definition: { template: string; allowed_variables: string[] },
  variables: Record<string, string>,
  subject: string,
): string {
  validateVariables(variables, definition.allowed_variables, subject);
  let command = definition.template;
  for (const name of definition.allowed_variables) {
    command = command.replaceAll(`{{${name}}}`, variables[name] ?? '');
  }
  if (command.match(PLACEHOLDER)) {
    throw new Error(`${subject} contains an unresolved variable.`);
  }
  return command;
}

export function materializeFocusedCommands(
  definition: TestProcessDefinition,
  bindings: FocusedCommandBinding[],
): MaterializedFocusedCommand[] {
  if (!Array.isArray(bindings) || bindings.length === 0) {
    throw new Error(
      `${definition.id} requires at least one TEST command binding.`,
    );
  }
  if (
    bindings.some(({ test_id }) => !TEST_ID.test(test_id)) ||
    new Set(bindings.map(({ test_id }) => test_id)).size !== bindings.length
  ) {
    throw new Error(
      `${definition.id} command bindings require unique TEST-xxx ids.`,
    );
  }
  return bindings
    .map((binding) => {
      const step = definition.steps.find(({ id }) => id === binding.step_id);
      if (!step) {
        throw new Error(
          `${binding.test_id} references an unknown ${definition.id} step: ${binding.step_id}.`,
        );
      }
      const command = materializeCommand(
        step.focused_command,
        binding.variables,
        `${definition.id}/${binding.step_id}/${binding.test_id}`,
      );
      const projectId = binding.variables.project;
      return {
        test_id: binding.test_id,
        step_id: binding.step_id,
        ...(projectId ? { project_id: projectId } : {}),
        command,
      };
    })
    .sort((left, right) => left.test_id.localeCompare(right.test_id));
}

export function materializeQualityGates(
  definition: TestProcessDefinition,
  projectIds: string[],
  testProjectIds: string[],
): MaterializedQualityGate[] {
  const planned = [...new Set(projectIds)].sort();
  const testProjects = [...new Set(testProjectIds)].sort();
  if (testProjects.some((project) => !planned.includes(project))) {
    throw new Error(`${definition.id} TEST projects must be planned projects.`);
  }
  const commands = definition.quality_gates.flatMap((gate) => {
    if (gate.scope === 'process') {
      return [
        {
          command: materializeCommand(
            gate,
            {},
            `${definition.id} process quality gate`,
          ),
        },
      ];
    }
    const projects = gate.scope === 'test_projects' ? testProjects : planned;
    const target = gate.required_target;
    if (!target) {
      throw new Error(`${definition.id} project quality gate has no target.`);
    }
    return projects.map((projectId) => ({
      project_id: projectId,
      target,
      command: materializeCommand(
        gate,
        { project: projectId },
        `${definition.id}/${target}/${projectId} quality gate`,
      ),
    }));
  });
  if (commands.length === 0) {
    throw new Error(`${definition.id} materialized no quality gates.`);
  }
  if (
    new Set(commands.map(({ command }) => command)).size !== commands.length
  ) {
    throw new Error(
      `${definition.id} materialized duplicate quality commands.`,
    );
  }
  return commands;
}

export function validateTestProcessDirectory(
  directory: string,
): TestProcessDefinition[] {
  const files = findFiles(directory, (file) => file.endsWith('.json'));
  if (files.length === 0) {
    throw new Error(
      `Test-process directory has no JSON process definitions: ${directory}.`,
    );
  }
  const definitions = files.map((path) => readTestProcess(path));
  const ids = definitions.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) {
    throw new Error(`Test process ids must be unique in ${directory}.`);
  }
  const vocabularyPath = join(directory, '..', 'runtime-contexts.json');
  if (existsSync(vocabularyPath)) {
    const vocabulary = strictRecord(readJson(vocabularyPath), vocabularyPath, [
      'version',
      'purpose',
      'functional_contexts',
      'technical_boundaries',
    ]);
    if (vocabulary.version !== 2) {
      throw new Error(`${vocabularyPath}.version must be 2.`);
    }
    if (!Array.isArray(vocabulary.functional_contexts)) {
      throw new Error(
        `${vocabularyPath}.functional_contexts must be an array.`,
      );
    }
    const capabilities = vocabulary.functional_contexts.map((entry, index) =>
      string(
        strictRecord(entry, `${vocabularyPath}.functional_contexts[${index}]`, [
          'id',
          'description',
        ]).id,
        `${vocabularyPath}.functional_contexts[${index}].id`,
      ),
    );
    const boundaries = strictRecord(
      vocabulary.technical_boundaries,
      `${vocabularyPath}.technical_boundaries`,
      [...RUNTIMES],
    );
    for (const definition of definitions) {
      if (
        !definition.functional_contexts.every((context) =>
          capabilities.includes(context),
        )
      ) {
        throw new Error(
          `${definition.id} references a functional context outside ${vocabularyPath}.`,
        );
      }
      const runtimeBoundaries = strings(
        boundaries[definition.runtime],
        `${vocabularyPath}.technical_boundaries.${definition.runtime}`,
      );
      if (
        !definition.technical_boundaries.every((boundary) =>
          runtimeBoundaries.includes(boundary),
        )
      ) {
        throw new Error(
          `${definition.id} references a technical boundary outside ${vocabularyPath}.`,
        );
      }
    }
  }
  return definitions;
}

export function matchingTestProcesses(
  cwd: string,
  directory: string,
  requestedRuntime: TestProcessRuntime,
  functionalContexts: string[],
  technicalBoundaries: string[] = [],
): Array<{ path: string; definition: TestProcessDefinition }> {
  return matchingTestProcessesInDirectories(
    cwd,
    [directory],
    requestedRuntime,
    functionalContexts,
    technicalBoundaries,
  );
}

function matchingTestProcessesInDirectories(
  cwd: string,
  directories: string[],
  requestedRuntime: TestProcessRuntime,
  functionalContexts: string[],
  technicalBoundaries: string[] = [],
): Array<{ path: string; definition: TestProcessDefinition }> {
  if (functionalContexts.length === 0) {
    throw new Error('At least one functional context is required.');
  }
  if (new Set(functionalContexts).size !== functionalContexts.length) {
    throw new Error('Functional contexts must be unique.');
  }
  if (new Set(technicalBoundaries).size !== technicalBoundaries.length) {
    throw new Error('Technical boundaries must be unique.');
  }
  const byId = new Map<
    string,
    { path: string; definition: TestProcessDefinition }
  >();
  for (const directory of directories) {
    if (!existsSync(directory)) continue;
    for (const path of findFiles(directory, (file) => file.endsWith('.json'))) {
      const candidate = { path, definition: readTestProcess(path) };
      if (!byId.has(candidate.definition.id)) {
        byId.set(candidate.definition.id, candidate);
      }
    }
  }
  return [...byId.values()]
    .filter(({ definition }) => {
      if (definition.runtime !== requestedRuntime) return false;
      if (
        !functionalContexts.every((context) =>
          definition.functional_contexts.includes(context),
        )
      ) {
        return false;
      }
      return technicalBoundaries.every((boundary) =>
        definition.technical_boundaries.includes(boundary),
      );
    })
    .map(({ path, definition }) => ({
      path: relative(cwd, join(path)),
      definition,
    }));
}
