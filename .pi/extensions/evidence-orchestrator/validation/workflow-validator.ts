import { existsSync } from 'node:fs';
import { relative } from 'node:path';
import { missingPaths } from '../evidence/artifact-index';
import { validateDomainModelEvidence } from '../evidence/model-validation';
import { validateExecutionEvidence } from '../testing/execution-manifest';
import { validateShowcaseEvidence } from '../testing/showcase';
import { gateDecision } from '../workflow/gates';
import { validateIssueSourceSnapshot } from '../requirements/github-issue';
import {
  artifactRelativePath,
  iterationRoot,
} from '../workflow/iteration-paths';
import { validateCanonicalKnowledge } from '../evidence/knowledge';
import { PHASE_META, PHASE_ORDER } from '../workflow/phase-catalog';
import { readState } from '../workflow/state-store';
import {
  catalogTestProcessDirectory,
  validateTestProcessDirectory,
} from '../testing/process-catalog';

/** Deterministic CI validation for the active iteration's state and inputs. */
export function validateWorkflow(cwd: string): void {
  const state = readState(cwd);
  const root = iterationRoot(cwd, state);
  if (!existsSync(root)) {
    throw new Error(
      `Active iteration artifact root is missing: ${relative(cwd, root)}. Run /evidence-new or create its seed input.`,
    );
  }
  if (state.phase !== 'complete' && !state.requirement_source) {
    throw new Error(
      'Active iteration has no GitHub Issue requirement source. Select one with /evidence-new.',
    );
  }
  if (state.requirement_source) validateIssueSourceSnapshot(cwd, state);
  const catalog = catalogTestProcessDirectory(cwd);
  if (!existsSync(catalog)) {
    throw new Error(
      `Project test-process catalog is missing: ${relative(cwd, catalog)}.`,
    );
  }
  validateTestProcessDirectory(catalog);
  validateCanonicalKnowledge(cwd);
  for (const artifact of state.artifacts) {
    if (!existsSync(`${cwd}/${artifact}`)) {
      throw new Error(
        `State references a missing iteration artifact: ${artifact}.`,
      );
    }
  }
  if (state.pending_gate) {
    // This also verifies the gate belongs to the active iteration and has valid metadata.
    gateDecision(cwd, state, state.pending_gate);
  }
  if (state.halted) return;
  if (
    state.workflow_version === 5 &&
    state.pair_session?.checkpoint === 'quality_gates_passed'
  ) {
    validateExecutionEvidence(cwd);
    validateShowcaseEvidence(cwd);
  }
  // v5 loop-specific tools validate their own focused inputs and generated
  // evidence; legacy PHASE_META/Scrum requirements apply only to v4.
  if (state.workflow_version === 5) return;
  if (state.phase === 'complete') return;

  const inputs = PHASE_META[state.phase].inputs.map((path) =>
    artifactRelativePath(state, path),
  );
  const missing = missingPaths(cwd, inputs);
  if (missing.length > 0) {
    throw new Error(
      `Active iteration ${state.iteration_id} cannot run ${state.phase}: missing inputs: ${missing.join(', ')}.`,
    );
  }
  if (PHASE_ORDER.indexOf(state.phase) > PHASE_ORDER.indexOf('domain_model')) {
    validateDomainModelEvidence(cwd, relative(cwd, root));
  }
}

export function main(argv = process.argv): void {
  const cwd = argv[2] ?? process.cwd();
  validateWorkflow(cwd);
  const state = readState(cwd);
  const phaseIndex = PHASE_ORDER.indexOf(state.phase);
  console.log(
    `Evidence Orchestrator validation passed: ${state.iteration_id} phase=${state.phase} index=${phaseIndex}.`,
  );
}

if (process.argv[1]?.endsWith('/workflow-validator.ts')) main();
