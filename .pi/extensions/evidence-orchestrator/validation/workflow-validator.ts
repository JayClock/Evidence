import { existsSync } from 'node:fs';
import { relative } from 'node:path';
import { missingPaths } from '../evidence/artifact-index';
import { validateCanonicalKnowledge } from '../evidence/knowledge';
import { validateDomainModelEvidence } from '../evidence/model-and-code';
import { validateIssueSourceSnapshot } from '../requirements/github-issue';
import {
  catalogTestProcessDirectory,
  validateTestProcessDirectory,
} from '../testing/process-catalog';
import { gateDecision } from '../workflow/gates';
import {
  artifactRelativePath,
  iterationRoot,
} from '../workflow/iteration-paths';
import { PHASE_META, PHASE_ORDER } from '../workflow/phase-catalog';
import { readState } from '../workflow/state-store';

/** Deterministic validation for canonical knowledge and the active v2 iteration. */
export function validateWorkflow(cwd: string): void {
  const state = readState(cwd);
  const catalog = catalogTestProcessDirectory(cwd);
  if (!existsSync(catalog)) {
    throw new Error(
      `Project test-process catalog is missing: ${relative(cwd, catalog)}.`,
    );
  }
  validateTestProcessDirectory(catalog);
  validateCanonicalKnowledge(cwd);

  if (state.phase === 'idle') return;
  const root = iterationRoot(cwd, state);
  if (!existsSync(root)) {
    throw new Error(
      `Iteration artifact root is missing: ${relative(cwd, root)}.`,
    );
  }
  if (!state.requirement_source) {
    throw new Error(
      'The iteration has no frozen GitHub Issue requirement source.',
    );
  }
  validateIssueSourceSnapshot(cwd, state);
  for (const artifact of state.artifacts) {
    if (!existsSync(`${cwd}/${artifact}`)) {
      throw new Error(`State references a missing artifact: ${artifact}.`);
    }
  }
  if (state.pending_gate) gateDecision(cwd, state, state.pending_gate);
  if (state.halted || state.phase === 'complete') return;

  const missing = missingPaths(
    cwd,
    PHASE_META[state.phase].inputs.map((path) =>
      artifactRelativePath(state, path),
    ),
  );
  if (missing.length > 0) {
    throw new Error(
      `Iteration ${state.iteration_id} cannot run ${state.phase}: missing inputs: ${missing.join(', ')}.`,
    );
  }
  if (PHASE_ORDER.indexOf(state.phase) > PHASE_ORDER.indexOf('model')) {
    validateDomainModelEvidence(cwd, relative(cwd, root));
  }
}

export function main(argv = process.argv): void {
  const cwd = argv[2] ?? process.cwd();
  validateWorkflow(cwd);
  const state = readState(cwd);
  console.log(
    `Evidence Orchestrator validation passed: iteration=${state.iteration_id ?? 'none'} phase=${state.phase} index=${PHASE_ORDER.indexOf(state.phase)}.`,
  );
}

if (process.argv[1]?.endsWith('/workflow-validator.ts')) main();
