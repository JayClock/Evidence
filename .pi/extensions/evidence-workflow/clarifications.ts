import {
  appendFileSync,
  existsSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { ensureProjectDirs } from './artifacts';
import { artifactPath, iterationRoot } from './iteration';
import { readState, writeState } from './state';
import type {
  ClarificationRecord,
  ClarificationTarget,
  WorkflowState,
} from './types';

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

const VALID_TARGETS = new Set<ClarificationTarget>([
  'business_context',
  'story',
  'history',
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
  const marker = `<!-- evidence-workflow-clarification:${clarification.question_id} -->`;
  if (text.includes(marker)) return;
  appendFileSync(
    path,
    `\n${marker}\n\n## TQA 澄清 ${clarification.question_id}\n\n- 问题：${clarification.question}\n- 回答：${clarification.answer}\n- 来源故事：${clarification.story_id}\n<!-- /evidence-workflow-clarification:${clarification.question_id} -->\n`,
  );
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
  const storyId = normalizeStoryId(input.story_id);
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
