import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { artifactPath } from '../workflow/iteration-paths';
import { readState, writeState } from '../workflow/state-store';
import type { ClarificationRecord, WorkflowState } from '../workflow/types';
import { singleStoryId } from './story-cards';

export interface AskClarificationInput {
  story_id: string;
  thought: string;
  question: string;
}

interface TqaDocument {
  version: 1;
  iteration_id: string;
  story_id: string;
  exchanges: ClarificationRecord[];
}

function requireText(value: string, name: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${name} must not be empty.`);
  return trimmed;
}

function assertDiscoverPhase(state: WorkflowState): void {
  if (state.halted) {
    throw new Error(
      `Cannot run TQA: iteration is halted (${state.halted.reason}).`,
    );
  }
  if (state.phase !== 'discover') {
    throw new Error(
      `Cannot run TQA in phase ${state.phase}; expected discover.`,
    );
  }
}

function normalizeStoryId(storyId: string): string {
  const normalized = storyId.trim().toUpperCase();
  if (!/^US-\d{3,}$/.test(normalized)) {
    throw new Error(`Invalid story id: ${storyId}. Expected US-xxx.`);
  }
  return normalized;
}

function tqaJsonPath(cwd: string, state: WorkflowState): string {
  return artifactPath(cwd, state, 'artifacts/02-discovery/tqa.json');
}

function tqaMarkdownPath(cwd: string, state: WorkflowState): string {
  return artifactPath(cwd, state, 'artifacts/02-discovery/tqa.md');
}

function records(state: WorkflowState): ClarificationRecord[] {
  return [
    ...(state.clarification_history ?? []),
    ...(state.pending_clarification ? [state.pending_clarification] : []),
  ];
}

function nextQuestionId(state: WorkflowState): string {
  const highest = records(state).reduce((max, record) => {
    const matched = /^Q-(\d+)$/.exec(record.question_id);
    return matched ? Math.max(max, Number(matched[1])) : max;
  }, 0);
  return `Q-${String(highest + 1).padStart(3, '0')}`;
}

function markdownRecord(record: ClarificationRecord): string {
  const answer = record.answer
    ? `\n- Answer: ${record.answer}\n- Answered at: ${record.answered_at}`
    : '\n- Answer: awaiting domain expert';
  return `## ${record.question_id}\n\n- Thought: ${record.thought}\n- Question: ${record.question}\n- Asked at: ${record.asked_at}${answer}`;
}

function persistTqa(cwd: string, state: WorkflowState): void {
  const storyId = singleStoryId(cwd, state);
  const jsonPath = tqaJsonPath(cwd, state);
  const markdownPath = tqaMarkdownPath(cwd, state);
  mkdirSync(dirname(jsonPath), { recursive: true });
  const document: TqaDocument = {
    version: 1,
    iteration_id: state.iteration_id as string,
    story_id: storyId,
    exchanges: records(state),
  };
  writeFileSync(jsonPath, `${JSON.stringify(document, null, 2)}\n`);
  const body = document.exchanges.length
    ? document.exchanges.map(markdownRecord).join('\n\n')
    : 'No TQA exchanges recorded.';
  writeFileSync(markdownPath, `# TQA — ${storyId}\n\n${body}\n`);
}

/** Ask exactly one high-value business question for the iteration's sole Story. */
export function askClarification(
  cwd: string,
  input: AskClarificationInput,
): WorkflowState {
  const state = readState(cwd);
  assertDiscoverPhase(state);
  if (state.pending_clarification) {
    throw new Error(
      `Cannot ask another question: ${state.pending_clarification.question_id} is awaiting a domain-expert answer.`,
    );
  }
  const requestedStoryId = normalizeStoryId(input.story_id);
  const storyId = singleStoryId(cwd, state);
  if (requestedStoryId !== storyId) {
    throw new Error(
      `Cannot ask about ${requestedStoryId}: this iteration contains only ${storyId}.`,
    );
  }
  const pending_clarification: ClarificationRecord = {
    question_id: nextQuestionId(state),
    story_id: storyId,
    thought: requireText(input.thought, 'TQA thought'),
    question: requireText(input.question, 'TQA question'),
    asked_at: new Date().toISOString(),
  };
  const next = writeState(cwd, { ...state, pending_clarification });
  persistTqa(cwd, next);
  return next;
}

/** Record only the domain expert's explicit answer; the Discover agent applies it. */
export function answerClarification(
  cwd: string,
  answer: string,
): WorkflowState {
  const state = readState(cwd);
  assertDiscoverPhase(state);
  const pending = state.pending_clarification;
  if (!pending) throw new Error('There is no pending TQA question to answer.');
  const answered: ClarificationRecord = {
    ...pending,
    answer: requireText(answer, 'TQA answer'),
    answered_at: new Date().toISOString(),
  };
  const next = writeState(cwd, {
    ...state,
    pending_clarification: undefined,
    clarification_history: [...(state.clarification_history ?? []), answered],
  });
  persistTqa(cwd, next);
  return next;
}

export function readTqaDocument(
  cwd: string,
  state: WorkflowState = readState(cwd),
): TqaDocument | undefined {
  const path = tqaJsonPath(cwd, state);
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, 'utf8')) as TqaDocument;
}
