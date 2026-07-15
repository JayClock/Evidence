import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { validateExecutionEvidence } from '../testing/execution-manifest';
import type { WorkflowState } from '../iteration/state';

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

export function validateKnowledgePromotion(
  cwd: string,
  path: string,
  state?: WorkflowState,
): void {
  const document = record(JSON.parse(readFileSync(path, 'utf8')), path);
  if (!Array.isArray(document.promotions)) {
    throw new Error(`${path} must declare a promotions array.`);
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
