import {
  appendFileSync,
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { ensureProjectDirs } from '../evidence/artifact-index';
import { artifactPath, iterationRoot } from '../workflow/iteration-paths';
import { readState, writeState } from '../workflow/state-store';
import type {
  ClarificationRecord,
  ClarificationStoryOutcome,
  ClarificationStoryOutcomeProposal,
  ClarificationTarget,
  WorkflowState,
} from '../workflow/types';

export interface AskClarificationInput {
  story_id: string;
  question: string;
  target: ClarificationTarget;
}

interface ClarificationHistoryDocument {
  version: 1;
  iteration_id: string;
  story_id: string;
  clarifications: ClarificationRecord[];
}

interface ClarificationStoryStatusDocument {
  version: 2;
  iteration_id: string;
  active_story_id: string | null;
  stories: Array<{
    story_id: string;
    status:
      | 'unselected'
      | 'active'
      | 'awaiting_human_decision'
      | ClarificationStoryOutcome;
    summary?: string;
    proposal?: ClarificationStoryOutcomeProposal;
    decided_by?: 'human';
    confirmed_at?: string;
  }>;
}

const VALID_TARGETS = new Set<ClarificationTarget>([
  'business_context',
  'story',
  'history',
]);
const VALID_STORY_OUTCOMES = new Set<ClarificationStoryOutcome>([
  'clarified',
  'needs_split',
  'deferred',
]);

function normalizeStoryId(storyId: string): string {
  const normalized = storyId.trim().toUpperCase();
  if (!/^US-\d{3,}$/.test(normalized)) {
    throw new Error(`Invalid story id: ${storyId}. Expected US-xxx.`);
  }
  return normalized;
}

function requireNonEmpty(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} must not be empty.`);
  return normalized;
}

function assertClarificationPhase(state: WorkflowState): void {
  if (state.halted) {
    throw new Error(
      `Cannot clarify: iteration is halted (${state.halted.reason}).`,
    );
  }
  if (state.phase !== 'clarify') {
    throw new Error(
      `Cannot manage clarification: current phase is ${state.phase}; expected clarify.`,
    );
  }
}

function storyPath(cwd: string, state: WorkflowState, storyId: string): string {
  return artifactPath(
    cwd,
    state,
    `artifacts/01-requirements/stories/${storyId}.md`,
  );
}

function storyDirectory(cwd: string, state: WorkflowState): string {
  return artifactPath(cwd, state, 'artifacts/01-requirements/stories');
}

function storyStatusJsonPath(cwd: string, state: WorkflowState): string {
  return artifactPath(
    cwd,
    state,
    'artifacts/01-requirements/clarifications/story-status.json',
  );
}

function historyJsonPath(
  cwd: string,
  state: WorkflowState,
  storyId: string,
): string {
  return artifactPath(
    cwd,
    state,
    `artifacts/01-requirements/clarifications/${storyId}.json`,
  );
}

function historyMarkdownPath(
  cwd: string,
  state: WorkflowState,
  storyId: string,
): string {
  return artifactPath(
    cwd,
    state,
    `artifacts/01-requirements/clarifications/${storyId}.md`,
  );
}

function requireArtifact(path: string, description: string): void {
  if (
    !existsSync(path) ||
    !statSync(path).isFile() ||
    statSync(path).size === 0
  ) {
    throw new Error(`${description} is missing or empty: ${path}.`);
  }
}

export function clarificationStoryIds(
  cwd: string,
  state = readState(cwd),
): string[] {
  const directory = storyDirectory(cwd, state);
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^US-\d{3,}\.md$/.test(entry.name))
    .map((entry) => entry.name.replace(/\.md$/, ''))
    .filter((storyId) => {
      const path = storyPath(cwd, state, storyId);
      return statSync(path).size > 0;
    })
    .sort();
}

export function unresolvedClarificationStoryIds(
  cwd: string,
  state = readState(cwd),
): string[] {
  const completed = new Set(
    (state.clarification_story_outcomes ?? []).map(({ story_id }) => story_id),
  );
  return clarificationStoryIds(cwd, state).filter(
    (storyId) => !completed.has(storyId),
  );
}

function persistStoryStatus(cwd: string, state: WorkflowState): void {
  ensureProjectDirs(cwd, iterationRoot(cwd, state));
  const outcomes = new Map(
    (state.clarification_story_outcomes ?? []).map((outcome) => [
      outcome.story_id,
      outcome,
    ]),
  );
  const proposal = state.proposed_clarification_story_outcome;
  const document: ClarificationStoryStatusDocument = {
    version: 2,
    iteration_id: state.iteration_id,
    active_story_id: state.active_clarification_story?.story_id ?? null,
    stories: clarificationStoryIds(cwd, state).map((storyId) => {
      const outcome = outcomes.get(storyId);
      if (outcome) {
        return {
          story_id: storyId,
          status: outcome.outcome,
          summary: outcome.summary,
          ...(outcome.decided_by
            ? {
                decided_by: outcome.decided_by,
                confirmed_at: outcome.confirmed_at,
                proposal: outcome.proposal,
              }
            : {}),
        };
      }
      if (proposal?.story_id === storyId) {
        return {
          story_id: storyId,
          status: 'awaiting_human_decision',
          summary: proposal.summary,
          proposal,
        };
      }
      return {
        story_id: storyId,
        status:
          state.active_clarification_story?.story_id === storyId
            ? 'active'
            : 'unselected',
      };
    }),
  };
  writeFileSync(
    storyStatusJsonPath(cwd, state),
    `${JSON.stringify(document, null, 2)}\n`,
  );
}

function answerDestination(
  cwd: string,
  state: WorkflowState,
  clarification: ClarificationRecord,
): string | undefined {
  switch (clarification.target) {
    case 'business_context':
      return artifactPath(
        cwd,
        state,
        'artifacts/01-requirements/product-context-delta.md',
      );
    case 'story':
      return storyPath(cwd, state, clarification.story_id);
    case 'history':
      return undefined;
  }
}

function nextQuestionId(state: WorkflowState): string {
  const records = [
    ...(state.clarification_history ?? []),
    ...(state.pending_clarification ? [state.pending_clarification] : []),
  ];
  const highest = records.reduce((max, record) => {
    const matched = /^Q-(\d+)$/.exec(record.question_id);
    return matched ? Math.max(max, Number(matched[1])) : max;
  }, 0);
  return `Q-${String(highest + 1).padStart(3, '0')}`;
}

function recordsForStory(
  state: WorkflowState,
  storyId: string,
): ClarificationRecord[] {
  const records = (state.clarification_history ?? []).filter(
    (record) => record.story_id === storyId,
  );
  if (state.pending_clarification?.story_id === storyId) {
    records.push(state.pending_clarification);
  }
  return records;
}

function markdownForHistory(state: WorkflowState, storyId: string): string {
  const records = recordsForStory(state, storyId);
  const exchanges = records.length
    ? records
        .map(
          (record) =>
            `## ${record.question_id}\n\n- 状态：${record.answer ? '已回答' : '待回答'}\n- 目标：${record.target}\n- 提问时间：${record.asked_at}\n- 问题：${record.question}\n${record.answer ? `- 回答：${record.answer}\n- 回答时间：${record.answered_at}` : ''}`,
        )
        .join('\n\n')
    : '尚无澄清记录。';
  return `# TQA 澄清记录 — ${storyId}\n\n${exchanges}\n`;
}

function persistHistory(
  cwd: string,
  state: WorkflowState,
  storyId: string,
): void {
  const jsonPath = historyJsonPath(cwd, state, storyId);
  const markdownPath = historyMarkdownPath(cwd, state, storyId);
  const document: ClarificationHistoryDocument = {
    version: 1,
    iteration_id: state.iteration_id,
    story_id: storyId,
    clarifications: recordsForStory(state, storyId),
  };
  writeFileSync(jsonPath, `${JSON.stringify(document, null, 2)}\n`);
  writeFileSync(markdownPath, markdownForHistory(state, storyId));
}

function appendAnswerToDestination(
  path: string,
  clarification: ClarificationRecord,
): void {
  requireArtifact(path, 'Clarification destination artifact');
  const text = readFileSync(path, 'utf8');
  const marker = `<!-- evidence-orchestrator-clarification:${clarification.question_id} -->`;
  if (text.includes(marker)) return;
  appendFileSync(
    path,
    `\n${marker}\n\n## TQA 澄清 ${clarification.question_id}\n\n- 问题：${clarification.question}\n- 回答：${clarification.answer}\n- 来源故事：${clarification.story_id}\n<!-- /evidence-orchestrator-clarification:${clarification.question_id} -->\n`,
  );
}

export function selectClarificationStory(
  cwd: string,
  storyId: string,
): WorkflowState {
  const state = readState(cwd);
  assertClarificationPhase(state);
  if (state.pending_clarification) {
    throw new Error(
      `Cannot select a story: pending clarification ${state.pending_clarification.question_id} must be answered first.`,
    );
  }
  if (state.active_clarification_story) {
    throw new Error(
      `Cannot select another story: ${state.active_clarification_story.story_id} is still active. Complete its clarification first.`,
    );
  }
  const normalizedStoryId = normalizeStoryId(storyId);
  requireArtifact(
    storyPath(cwd, state, normalizedStoryId),
    'Clarification story artifact',
  );
  if (
    state.clarification_story_outcomes?.some(
      ({ story_id }) => story_id === normalizedStoryId,
    )
  ) {
    throw new Error(
      `Cannot select ${normalizedStoryId}: its clarification already has an outcome.`,
    );
  }
  const next = writeState(cwd, {
    ...state,
    active_clarification_story: {
      story_id: normalizedStoryId,
      selected_at: new Date().toISOString(),
    },
  });
  persistStoryStatus(cwd, next);
  return next;
}

export function proposeClarificationStoryOutcome(
  cwd: string,
  storyId: string,
  outcome: ClarificationStoryOutcome,
  summary: string,
): WorkflowState {
  const state = readState(cwd);
  assertClarificationPhase(state);
  if (state.pending_clarification) {
    throw new Error(
      `Cannot propose a story outcome: pending clarification ${state.pending_clarification.question_id} must be answered first.`,
    );
  }
  if (state.proposed_clarification_story_outcome) {
    throw new Error(
      `Cannot propose another story outcome: ${state.proposed_clarification_story_outcome.story_id} is awaiting a human decision.`,
    );
  }
  const normalizedStoryId = normalizeStoryId(storyId);
  const activeStoryId = state.active_clarification_story?.story_id;
  if (!activeStoryId) {
    throw new Error(
      'Cannot propose a story outcome: select a clarification story first.',
    );
  }
  if (activeStoryId !== normalizedStoryId) {
    throw new Error(
      `Cannot propose an outcome for ${normalizedStoryId}: selected story is ${activeStoryId}.`,
    );
  }
  if (!VALID_STORY_OUTCOMES.has(outcome)) {
    throw new Error(`Unsupported clarification story outcome: ${outcome}.`);
  }
  requireArtifact(
    storyPath(cwd, state, normalizedStoryId),
    'Clarification story artifact',
  );
  const proposed_clarification_story_outcome: ClarificationStoryOutcomeProposal =
    {
      story_id: normalizedStoryId,
      outcome,
      summary: requireNonEmpty(summary, 'Clarification story outcome summary'),
      proposed_at: new Date().toISOString(),
    };
  const next = writeState(cwd, {
    ...state,
    proposed_clarification_story_outcome,
  });
  persistStoryStatus(cwd, next);
  return next;
}

/** Reject the AI proposal while keeping the human-selected story active. */
export function continueClarificationStory(cwd: string): WorkflowState {
  const state = readState(cwd);
  assertClarificationPhase(state);
  const proposal = state.proposed_clarification_story_outcome;
  if (!proposal) {
    throw new Error(
      'Cannot continue clarification: there is no story outcome proposal to reject.',
    );
  }
  if (state.active_clarification_story?.story_id !== proposal.story_id) {
    throw new Error(
      'Cannot continue clarification: the proposal does not belong to the active story.',
    );
  }
  const next = writeState(cwd, {
    ...state,
    proposed_clarification_story_outcome: undefined,
  });
  persistStoryStatus(cwd, next);
  return next;
}

/** Commit the final disposition from the human-only command channel. */
export function confirmClarificationStoryOutcome(
  cwd: string,
  outcome: ClarificationStoryOutcome,
  summary: string,
): WorkflowState {
  const state = readState(cwd);
  assertClarificationPhase(state);
  if (state.pending_clarification) {
    throw new Error(
      `Cannot confirm a story outcome: pending clarification ${state.pending_clarification.question_id} must be answered first.`,
    );
  }
  const proposal = state.proposed_clarification_story_outcome;
  if (!proposal) {
    throw new Error(
      'Cannot confirm a story outcome: the AI must propose an outcome first.',
    );
  }
  if (state.active_clarification_story?.story_id !== proposal.story_id) {
    throw new Error(
      'Cannot confirm a story outcome: the proposal does not belong to the active story.',
    );
  }
  if (!VALID_STORY_OUTCOMES.has(outcome)) {
    throw new Error(`Unsupported clarification story outcome: ${outcome}.`);
  }
  const confirmedAt = new Date().toISOString();
  const next = writeState(cwd, {
    ...state,
    active_clarification_story: undefined,
    proposed_clarification_story_outcome: undefined,
    clarification_story_outcomes: [
      ...(state.clarification_story_outcomes ?? []),
      {
        story_id: proposal.story_id,
        outcome,
        summary: requireNonEmpty(summary, 'Clarification story summary'),
        completed_at: confirmedAt,
        decided_by: 'human',
        confirmed_at: confirmedAt,
        proposal,
      },
    ],
  });
  persistStoryStatus(cwd, next);
  return next;
}

export function validateClarificationStoriesComplete(
  cwd: string,
  state = readState(cwd),
): void {
  const storyIds = clarificationStoryIds(cwd, state);
  if (storyIds.length === 0) {
    throw new Error(
      'Cannot complete clarify: no US-xxx story cards exist. Generate the candidate story cards first.',
    );
  }
  if (state.proposed_clarification_story_outcome) {
    throw new Error(
      `Cannot complete clarify: ${state.proposed_clarification_story_outcome.story_id} is awaiting a human decision on the proposed ${state.proposed_clarification_story_outcome.outcome} outcome.`,
    );
  }
  if (state.active_clarification_story) {
    throw new Error(
      `Cannot complete clarify: clarification story ${state.active_clarification_story.story_id} is still active.`,
    );
  }
  const unresolved = unresolvedClarificationStoryIds(cwd, state);
  if (unresolved.length > 0) {
    throw new Error(
      `Cannot complete clarify: stories without a clarification outcome: ${unresolved.join(', ')}.`,
    );
  }
}

/** Ask exactly one business clarification question and persist its pending state. */
export function askClarification(
  cwd: string,
  input: AskClarificationInput,
): WorkflowState {
  const state = readState(cwd);
  assertClarificationPhase(state);
  if (state.pending_clarification) {
    throw new Error(
      `Cannot ask another question: pending clarification ${state.pending_clarification.question_id} must be answered first.`,
    );
  }
  if (state.proposed_clarification_story_outcome) {
    throw new Error(
      `Cannot ask another question: proposed outcome for ${state.proposed_clarification_story_outcome.story_id} is awaiting a human decision.`,
    );
  }
  const storyId = normalizeStoryId(input.story_id);
  const activeStoryId = state.active_clarification_story?.story_id;
  if (!activeStoryId) {
    throw new Error(
      'Cannot ask a clarification question: select a clarification story first.',
    );
  }
  if (activeStoryId !== storyId) {
    throw new Error(
      `Cannot ask for ${storyId}: selected story is ${activeStoryId}.`,
    );
  }
  const question = requireNonEmpty(input.question, 'Clarification question');
  if (!VALID_TARGETS.has(input.target)) {
    throw new Error(`Unsupported clarification target: ${input.target}.`);
  }
  requireArtifact(
    storyPath(cwd, state, storyId),
    'Clarification story artifact',
  );
  const destination =
    input.target === 'business_context'
      ? artifactPath(
          cwd,
          state,
          'artifacts/01-requirements/product-context-delta.md',
        )
      : input.target === 'story'
        ? storyPath(cwd, state, storyId)
        : undefined;
  if (destination)
    requireArtifact(destination, 'Clarification destination artifact');

  ensureProjectDirs(cwd, iterationRoot(cwd, state));
  const pending_clarification: ClarificationRecord = {
    question_id: nextQuestionId(state),
    story_id: storyId,
    question,
    target: input.target,
    asked_at: new Date().toISOString(),
  };
  const next = writeState(cwd, { ...state, pending_clarification });
  persistHistory(cwd, next, storyId);
  return next;
}

/** Record the explicit domain-expert answer and route it to its declared knowledge target. */
export function answerClarification(
  cwd: string,
  answer: string,
): WorkflowState {
  const state = readState(cwd);
  assertClarificationPhase(state);
  const pending = state.pending_clarification;
  if (!pending) throw new Error('There is no pending clarification to answer.');
  const destination = answerDestination(cwd, state, pending);
  if (destination)
    requireArtifact(destination, 'Clarification destination artifact');

  const answered: ClarificationRecord = {
    ...pending,
    answer: requireNonEmpty(answer, 'Clarification answer'),
    answered_at: new Date().toISOString(),
  };
  const next = writeState(cwd, {
    ...state,
    pending_clarification: undefined,
    clarification_history: [...(state.clarification_history ?? []), answered],
  });
  persistHistory(cwd, next, answered.story_id);
  if (destination) appendAnswerToDestination(destination, answered);
  return next;
}
