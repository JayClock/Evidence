import { existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { validateExecutionEvidence } from '../capabilities/execution-evidence/manifest';
import { validateShowcaseEvidence } from '../loops/showcase/showcase-session';
import { validateIssueSourceSnapshot } from '../capabilities/issue-source/github-issue-source';
import { iterationRoot } from '../iteration/artifact-layout';
import {
  validateCanonicalKnowledge,
  validateKnowledgePromotion,
} from '../capabilities/working-knowledge/promotion-validation';
import { validateWorkingKnowledgeCatalog } from '../capabilities/working-knowledge/catalog';
import { readStateSnapshot } from '../compatibility/state-snapshot';
import { validateSourceBoundaries } from './source-boundaries';
import {
  catalogTestProcessDirectory,
  validateTestProcessDirectory,
} from '../capabilities/test-process/catalog';

/** Deterministic CI validation for native v5 or immutable terminal legacy state. */
export function validateWorkflow(cwd: string): void {
  validateSourceBoundaries(join(cwd, '.pi/extensions/evidence-orchestrator'));
  const state = readStateSnapshot(cwd);
  const root = iterationRoot(cwd, state);
  if (!existsSync(root)) {
    throw new Error(
      `Active iteration artifact root is missing: ${relative(cwd, root)}.`,
    );
  }
  if (state.workflow_version === 5 && !state.requirement_source) {
    throw new Error(
      'Active v5 iteration has no GitHub Issue requirement source. Select one with /evidence-new.',
    );
  }
  const catalog = catalogTestProcessDirectory(cwd);
  if (!existsSync(catalog)) {
    throw new Error(
      `Project test-process catalog is missing: ${relative(cwd, catalog)}.`,
    );
  }
  validateTestProcessDirectory(catalog);
  validateCanonicalKnowledge(cwd);
  if (state.workflow_version === 4) return;
  validateIssueSourceSnapshot(cwd, state);
  if (state.halted) return;
  if (state.pair_session?.checkpoint === 'quality_gates_passed') {
    validateExecutionEvidence(cwd);
    validateShowcaseEvidence(cwd);
  }
  if (state.knowledge_promotion_path) {
    validateKnowledgePromotion(
      cwd,
      join(cwd, state.knowledge_promotion_path),
      state,
    );
  }
}

export function main(argv = process.argv): void {
  const cwd = argv[2] ?? process.cwd();
  validateWorkingKnowledgeCatalog(cwd);
  validateWorkflow(cwd);
  const state = readStateSnapshot(cwd);
  console.log(
    state.workflow_version === 5
      ? `Evidence Orchestrator validation passed: ${state.iteration_id} loop=${state.loop}.`
      : `Evidence Orchestrator validation passed: ${state.iteration_id} legacy=${state.terminal} read-only.`,
  );
}

if (process.argv[1]?.endsWith('/workflow-validator.ts')) main();
