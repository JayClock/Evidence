import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { findFiles } from '../evidence/artifact-index';
import type { TestDouble, TestProcessRuntime } from '../workflow/types';

export interface TestProcessStep {
  id: string;
  quadrant: 'Q1' | 'Q2';
  functional_context: string;
  test_double: TestDouble;
  task: string;
}

export interface TestProcessDefinition {
  version: 1;
  id: string;
  applies_to: {
    runtime: TestProcessRuntime;
    functional_contexts: string[];
  };
  steps: TestProcessStep[];
  quality_gates: string[];
}

const RUNTIMES = new Set<TestProcessRuntime>(['rust', 'typescript', 'tauri']);
const TEST_DOUBLES = new Set<TestDouble>([
  'real',
  'fake',
  'stub',
  'spy',
  'mock',
]);

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
  return value;
}

function strings(value: unknown, name: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${name} must be a non-empty array.`);
  }
  return value.map((entry, index) => string(entry, `${name}[${index}]`));
}

function readJson(path: string): unknown {
  if (!existsSync(path))
    throw new Error(`Test process file not found: ${path}.`);
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new Error(`Test process file is not valid JSON: ${path}.`);
  }
}

/** Parse and validate one reusable, machine-readable test process. */
export function readTestProcess(path: string): TestProcessDefinition {
  const source = record(readJson(path), path);
  if (source.version !== 1) throw new Error(`${path}.version must be 1.`);
  const id = string(source.id, `${path}.id`);
  const appliesTo = record(source.applies_to, `${path}.applies_to`);
  const runtime = string(
    appliesTo.runtime,
    `${path}.applies_to.runtime`,
  ) as TestProcessRuntime;
  if (!RUNTIMES.has(runtime)) {
    throw new Error(`${path}.applies_to.runtime is unsupported: ${runtime}.`);
  }
  const functionalContexts = strings(
    appliesTo.functional_contexts,
    `${path}.applies_to.functional_contexts`,
  );
  if (new Set(functionalContexts).size !== functionalContexts.length) {
    throw new Error(`${path}.applies_to.functional_contexts must be unique.`);
  }
  if (!Array.isArray(source.steps) || source.steps.length === 0) {
    throw new Error(`${path}.steps must be a non-empty array.`);
  }
  const steps = source.steps.map((value, index) => {
    const step = record(value, `${path}.steps[${index}]`);
    const quadrant = string(step.quadrant, `${path}.steps[${index}].quadrant`);
    if (quadrant !== 'Q1' && quadrant !== 'Q2') {
      throw new Error(`${path}.steps[${index}].quadrant must be Q1 or Q2.`);
    }
    const functionalContext = string(
      step.functional_context,
      `${path}.steps[${index}].functional_context`,
    );
    if (!functionalContexts.includes(functionalContext)) {
      throw new Error(
        `${path}.steps[${index}].functional_context must be declared by applies_to.`,
      );
    }
    const testDouble = string(
      step.test_double,
      `${path}.steps[${index}].test_double`,
    ) as TestDouble;
    if (!TEST_DOUBLES.has(testDouble)) {
      throw new Error(
        `${path}.steps[${index}].test_double is unsupported: ${testDouble}.`,
      );
    }
    return {
      id: string(step.id, `${path}.steps[${index}].id`),
      quadrant,
      functional_context: functionalContext,
      test_double: testDouble,
      task: string(step.task, `${path}.steps[${index}].task`),
    } as TestProcessStep;
  });
  if (new Set(steps.map((step) => step.id)).size !== steps.length) {
    throw new Error(`${path}.steps ids must be unique.`);
  }
  if (!steps.some((step) => step.quadrant === 'Q1')) {
    throw new Error(`${path}.steps must include at least one Q1 step.`);
  }
  if (!steps.some((step) => step.quadrant === 'Q2')) {
    throw new Error(`${path}.steps must include at least one Q2 step.`);
  }

  return {
    version: 1,
    id,
    applies_to: { runtime, functional_contexts: functionalContexts },
    steps,
    quality_gates: strings(source.quality_gates, `${path}.quality_gates`),
  };
}

/** Validate every machine-readable process in an architecture iteration. */
export function validateTestProcessDirectory(
  processDirectory: string,
): TestProcessDefinition[] {
  const paths = findFiles(processDirectory, (path) => path.endsWith('.json'));
  if (paths.length === 0) {
    throw new Error(
      `Test-process directory has no JSON process definitions: ${processDirectory}.`,
    );
  }
  const definitions = paths.map((path) => readTestProcess(path));
  if (
    new Set(definitions.map((definition) => definition.id)).size !==
    definitions.length
  ) {
    throw new Error(`Test-process ids must be unique: ${processDirectory}.`);
  }
  return definitions;
}

export interface TestProcessCandidate {
  path: string;
  definition: TestProcessDefinition;
}

/** Project-owned, versioned working knowledge shared by all iterations. */
export function catalogTestProcessDirectory(cwd: string): string {
  return join(cwd, 'engineering/evidence-orchestrator/test-processes');
}

/** Find processes that can cover every functional context for a selected scenario. */
export function matchingTestProcesses(
  cwd: string,
  processDirectory: string,
  runtime: TestProcessRuntime,
  functionalContexts: string[],
): TestProcessCandidate[] {
  if (functionalContexts.length === 0) {
    throw new Error('At least one functional context is required.');
  }
  if (new Set(functionalContexts).size !== functionalContexts.length) {
    throw new Error('Functional contexts must be unique.');
  }
  return matchingTestProcessesInDirectories(
    cwd,
    [processDirectory],
    runtime,
    functionalContexts,
  );
}

/** Search an iteration snapshot and the shared catalog without weakening uniqueness. */
export function matchingTestProcessesInDirectories(
  cwd: string,
  processDirectories: string[],
  runtime: TestProcessRuntime,
  functionalContexts: string[],
): TestProcessCandidate[] {
  if (functionalContexts.length === 0) {
    throw new Error('At least one functional context is required.');
  }
  if (new Set(functionalContexts).size !== functionalContexts.length) {
    throw new Error('Functional contexts must be unique.');
  }
  return processDirectories
    .flatMap((processDirectory) =>
      findFiles(processDirectory, (path) => path.endsWith('.json')).map(
        (path) => ({
          path: relative(cwd, path),
          definition: readTestProcess(path),
        }),
      ),
    )
    .filter(
      ({ definition }) =>
        definition.applies_to.runtime === runtime &&
        functionalContexts.every((context) =>
          definition.applies_to.functional_contexts.includes(context),
        ),
    );
}
