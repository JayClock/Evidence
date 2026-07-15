import { existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { validateExecutionEvidence } from '../testing/execution-manifest';
import { validateShowcaseEvidence } from '../testing/showcase';
import { validateIssueSourceSnapshot } from '../requirements/github-issue';
import { iterationRoot } from '../workflow/iteration-paths';
import {
  validateCanonicalKnowledge,
  validateKnowledgePromotion,
} from '../evidence/knowledge';
import { validateWorkingKnowledgeCatalog } from '../evidence/working-knowledge';
import { readStateSnapshot } from '../workflow/state-store';
import {
  catalogTestProcessDirectory,
  validateTestProcessDirectory,
} from '../testing/process-catalog';

/** Deterministic CI validation for native v5 or immutable terminal legacy state. */
export function validateWorkflow(cwd: string): void {
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
