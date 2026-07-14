import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  catalogTestProcessDirectory,
  validateTestProcessDirectory,
} from '../testing/process-catalog';

/** Stable project knowledge consumed by every feature iteration. */
export const CANONICAL_KNOWLEDGE_PATHS = [
  'docs/knowledge-governance.md',
  'docs/product/personas.md',
  'docs/product/business-context.md',
  'docs/product/user-journeys.md',
  'docs/product/story-map.md',
  'docs/architecture/context-map.md',
  'docs/architecture/architecture-style.md',
  'docs/architecture/tech-stack.md',
  'docs/architecture/module-structure.md',
  'docs/architecture/test-strategy.md',
  'docs/architecture/test-doubles.md',
  'engineering/evidence-orchestrator/definition-of-done.md',
  'engineering/evidence-orchestrator/runtime-contexts.json',
] as const;

export function validateCanonicalKnowledge(cwd: string): void {
  const missing = CANONICAL_KNOWLEDGE_PATHS.filter((path) => {
    const absolute = join(cwd, path);
    return (
      !existsSync(absolute) ||
      !statSync(absolute).isFile() ||
      statSync(absolute).size === 0
    );
  });
  if (missing.length > 0) {
    throw new Error(
      `Canonical working knowledge is missing or empty: ${missing.join(', ')}.`,
    );
  }
}

function record(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${name} must be a JSON object.`);
  }
  return value as Record<string, unknown>;
}

function strings(value: unknown, name: string): string[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    !value.every((entry) => typeof entry === 'string' && entry.length > 0)
  ) {
    throw new Error(`${name} must be a non-empty string array.`);
  }
  return value;
}

function serverTrack(
  runtime: string,
  functionalContexts: string[],
): 'rust' | 'nest' | undefined {
  if (
    runtime === 'rust' &&
    functionalContexts.some((context) => context.startsWith('rust-'))
  ) {
    return 'rust';
  }
  if (
    runtime === 'typescript' &&
    functionalContexts.some((context) => context.startsWith('nest-'))
  ) {
    return 'nest';
  }
  return undefined;
}

function scenarioContextDocument(path: string): Record<string, unknown> {
  return record(JSON.parse(readFileSync(path, 'utf8')), path);
}

/** Validate the iteration-specific bridge from scenarios to canonical runtime knowledge. */
export function validateScenarioContextMap(cwd: string, path: string): void {
  const document = scenarioContextDocument(path);
  if (document.version !== 1 || !Array.isArray(document.scenarios)) {
    throw new Error(`${path} must declare version=1 and scenarios.`);
  }
  const vocabulary = record(
    JSON.parse(
      readFileSync(
        join(cwd, 'engineering/evidence-orchestrator/runtime-contexts.json'),
        'utf8',
      ),
    ),
    'runtime-contexts.json',
  );
  const runtimeContexts = record(
    vocabulary.runtimes,
    'runtime-contexts.json.runtimes',
  );
  if (document.scenarios.length === 0) {
    throw new Error(`${path}.scenarios must not be empty.`);
  }
  const processes = validateTestProcessDirectory(
    catalogTestProcessDirectory(cwd),
  );
  const processById = new Map(
    processes.map((process) => [process.id, process]),
  );
  for (const [index, value] of document.scenarios.entries()) {
    const scenario = record(value, `${path}.scenarios[${index}]`);
    if (
      typeof scenario.story_id !== 'string' ||
      !/^US-\d{3,}$/i.test(scenario.story_id) ||
      typeof scenario.scenario_id !== 'string' ||
      !/^SC-\d{3,}$/i.test(scenario.scenario_id) ||
      !Array.isArray(scenario.runtimes) ||
      scenario.runtimes.length === 0
    ) {
      throw new Error(
        `${path}.scenarios[${index}] has invalid work item or runtimes.`,
      );
    }
    let selectedServerTrack: 'rust' | 'nest' | undefined;
    for (const [runtimeIndex, runtimeValue] of scenario.runtimes.entries()) {
      const runtime = record(
        runtimeValue,
        `${path}.scenarios[${index}].runtimes[${runtimeIndex}]`,
      );
      if (
        typeof runtime.runtime !== 'string' ||
        !Array.isArray(runtimeContexts[runtime.runtime])
      ) {
        throw new Error(`${path} references an unsupported runtime.`);
      }
      const contexts = strings(
        runtime.functional_contexts,
        `${path}.scenarios[${index}].runtimes[${runtimeIndex}].functional_contexts`,
      );
      const currentServerTrack = serverTrack(runtime.runtime, contexts);
      if (
        currentServerTrack &&
        selectedServerTrack &&
        currentServerTrack !== selectedServerTrack
      ) {
        throw new Error(
          `${path}.scenarios[${index}] must not mix the Rust and Nest server tracks.`,
        );
      }
      selectedServerTrack ??= currentServerTrack;
      const allowed = runtimeContexts[runtime.runtime] as string[];
      if (!contexts.every((context) => allowed.includes(context))) {
        throw new Error(`${path} references an unknown functional context.`);
      }
      strings(
        runtime.q1_tests,
        `${path}.scenarios[${index}].runtimes[${runtimeIndex}].q1_tests`,
      );
      strings(
        runtime.q2_tests,
        `${path}.scenarios[${index}].runtimes[${runtimeIndex}].q2_tests`,
      );
      strings(
        runtime.test_doubles,
        `${path}.scenarios[${index}].runtimes[${runtimeIndex}].test_doubles`,
      );
      const candidates = strings(
        runtime.candidate_process_ids,
        `${path}.scenarios[${index}].runtimes[${runtimeIndex}].candidate_process_ids`,
      );
      if (
        !candidates.every((id) => {
          const process = processById.get(id);
          return (
            process?.applies_to.runtime === runtime.runtime &&
            contexts.every((context) =>
              process.applies_to.functional_contexts.includes(context),
            )
          );
        })
      ) {
        throw new Error(
          `${path} references a test process that cannot cover its runtime contexts.`,
        );
      }
    }
  }
}

export function validateKnowledgePromotion(cwd: string, path: string): void {
  const document = record(JSON.parse(readFileSync(path, 'utf8')), path);
  if (
    document.version !== 1 ||
    !Array.isArray(document.promotions) ||
    document.promotions.length === 0
  ) {
    throw new Error(`${path} must declare version=1 and non-empty promotions.`);
  }
  for (const [index, value] of document.promotions.entries()) {
    const promotion = record(value, `${path}.promotions[${index}]`);
    if (
      typeof promotion.source !== 'string' ||
      !['promoted', 'deferred', 'rejected'].includes(
        String(promotion.decision),
      ) ||
      typeof promotion.reason !== 'string' ||
      promotion.reason.length === 0
    ) {
      throw new Error(`${path}.promotions[${index}] is invalid.`);
    }
    if (promotion.decision === 'promoted') {
      if (
        typeof promotion.target !== 'string' ||
        !existsSync(join(cwd, promotion.target))
      ) {
        throw new Error(
          `${path}.promotions[${index}] must reference an existing canonical target.`,
        );
      }
    }
  }
}

/** Ensure Coding cannot silently deviate from the architecture scenario mapping. */
export function assertScenarioProcessSelection(
  path: string,
  storyId: string,
  scenarioId: string,
  runtimeName: string,
  functionalContexts: string[],
  processId: string,
): void {
  const document = scenarioContextDocument(path);
  if (!Array.isArray(document.scenarios)) {
    throw new Error(`${path} has no scenarios.`);
  }
  const scenario = document.scenarios
    .map((value, index) => record(value, `${path}.scenarios[${index}]`))
    .find(
      (value) => value.story_id === storyId && value.scenario_id === scenarioId,
    );
  if (!scenario || !Array.isArray(scenario.runtimes)) {
    throw new Error(`${path} has no mapping for ${storyId} / ${scenarioId}.`);
  }
  const runtime = scenario.runtimes
    .map((value, index) =>
      record(value, `${path}.${storyId}.${scenarioId}.runtimes[${index}]`),
    )
    .find((value) => value.runtime === runtimeName);
  if (!runtime) {
    throw new Error(
      `${path} has no ${runtimeName} runtime for ${storyId} / ${scenarioId}.`,
    );
  }
  const expectedContexts = strings(
    runtime.functional_contexts,
    `${path}.functional_contexts`,
  );
  if (
    JSON.stringify([...expectedContexts].sort()) !==
    JSON.stringify([...functionalContexts].sort())
  ) {
    throw new Error(`Selected functional contexts do not match ${path}.`);
  }
  if (
    !strings(
      runtime.candidate_process_ids,
      `${path}.candidate_process_ids`,
    ).includes(processId)
  ) {
    throw new Error(`Test process ${processId} is not a candidate in ${path}.`);
  }
}
