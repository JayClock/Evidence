import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { findFiles } from '../evidence/artifact-index';
import type { TestDouble, TestProcessRuntime } from '../iteration/state';

export interface TestBoundaryDouble {
  boundary: string;
  test_double: TestDouble;
}

export interface FocusedCommandDefinition {
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
  test_list_template: string;
  nearest_test: { rule: string; roots: string[] };
  focused_command?: FocusedCommandDefinition;
  red: { expected_failure: string };
  green: { done_when: string };
  refactor: { done_when: string };
}

export interface TestProcessDefinition {
  version: 2;
  id: string;
  owner?: string;
  runtime: TestProcessRuntime;
  functional_contexts: string[];
  technical_boundaries: string[];
  applies_when: string;
  steps: TestProcessStep[];
  quality_gates: string[];
}

export interface MaterializedFocusedCommand {
  step_id: string;
  command: string;
}

const RUNTIMES = new Set<TestProcessRuntime>(['rust', 'typescript', 'tauri']);
const TEST_DOUBLES = new Set<TestDouble>([
  'real',
  'fake',
  'stub',
  'spy',
  'mock',
]);
const COMMAND_VARIABLES = new Set([
  'test_file',
  'test_name',
  'project',
  'test_filter',
]);
const COMMAND_VARIABLE_VALUE = /^[A-Za-z0-9_@./:-]+$/;
const PLACEHOLDER = /\{\{([a-z_]+)\}\}/g;
const PROCESS_ID = /^[a-z0-9][a-z0-9-]*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function record(value: unknown, name: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${name} must be a JSON object.`);
  return value;
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
  if (!existsSync(path))
    throw new Error(`Test process file not found: ${path}.`);
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

function focusedCommand(
  value: unknown,
  name: string,
): FocusedCommandDefinition {
  const source = record(value, name);
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

function readV2(
  path: string,
  source: Record<string, unknown>,
): TestProcessDefinition {
  const processRuntime = runtime(source.runtime, `${path}.runtime`);
  const appliesTo = record(source.applies_to, `${path}.applies_to`);
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
  const steps = source.steps.map((value, index) => {
    const name = `${path}.steps[${index}]`;
    const step = record(value, name);
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
        const boundary = record(
          entry,
          `${name}.replaced_boundaries[${boundaryIndex}]`,
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
    const nearest = record(step.nearest_test, `${name}.nearest_test`);
    const purpose = string(step.purpose, `${name}.purpose`);
    const red = record(step.red, `${name}.red`);
    const green = record(step.green, `${name}.green`);
    const refactor = record(step.refactor, `${name}.refactor`);
    return {
      id: string(step.id, `${name}.id`),
      quadrant: quadrant(step.quadrant, `${name}.quadrant`),
      functional_contexts: contexts,
      purpose,
      real_boundaries: realBoundaries,
      replaced_boundaries: replacedBoundaries,
      test_list_template: string(
        step.test_list_template,
        `${name}.test_list_template`,
      ),
      nearest_test: {
        rule: string(nearest.rule, `${name}.nearest_test.rule`),
        roots: strings(nearest.roots, `${name}.nearest_test.roots`),
      },
      focused_command: focusedCommand(
        step.focused_command,
        `${name}.focused_command`,
      ),
      red: {
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
    } satisfies TestProcessStep;
  });
  validateQuadrants(path, steps);
  return {
    version: 2,
    id: string(source.id, `${path}.id`),
    owner: string(source.owner, `${path}.owner`),
    runtime: processRuntime,
    functional_contexts: capabilities,
    technical_boundaries: technicalBoundaries,
    applies_when: string(appliesTo.when, `${path}.applies_to.when`),
    steps,
    quality_gates: strings(source.quality_gates, `${path}.quality_gates`),
  };
}

export function catalogTestProcessDirectory(cwd: string): string {
  return join(cwd, 'engineering/evidence-orchestrator/test-processes');
}

export function readTestProcess(path: string): TestProcessDefinition {
  const source = record(readJson(path), path);
  const id = string(source.id, `${path}.id`);
  if (!PROCESS_ID.test(id)) {
    throw new Error(`${path}.id must use lowercase kebab-case.`);
  }
  if (source.version !== 2) {
    throw new Error(`${path}.version must be 2 for active v5 Tasking.`);
  }
  return readV2(path, source);
}

export function testProcessDefinitionSha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

export function materializedProcessSha256(
  processId: string,
  definitionSha256: string,
  variables: Record<string, string>,
  commands: MaterializedFocusedCommand[],
): string {
  const canonical = JSON.stringify({
    process_id: processId,
    definition_sha256: definitionSha256,
    variables: Object.fromEntries(Object.entries(variables).sort()),
    commands,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

export function materializeFocusedCommands(
  definition: TestProcessDefinition,
  variables: Record<string, string>,
): MaterializedFocusedCommand[] {
  const usedVariables = new Set(
    definition.steps.flatMap(
      ({ focused_command }) => focused_command?.allowed_variables ?? [],
    ),
  );
  for (const [name, value] of Object.entries(variables)) {
    if (!usedVariables.has(name)) {
      throw new Error(
        `Focused command variable is not declared by ${definition.id}: ${name}.`,
      );
    }
    if (!COMMAND_VARIABLE_VALUE.test(value) || value.includes('..')) {
      throw new Error(`Focused command variable ${name} has an unsafe value.`);
    }
  }
  return definition.steps.map((step) => {
    const focused = step.focused_command;
    if (!focused) {
      throw new Error(
        `Test process ${definition.id} step ${step.id} has no focused command.`,
      );
    }
    let command = focused.template;
    for (const name of focused.allowed_variables) {
      const value = variables[name];
      if (!value) {
        throw new Error(
          `Focused command variable ${name} is required by ${definition.id}/${step.id}.`,
        );
      }
      command = command.replaceAll(`{{${name}}}`, value);
    }
    if (command.match(PLACEHOLDER)) {
      throw new Error(
        `Focused command for ${definition.id}/${step.id} contains an unresolved variable.`,
      );
    }
    return { step_id: step.id, command };
  });
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
    const vocabulary = record(readJson(vocabularyPath), vocabularyPath);
    if (vocabulary.version === 2) {
      if (!Array.isArray(vocabulary.functional_contexts)) {
        throw new Error(
          `${vocabularyPath}.functional_contexts must be an array.`,
        );
      }
      const capabilities = vocabulary.functional_contexts.map((entry, index) =>
        string(
          record(entry, `${vocabularyPath}.functional_contexts[${index}]`).id,
          `${vocabularyPath}.functional_contexts[${index}].id`,
        ),
      );
      const boundaries = record(
        vocabulary.technical_boundaries,
        `${vocabularyPath}.technical_boundaries`,
      );
      for (const definition of definitions.filter(
        ({ version }) => version === 2,
      )) {
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

export function matchingTestProcessesInDirectories(
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
      const candidate = {
        path,
        definition: readTestProcess(path),
      };
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
