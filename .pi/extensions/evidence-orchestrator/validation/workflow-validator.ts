import { existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  activityTracePath,
  validateActivityTrace,
} from '../capabilities/activity-observability/trace';
import { validateExecutionEvidence } from '../capabilities/execution-evidence/manifest';
import { readHtmlChangeExplanationRecord } from '../loops/pair/change-explanation';
import { validateShowcaseEvidence } from '../loops/showcase/showcase-session';
import { validateStoryCards } from '../loops/kickoff/story-card';
import { validateIterationIntakeSnapshot } from '../capabilities/inbox/iteration-intake';
import { validateInboxRepository } from '../capabilities/inbox/repository';
import { validateInboxStoryCandidates } from '../capabilities/inbox/story-candidate';
import { iterationRoot } from '../iteration/artifact-layout';
import {
  validateCanonicalKnowledge,
  validateKnowledgePromotion,
} from '../capabilities/working-knowledge/promotion-validation';
import { validateWorkingKnowledgeCatalog } from '../capabilities/working-knowledge/catalog';
import { readPersistedState } from '../iteration/state-repository';
import { validateEvidenceCommandReferences } from './command-references';
import { validateSourceBoundaries } from './source-boundaries';
import {
  catalogTestProcessDirectory,
  validateTestProcessDirectory,
} from '../capabilities/test-process/catalog';

/** Deterministic CI validation for the native workflow and shared knowledge. */
export function validateWorkflow(cwd: string): void {
  validateEvidenceCommandReferences(cwd);
  validateSourceBoundaries(join(cwd, '.pi/extensions/evidence-orchestrator'));
  validateInboxRepository(cwd);
  validateInboxStoryCandidates(cwd);
  const state = readPersistedState(cwd);
  if (state) {
    const root = iterationRoot(cwd, state);
    if (!existsSync(root)) {
      throw new Error(
        `Active iteration artifact root is missing: ${relative(cwd, root)}.`,
      );
    }
    const trace = activityTracePath(cwd, state.iteration_id);
    if (existsSync(trace)) validateActivityTrace(trace, state.iteration_id);
    if (!state.intake_snapshot) {
      throw new Error(
        'Active iteration has no frozen requirement input. Select one with /evidence-new.',
      );
    }
  }
  const catalog = catalogTestProcessDirectory(cwd);
  if (!existsSync(catalog)) {
    throw new Error(
      `Project test-process catalog is missing: ${relative(cwd, catalog)}.`,
    );
  }
  validateTestProcessDirectory(catalog);
  validateCanonicalKnowledge(cwd);
  if (!state) return;
  validateIterationIntakeSnapshot(cwd, state);
  if (
    state.kickoff_decisions?.some(
      ({ action, story_id }) => action === 'confirmed' && Boolean(story_id),
    )
  ) {
    validateStoryCards(cwd, state);
  }
  if (state.halted) return;
  if (state.pair_session?.checkpoint === 'quality_gates_passed') {
    validateExecutionEvidence(cwd);
    readHtmlChangeExplanationRecord(cwd, state);
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
  const state = readPersistedState(cwd);
  console.log(
    state
      ? `Evidence Orchestrator validation passed: ${state.iteration_id} loop=${state.loop}.`
      : 'Evidence Orchestrator validation passed: no active iteration.',
  );
}

if (process.argv[1]?.endsWith('/workflow-validator.ts')) main();
