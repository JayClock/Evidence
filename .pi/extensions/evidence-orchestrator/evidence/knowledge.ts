import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  catalogTestProcessDirectory,
  validateTestProcessDirectory,
} from '../testing/process-catalog';
import { validateExecutionEvidence } from '../testing/execution-manifest';
import type { WorkflowState } from '../workflow/types';

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
    vocabulary.runtimes ?? vocabulary.legacy_v1_runtime_contexts,
    'runtime-contexts.json.runtimes|legacy_v1_runtime_contexts',
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

export function validateKnowledgePromotion(
  cwd: string,
  path: string,
  state?: WorkflowState,
): void {
  const document = record(JSON.parse(readFileSync(path, 'utf8')), path);
  if (!Array.isArray(document.promotions)) {
    throw new Error(`${path} must declare a promotions array.`);
  }
  if (document.version === 1) {
    if (document.promotions.length === 0) {
      throw new Error(`${path} v1 promotions must not be empty.`);
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
        const target = promotion.target ?? promotion.canonical_target;
        if (typeof target !== 'string' || !existsSync(join(cwd, target))) {
          throw new Error(
            `${path}.promotions[${index}] must reference an existing canonical target.`,
          );
        }
      }
    }
    return;
  }
  if (document.version !== 2) {
    throw new Error(`${path} has unsupported knowledge-promotion version.`);
  }
  if (
    document.promotions.length === 0 &&
    (typeof document.no_promotion_reason !== 'string' ||
      !document.no_promotion_reason.trim())
  ) {
    throw new Error(
      `${path} requires no_promotion_reason when promotions is empty.`,
    );
  }
  if (document.promotions.length > 0 && document.no_promotion_reason) {
    throw new Error(
      `${path} no_promotion_reason requires an empty promotions array.`,
    );
  }
  for (const [index, value] of document.promotions.entries()) {
    const name = `${path}.promotions[${index}]`;
    const promotion = record(value, name);
    if (
      typeof promotion.source !== 'string' ||
      !promotion.source.trim() ||
      !existsSync(join(cwd, promotion.source)) ||
      typeof promotion.kind !== 'string' ||
      ![
        'product',
        'model',
        'architecture',
        'contract',
        'test_process',
        'skill',
        'prompt',
        'other',
      ].includes(promotion.kind) ||
      !['promoted', 'deferred', 'rejected'].includes(
        String(promotion.decision),
      ) ||
      typeof promotion.reason !== 'string' ||
      !promotion.reason.trim() ||
      !Array.isArray(promotion.validation_evidence) ||
      promotion.validation_evidence.length === 0 ||
      promotion.validation_evidence.some(
        (evidence) =>
          typeof evidence !== 'string' ||
          !evidence.trim() ||
          !existsSync(join(cwd, evidence)),
      )
    ) {
      throw new Error(`${name} is invalid or references missing evidence.`);
    }
    const human = record(promotion.human_decision, `${name}.human_decision`);
    if (
      human.decision !== promotion.decision ||
      typeof human.reason !== 'string' ||
      !human.reason.trim() ||
      human.confirmed_by !== 'human' ||
      typeof human.confirmed_at !== 'string' ||
      !human.confirmed_at
    ) {
      throw new Error(`${name} requires a matching human decision.`);
    }
    if (promotion.decision === 'promoted') {
      if (
        typeof promotion.canonical_target !== 'string' ||
        !existsSync(join(cwd, promotion.canonical_target))
      ) {
        throw new Error(`${name} must reference an existing canonical target.`);
      }
    }
  }
  const consistency = record(document.consistency, `${path}.consistency`);
  if (
    typeof consistency.story_id !== 'string' ||
    typeof consistency.scenario_id !== 'string' ||
    typeof consistency.git_baseline !== 'string' ||
    typeof consistency.execution_manifest !== 'string' ||
    !existsSync(join(cwd, consistency.execution_manifest)) ||
    !Array.isArray(consistency.model_paths) ||
    !Array.isArray(consistency.code_paths) ||
    consistency.consistent !== true
  ) {
    throw new Error(`${path}.consistency is invalid.`);
  }
  if (state?.active_work_item) {
    const manifest = validateExecutionEvidence(cwd, state.active_work_item);
    if (
      consistency.story_id !== state.active_work_item.story_id ||
      consistency.scenario_id !== state.active_work_item.scenario_id ||
      consistency.git_baseline !== state.active_work_item.git_baseline ||
      JSON.stringify([...consistency.model_paths].sort()) !==
        JSON.stringify([...manifest.changed_paths.model].sort()) ||
      JSON.stringify([...consistency.code_paths].sort()) !==
        JSON.stringify([...manifest.changed_paths.code].sort())
    ) {
      throw new Error(
        `${path} model/code consistency does not match execution evidence.`,
      );
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
