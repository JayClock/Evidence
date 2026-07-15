import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { artifactPath } from '../../iteration/artifact-layout';
import { writeState } from '../../iteration/state-repository';
import { transitionLoopState } from '../../iteration/transition-graph';
import type {
  KickoffCandidate,
  KickoffDecision,
  KickoffDecisionAction,
  WorkflowState,
} from '../../iteration/state';
import { requireKickoffState, kickoffText } from './kickoff-state';
import { validateStoryCards } from './story-card';

const KICKOFF_ACTIONS = new Set<KickoffDecisionAction>([
  'confirmed',
  'revise',
  'split',
  'deferred',
  'stopped',
]);

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

function revisesConfirmedStory(state: WorkflowState): boolean {
  const feedback = state.feedback_history?.at(-1);
  return (
    feedback?.to_loop === 'kickoff' &&
    ((feedback.target === 'problem' && feedback.from_loop === 'showcase') ||
      (feedback.target === 'story' && feedback.from_loop === 'understand'))
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
    !(revisesConfirmedStory(state) && existing.join(',') === 'US-001.md')
  ) {
    throw new Error(
      `A Kickoff can confirm exactly one Story, but found: ${existing.join(', ')}.`,
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
    reason: kickoffText(reason, 'decision reason'),
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
