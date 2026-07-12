import { existsSync } from 'node:fs';
import { relative } from 'node:path';
import { missingPaths } from './artifacts';
import { validateDomainModelEvidence } from './evidence';
import { gateDecision } from './gates';
import { validateIssueSourceSnapshot } from './issue-source';
import { artifactRelativePath, iterationRoot } from './iteration';
import { PHASE_META, PHASE_ORDER } from './phases';
import { readState } from './state';

/** Deterministic CI validation for the active iteration's state and inputs. */
export function validateWorkflow(cwd: string): void {
  const state = readState(cwd);
  const root = iterationRoot(cwd, state);
  if (!existsSync(root)) {
    throw new Error(
      `Active iteration artifact root is missing: ${relative(cwd, root)}. Run /evidence-reset or create its seed input.`,
    );
  }
  if (state.requirement_source) validateIssueSourceSnapshot(cwd, state);
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
    `Evidence Workflow validation passed: ${state.iteration_id} phase=${state.phase} index=${phaseIndex}.`,
  );
}

if (process.argv[1]?.endsWith('/validate.ts')) main();
