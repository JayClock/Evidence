import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  artifactPath,
  artifactRelativePath,
} from '../iteration/artifact-layout';
import { transitionLoopState } from '../iteration/transition-graph';
import { readState, writeState } from '../iteration/state-repository';
import type {
  CognitiveMode,
  KickoffCandidate,
  KickoffDecision,
  KickoffDecisionAction,
  WorkflowState,
} from '../iteration/state';
import { validateStoryCards } from './story-cards';

const COGNITIVE_MODES = new Set<CognitiveMode>([
  'clear',
  'complicated',
  'complex',
]);
const KICKOFF_ACTIONS = new Set<KickoffDecisionAction>([
  'confirmed',
  'revise',
  'split',
  'deferred',
  'stopped',
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

function requiredText(value: string, name: string, singleLine = false): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`Kickoff ${name} must not be empty.`);
  if (singleLine && /[\r\n]/.test(normalized)) {
    throw new Error(`Kickoff ${name} must be a single line.`);
  }
  return normalized;
}

function requireKickoffState(cwd: string): WorkflowState {
  const state = readState(cwd);
  if (state.loop !== 'kickoff') {
    throw new Error(
      `Kickoff is only available in the kickoff loop; current loop is ${state.loop}.`,
    );
  }
  if (state.halted) {
    throw new Error(`Iteration is halted: ${state.halted.reason}`);
  }
  return state;
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
    requiredText(value, 'source reference', true),
  );
  if (
    sourceRefs.length === 0 ||
    new Set(sourceRefs).size !== sourceRefs.length
  ) {
    throw new Error('Kickoff sourceRefs must be a non-empty unique list.');
  }
  const candidate: KickoffCandidate = {
    version: 1,
    title: requiredText(input.title, 'title', true),
    problem: requiredText(input.problem, 'problem'),
    role: requiredText(input.role, 'role', true),
    goal: requiredText(input.goal, 'goal', true),
    value: requiredText(input.value, 'value', true),
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

function problemStatement(candidate: KickoffCandidate): string {
  return `# ${candidate.title}

## 问题

${candidate.problem}

## Knowledge Kickoff

- 当前认知行为：${candidate.cognitive_mode}
- 候选由 AI 提出，角色、价值与本轮边界已由人类确认。

## 来源

${candidate.source_refs.map((reference) => `- ${reference}`).join('\n')}
`;
}

function storyCard(candidate: KickoffCandidate, storyId: string): string {
  return `# ${storyId} ${candidate.title}

> **作为**${candidate.role}，
> **我希望**${candidate.goal}，
> **从而**${candidate.value}。

- **问题上下文**：[\`../problem-statement.md\`](../problem-statement.md)
`;
}

function showcaseProblemRevision(state: WorkflowState): boolean {
  const feedback = state.feedback_history?.at(-1);
  return (
    feedback?.target === 'problem' &&
    feedback.from_loop === 'showcase' &&
    feedback.to_loop === 'kickoff'
  );
}

function ensureNoStoryCard(cwd: string, state: WorkflowState): void {
  const directory = artifactPath(
    cwd,
    state,
    'artifacts/01-requirements/stories',
  );
  const existing = existsSync(directory)
    ? readdirSync(directory).filter((name) => /^US-\d{3,}\.md$/.test(name))
    : [];
  if (
    existing.length > 0 &&
    !(showcaseProblemRevision(state) && existing.join(',') === 'US-001.md')
  ) {
    throw new Error(
      `A v5 Kickoff can confirm exactly one Story, but found: ${existing.join(', ')}.`,
    );
  }
}

/** Apply a human-only Kickoff decision. */
export function decideKickoff(
  cwd: string,
  action: KickoffDecisionAction,
  reason: string,
  now = new Date().toISOString(),
): WorkflowState {
  const state = requireKickoffState(cwd);
  const candidate = state.kickoff_candidate;
  if (!candidate) {
    throw new Error('No Kickoff candidate is awaiting a human decision.');
  }
  if (!KICKOFF_ACTIONS.has(action)) {
    throw new Error(`Unsupported Kickoff decision: ${action}.`);
  }
  const decision: KickoffDecision = {
    action,
    reason: requiredText(reason, 'decision reason'),
    decided_by: 'human',
    decided_at: now,
  };
  const decisions = [...(state.kickoff_decisions ?? []), decision];

  if (action === 'revise') {
    return writeState(cwd, {
      ...state,
      kickoff_candidate: undefined,
      kickoff_decisions: decisions,
    });
  }

  if (action !== 'confirmed') {
    return writeState(cwd, {
      ...state,
      kickoff_decisions: decisions,
      halted: {
        loop: 'kickoff',
        reason: `${action}: ${decision.reason}`,
        recorded_at: now,
      },
    });
  }

  ensureNoStoryCard(cwd, state);
  const storyId = 'US-001';
  const problemPath = artifactPath(
    cwd,
    state,
    'artifacts/01-requirements/problem-statement.md',
  );
  const storyPath = artifactPath(
    cwd,
    state,
    `artifacts/01-requirements/stories/${storyId}.md`,
  );
  mkdirSync(dirname(problemPath), { recursive: true });
  mkdirSync(dirname(storyPath), { recursive: true });
  writeFileSync(problemPath, problemStatement(candidate));
  writeFileSync(storyPath, storyCard(candidate, storyId));

  const transitioned = transitionLoopState(state, { to: 'understand' }, now);
  const confirmed = writeState(cwd, {
    ...transitioned,
    kickoff_decisions: [
      ...(state.kickoff_decisions ?? []),
      { ...decision, story_id: storyId },
    ],
    understand_stage: 'tqa',
    active_clarification_story: {
      story_id: storyId,
      selected_at: now,
    },
  });
  validateStoryCards(cwd, confirmed);
  return confirmed;
}
