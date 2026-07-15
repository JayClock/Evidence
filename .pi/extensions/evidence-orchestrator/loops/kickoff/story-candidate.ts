import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  artifactPath,
  artifactRelativePath,
} from '../../iteration/artifact-layout';
import { writeState } from '../../iteration/state-repository';
import type {
  CognitiveMode,
  KickoffCandidate,
  WorkflowState,
} from '../../iteration/state';
import { kickoffText, requireKickoffState } from './kickoff-state';

const COGNITIVE_MODES = new Set<CognitiveMode>([
  'clear',
  'complicated',
  'complex',
]);

export interface KickoffCandidateInput {
  title: string;
  problem: string;
  role: string;
  goal: string;
  value: string;
  cognitiveMode: CognitiveMode;
  sourceRefs: string[];
}

function nextCandidatePath(cwd: string, state: WorkflowState): string {
  const directory = artifactPath(
    cwd,
    state,
    'artifacts/01-requirements/kickoff-candidates',
  );
  const count = existsSync(directory)
    ? readdirSync(directory).filter((name) => /^CAND-\d{3}\.json$/.test(name))
        .length
    : 0;
  return artifactRelativePath(
    state,
    `artifacts/01-requirements/kickoff-candidates/CAND-${String(count + 1).padStart(3, '0')}.json`,
  );
}

/** Persist one AI-authored candidate. It has no Story id and no authority. */
export function proposeKickoffCandidate(
  cwd: string,
  input: KickoffCandidateInput,
  now = new Date().toISOString(),
): WorkflowState {
  const state = requireKickoffState(cwd);
  if (state.kickoff_candidate) {
    throw new Error(
      `Kickoff candidate ${state.kickoff_candidate.artifact_path} is awaiting a human decision.`,
    );
  }
  if (!COGNITIVE_MODES.has(input.cognitiveMode)) {
    throw new Error(`Unsupported cognitive mode: ${input.cognitiveMode}.`);
  }
  const sourceRefs = input.sourceRefs.map((value) =>
    kickoffText(value, 'source reference', true),
  );
  if (
    sourceRefs.length === 0 ||
    new Set(sourceRefs).size !== sourceRefs.length
  ) {
    throw new Error('Kickoff sourceRefs must be a non-empty unique list.');
  }
  const candidate: KickoffCandidate = {
    version: 1,
    title: kickoffText(input.title, 'title', true),
    problem: kickoffText(input.problem, 'problem'),
    role: kickoffText(input.role, 'role', true),
    goal: kickoffText(input.goal, 'goal', true),
    value: kickoffText(input.value, 'value', true),
    cognitive_mode: input.cognitiveMode,
    source_refs: sourceRefs,
    proposed_at: now,
    artifact_path: nextCandidatePath(cwd, state),
  };
  const absolute = `${cwd}/${candidate.artifact_path}`;
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, `${JSON.stringify(candidate, null, 2)}\n`);
  return writeState(cwd, { ...state, kickoff_candidate: candidate });
}
