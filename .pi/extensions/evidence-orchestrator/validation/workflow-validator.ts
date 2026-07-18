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
import { readBoardEvents } from '../iteration/board-events';
import { boardPath, readBoard } from '../iteration/board-repository';
import { validateBoardWorktrees } from '../capabilities/work-item-worktree/provisioner';
import { readFlowPolicy } from '../capabilities/flow-control/policy';
import {
  validateCanonicalKnowledge,
  validateKnowledgePromotion,
} from '../capabilities/working-knowledge/promotion-validation';
import { validateWorkingKnowledgeCatalog } from '../capabilities/working-knowledge/catalog';
import { readPersistedState } from '../iteration/state-repository';
import type { WorkflowState } from '../iteration/state';
import { validateEvidenceCommandReferences } from './command-references';
import { validateSourceBoundaries } from './source-boundaries';
import {
  catalogTestProcessDirectory,
  validateTestProcessDirectory,
} from '../capabilities/test-process/catalog';

interface StoryValidationTarget {
  worktreeRoot: string;
  state: WorkflowState;
}

function validateStoryEnvelope(
  worktreeRoot: string,
  state: WorkflowState,
): void {
  const root = iterationRoot(worktreeRoot, state);
  if (!existsSync(root)) {
    throw new Error(
      `${state.iteration_id} artifact root is missing: ${relative(worktreeRoot, root)}.`,
    );
  }
  const trace = activityTracePath(worktreeRoot, state.iteration_id);
  if (existsSync(trace)) validateActivityTrace(trace, state.iteration_id);
  if (!state.intake_snapshot) {
    throw new Error(
      `${state.iteration_id} has no frozen requirement input. Start it from an Inbox Candidate.`,
    );
  }
}

function validateStoryEvidence({
  worktreeRoot,
  state,
}: StoryValidationTarget): void {
  const catalog = catalogTestProcessDirectory(worktreeRoot);
  if (!existsSync(catalog)) {
    throw new Error(
      `${state.iteration_id} test-process catalog is missing: ${relative(worktreeRoot, catalog)}.`,
    );
  }
  validateTestProcessDirectory(catalog);
  validateCanonicalKnowledge(worktreeRoot);
  validateIterationIntakeSnapshot(worktreeRoot, state);
  if (
    state.kickoff_decisions?.some(
      ({ action, story_id }) => action === 'confirmed' && Boolean(story_id),
    )
  ) {
    validateStoryCards(worktreeRoot, state);
  }
  if (state.halted) return;
  if (state.pair_session?.checkpoint === 'quality_gates_passed') {
    validateExecutionEvidence(worktreeRoot);
    readHtmlChangeExplanationRecord(worktreeRoot, state);
    validateShowcaseEvidence(worktreeRoot);
  }
  if (state.knowledge_promotion_path) {
    validateKnowledgePromotion(
      worktreeRoot,
      join(worktreeRoot, state.knowledge_promotion_path),
      state,
    );
  }
}

function storyValidationTargets(cwd: string): StoryValidationTarget[] {
  if (!existsSync(join(cwd, '.git')) || !existsSync(boardPath(cwd))) return [];
  const board = readBoard(cwd);
  readBoardEvents(cwd);
  validateBoardWorktrees(cwd);
  return board.items.flatMap((item) => {
    if (!['active', 'terminal'].includes(item.lifecycle)) return [];
    const state = readPersistedState(item.worktree_path);
    if (!state) {
      throw new Error(`Story State is missing: ${item.iteration_id}.`);
    }
    if (state.iteration_id !== item.iteration_id) {
      throw new Error(
        `Board/State Iteration mismatch: ${item.iteration_id}/${state.iteration_id}.`,
      );
    }
    validateStoryEnvelope(item.worktree_path, state);
    return [{ worktreeRoot: item.worktree_path, state }];
  });
}

/** Deterministic CI validation for every Board Story and shared knowledge. */
export function validateWorkflow(cwd: string): void {
  validateEvidenceCommandReferences(cwd);
  validateSourceBoundaries(join(cwd, '.pi/extensions/evidence-orchestrator'));
  validateInboxRepository(cwd);
  validateInboxStoryCandidates(cwd);
  readFlowPolicy(cwd);
  const targets = storyValidationTargets(cwd);

  const catalog = catalogTestProcessDirectory(cwd);
  if (!existsSync(catalog)) {
    throw new Error(
      `Project test-process catalog is missing: ${relative(cwd, catalog)}.`,
    );
  }
  validateTestProcessDirectory(catalog);
  validateCanonicalKnowledge(cwd);
  for (const target of targets) validateStoryEvidence(target);
}

export function main(argv = process.argv): void {
  const cwd = argv[2] ?? process.cwd();
  validateWorkingKnowledgeCatalog(cwd);
  validateWorkflow(cwd);
  const active = existsSync(join(cwd, '.git'))
    ? readBoard(cwd).items.filter(({ lifecycle }) => lifecycle === 'active')
        .length
    : 0;
  console.log(
    `Evidence Orchestrator validation passed: ${active} active Board Story item(s).`,
  );
}

if (process.argv[1]?.endsWith('/workflow-validator.ts')) main();
