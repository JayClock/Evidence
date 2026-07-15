import {
  appendFileSync,
  existsSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { ensureProjectDirs } from '../evidence/artifact-index';
import { artifactPath, iterationRoot } from '../workflow/iteration-paths';
import { readState, writeState } from '../workflow/state-store';
import type {
  ClarificationRecord,
  ClarificationTarget,
  WorkflowState,
} from '../workflow/types';

export interface AskClarificationInput {
  story_id: string;
  question: string;
  target: ClarificationTarget;
}

interface ClarificationHistoryDocument {
  version: 2;
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

function requireUnderstandTqa(state: WorkflowState): void {
  if (state.halted) {
    throw new Error(
      `Cannot clarify: iteration is halted (${state.halted.reason}).`,
    );
  }
  if (state.loop !== 'understand' || state.understand_stage !== 'tqa') {
    throw new Error(
      `TQA is only available in Understand/tqa; current activity is ${state.loop}/${state.understand_stage ?? 'unset'}.`,
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
  return [
    ...(state.clarification_history ?? []).filter(
      (record) => record.story_id === storyId,
    ),
    ...(state.pending_clarification?.story_id === storyId
      ? [state.pending_clarification]
      : []),
  ];
}

function markdownForRecord(record: ClarificationRecord): string {
  const status = record.answer
    ? '已回答'
    : record.waived_at
      ? '已放弃'
      : '待回答';
  const resolution = record.answer
    ? `- 回答：${record.answer}\n- 回答时间：${record.answered_at}`
    : record.waived_at
      ? `- 放弃理由：${record.waived_reason}\n- 决定人：${record.waived_by}\n- 放弃时间：${record.waived_at}`
      : '';
  return `## ${record.question_id}\n\n- 状态：${status}\n- 目标：${record.target}\n- 提问时间：${record.asked_at}\n- 问题：${record.question}\n${resolution}`;
}

function persistHistory(
  cwd: string,
  state: WorkflowState,
  storyId: string,
): void {
  ensureProjectDirs(cwd, iterationRoot(cwd, state));
  const records = recordsForStory(state, storyId);
  const document: ClarificationHistoryDocument = {
    version: 2,
    iteration_id: state.iteration_id,
    story_id: storyId,
    clarifications: records,
  };
  writeFileSync(
    historyJsonPath(cwd, state, storyId),
    `${JSON.stringify(document, null, 2)}\n`,
  );
  writeFileSync(
    historyMarkdownPath(cwd, state, storyId),
    `# TQA 澄清记录 — ${storyId}\n\n${records.length ? records.map(markdownForRecord).join('\n\n') : '尚无澄清记录。'}\n`,
  );
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

/** Ask exactly one business question for the iteration's single Story. */
export function askClarification(
  cwd: string,
  input: AskClarificationInput,
  now = new Date().toISOString(),
): WorkflowState {
  const state = readState(cwd);
  requireUnderstandTqa(state);
  if (state.pending_clarification) {
    throw new Error(
      `Cannot ask another question: ${state.pending_clarification.question_id} awaits an answer.`,
    );
  }
  if (state.scenario_drafts?.length) {
    throw new Error(
      'Cannot ask another question while Scenario drafts await a human decision.',
    );
  }
  const storyId = normalizeStoryId(input.story_id);
  const activeStoryId = state.active_clarification_story?.story_id;
  if (!activeStoryId || activeStoryId !== storyId) {
    throw new Error(
      `TQA must belong to the single active Story ${activeStoryId ?? 'none'}, not ${storyId}.`,
    );
  }
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
  if (destination && input.target !== 'business_context') {
    requireArtifact(destination, 'Clarification destination artifact');
  }
  const pending: ClarificationRecord = {
    question_id: nextQuestionId(state),
    story_id: storyId,
    question: requireNonEmpty(input.question, 'Clarification question'),
    target: input.target,
    asked_at: now,
  };
  const next = writeState(cwd, { ...state, pending_clarification: pending });
  persistHistory(cwd, next, storyId);
  return next;
}

/** Record only the domain expert's explicit answer. */
export function answerClarification(
  cwd: string,
  answer: string,
  now = new Date().toISOString(),
): WorkflowState {
  const state = readState(cwd);
  requireUnderstandTqa(state);
  const pending = state.pending_clarification;
  if (!pending) throw new Error('There is no pending clarification to answer.');
  const destination = answerDestination(cwd, state, pending);
  if (
    destination &&
    pending.target === 'business_context' &&
    !existsSync(destination)
  ) {
    writeFileSync(
      destination,
      '# 候选产品上下文增量\n\n仅记录本轮 TQA 新发现；未经 Respond 提升前不是稳定产品事实。\n',
    );
  }
  if (destination)
    requireArtifact(destination, 'Clarification destination artifact');
  const answered: ClarificationRecord = {
    ...pending,
    answer: requireNonEmpty(answer, 'Clarification answer'),
    answered_at: now,
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

/** Preserve an open question when a human splits or defers the single Story. */
export function waivePendingClarification(
  cwd: string,
  reason: string,
  now = new Date().toISOString(),
): WorkflowState {
  const state = readState(cwd);
  requireUnderstandTqa(state);
  const pending = state.pending_clarification;
  if (!pending) return state;
  const waived: ClarificationRecord = {
    ...pending,
    waived_by: 'human',
    waived_reason: requireNonEmpty(reason, 'Clarification waiver reason'),
    waived_at: now,
  };
  const next = writeState(cwd, {
    ...state,
    pending_clarification: undefined,
    clarification_history: [...(state.clarification_history ?? []), waived],
  });
  persistHistory(cwd, next, waived.story_id);
  return next;
}
