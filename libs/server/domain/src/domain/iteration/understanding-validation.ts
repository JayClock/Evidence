import { DomainError } from '../error';
import type {
  AnswerClarificationInput,
  AskClarificationInput,
  ClarificationTarget,
  DecideUnderstandingInput,
  ProposeScenarioSetInput,
  ScenarioDraftInput,
  UnderstandingDecisionAction,
} from './understanding';

export const MAX_CLARIFICATION_QUESTION_BYTES = 1_536;
const MAX_CLARIFICATION_ANSWER_LENGTH = 16_000;
const MAX_SCENARIOS = 5;
const MAX_SCENARIO_STEPS = 20;
const MAX_TITLE_LENGTH = 200;
const MAX_TEXT_LENGTH = 2_000;
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;

const TARGETS = new Set<ClarificationTarget>([
  'business_context',
  'story',
  'history',
]);
const ACTIONS = new Set<UnderstandingDecisionAction>([
  'confirm',
  'continue',
  'split',
  'defer',
]);

export function normalizeAskClarificationInput(
  input: AskClarificationInput,
): AskClarificationInput {
  const question = text(input.question, 'clarification question');
  const bytes = new TextEncoder().encode(question).byteLength;
  if (bytes > MAX_CLARIFICATION_QUESTION_BYTES) {
    throw DomainError.validation(
      `clarification question must not exceed ${String(MAX_CLARIFICATION_QUESTION_BYTES)} UTF-8 bytes`,
    );
  }
  return {
    expectedIterationVersion: positiveVersion(
      input.expectedIterationVersion,
      'Iteration',
    ),
    storyId: identifier(input.storyId, 'Story id'),
    storyRevisionId: identifier(input.storyRevisionId, 'Story Revision id'),
    target: parseClarificationTarget(input.target),
    question,
  };
}

export function normalizeAnswerClarificationInput(
  input: AnswerClarificationInput,
): AnswerClarificationInput {
  return {
    expectedIterationVersion: positiveVersion(
      input.expectedIterationVersion,
      'Iteration',
    ),
    clarificationId: identifier(input.clarificationId, 'Clarification id'),
    answer: limitedText(
      input.answer,
      MAX_CLARIFICATION_ANSWER_LENGTH,
      'clarification answer',
    ),
  };
}

export function normalizeScenarioSetInput(
  input: ProposeScenarioSetInput,
): ProposeScenarioSetInput {
  if (
    !Array.isArray(input.scenarios) ||
    input.scenarios.length < 1 ||
    input.scenarios.length > MAX_SCENARIOS
  ) {
    throw DomainError.validation('Scenario Proposal must contain 1–5 drafts');
  }
  const scenarios = input.scenarios.map((scenario, index) =>
    normalizeScenario(scenario, index),
  );
  const fingerprints = scenarios.map((scenario) => JSON.stringify(scenario));
  if (new Set(fingerprints).size !== fingerprints.length) {
    throw DomainError.validation(
      'Scenario Proposal must not contain duplicate drafts',
    );
  }
  return {
    expectedIterationVersion: positiveVersion(
      input.expectedIterationVersion,
      'Iteration',
    ),
    storyId: identifier(input.storyId, 'Story id'),
    storyRevisionId: identifier(input.storyRevisionId, 'Story Revision id'),
    scenarios,
  };
}

export function normalizeUnderstandingDecisionInput(
  input: DecideUnderstandingInput,
): DecideUnderstandingInput {
  const action = parseUnderstandingDecisionAction(input.action);
  const reason = optionalText(input.reason, 'Understanding decision reason');
  if (action !== 'confirm' && !reason) {
    throw DomainError.validation(`Understanding ${action} requires a reason`);
  }
  const selectedDraftIds = (input.selectedDraftIds ?? []).map((value, index) =>
    identifier(value, `selected Draft id ${String(index + 1)}`),
  );
  if (new Set(selectedDraftIds).size !== selectedDraftIds.length) {
    throw DomainError.validation('selected Draft ids must be unique');
  }
  const proposalId = optionalIdentifier(
    input.proposalId,
    'Scenario Proposal id',
  );
  const proposalSha256 = optionalSha256(
    input.proposalSha256,
    'Scenario Proposal SHA-256',
  );
  if (action === 'confirm' || action === 'continue') {
    if (!proposalId || !proposalSha256) {
      throw DomainError.validation(
        `Understanding ${action} requires the current Scenario Proposal`,
      );
    }
  }
  if (action === 'confirm' && selectedDraftIds.length === 0) {
    throw DomainError.validation(
      'Understanding confirm requires at least one selected Draft',
    );
  }
  return {
    expectedIterationVersion: positiveVersion(
      input.expectedIterationVersion,
      'Iteration',
    ),
    action,
    proposalId,
    proposalSha256,
    selectedDraftIds,
    reason,
  };
}

export function parseClarificationTarget(value: string): ClarificationTarget {
  if (TARGETS.has(value as ClarificationTarget)) {
    return value as ClarificationTarget;
  }
  throw DomainError.validation(`unsupported clarification target: ${value}`);
}

export function parseUnderstandingDecisionAction(
  value: string,
): UnderstandingDecisionAction {
  if (ACTIONS.has(value as UnderstandingDecisionAction)) {
    return value as UnderstandingDecisionAction;
  }
  throw DomainError.validation(`unsupported Understanding decision: ${value}`);
}

function normalizeScenario(
  input: ScenarioDraftInput,
  index: number,
): ScenarioDraftInput {
  if (!input || typeof input !== 'object') {
    throw DomainError.validation(
      `Scenario Draft ${String(index + 1)} is required`,
    );
  }
  const label = `Scenario Draft ${String(index + 1)}`;
  return {
    title: limitedSingleLine(input.title, MAX_TITLE_LENGTH, `${label} title`),
    given: textList(input.given, `${label} Given`),
    when: limitedText(input.when, MAX_TEXT_LENGTH, `${label} When`),
    then: textList(input.then, `${label} Then`),
    businessData: textList(input.businessData, `${label} businessData`),
  };
}

function textList(values: string[], label: string): string[] {
  if (!Array.isArray(values) || values.length === 0) {
    throw DomainError.validation(`${label} must contain at least one item`);
  }
  if (values.length > MAX_SCENARIO_STEPS) {
    throw DomainError.validation(
      `${label} must not contain more than ${String(MAX_SCENARIO_STEPS)} items`,
    );
  }
  const normalized = values.map((value, index) =>
    limitedText(value, MAX_TEXT_LENGTH, `${label} ${String(index + 1)}`),
  );
  if (new Set(normalized).size !== normalized.length) {
    throw DomainError.validation(`${label} must not contain duplicates`);
  }
  return normalized;
}

function positiveVersion(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw DomainError.validation(`${label} expected version must be positive`);
  }
  return value;
}

function identifier(value: string, label: string): string {
  const normalized = limitedSingleLine(value, 255, label);
  return normalized;
}

function optionalIdentifier(
  value: string | null | undefined,
  label: string,
): string | null {
  return value === undefined || value === null || value === ''
    ? null
    : identifier(value, label);
}

function optionalSha256(
  value: string | null | undefined,
  label: string,
): string | null {
  if (value === undefined || value === null || value === '') return null;
  const normalized = limitedSingleLine(value, 71, label).toLowerCase();
  if (!SHA256_PATTERN.test(normalized)) {
    throw DomainError.validation(`${label} is invalid`);
  }
  return normalized;
}

function optionalText(
  value: string | null | undefined,
  label: string,
): string | null {
  return value === undefined || value === null || value === ''
    ? null
    : limitedText(value, MAX_TEXT_LENGTH, label);
}

function limitedSingleLine(
  value: string,
  maximum: number,
  label: string,
): string {
  const normalized = limitedText(value, maximum, label);
  if (/\n/.test(normalized)) {
    throw DomainError.validation(`${label} must be a single line`);
  }
  return normalized;
}

function limitedText(value: string, maximum: number, label: string): string {
  const normalized = text(value, label);
  if (normalized.length > maximum) {
    throw DomainError.validation(
      `${label} must not exceed ${String(maximum)} characters`,
    );
  }
  return normalized;
}

function text(value: string, label: string): string {
  if (typeof value !== 'string') {
    throw DomainError.validation(`${label} must not be empty`);
  }
  const normalized = value.replace(/\r\n?/g, '\n').trim();
  if (!normalized) {
    throw DomainError.validation(`${label} must not be empty`);
  }
  return normalized;
}
