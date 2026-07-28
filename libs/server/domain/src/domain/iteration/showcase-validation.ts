import { DomainError } from '../error';
import { normalizeContentSha256 } from '../inbox';
import { normalizeGitCommitSha } from './validation';
import type {
  DecideShowcaseInput,
  RecordShowcaseEvaluationInput,
  RecordShowcaseProductObservationInput,
  RecordShowcaseQ2ObservationInput,
  RecordShowcaseReviewInput,
  RecordShowcaseRiskDecisionInput,
  ShowcaseEvaluation,
  ShowcaseFeedbackTarget,
  ShowcaseProductObservation,
  ShowcaseQ2Observation,
  ShowcaseQuadrant,
  ShowcaseReviewRecommendation,
  ShowcaseRiskActivity,
  ShowcaseRiskDecision,
} from './showcase';
import type { TaskingCandidateDescription } from './tasking';

const MAX_TEXT = 4_000;
const MAX_SHORT_TEXT = 500;
const MAX_LIST = 50;
const WINDOWS_ABSOLUTE_PATH = /^(?:[a-zA-Z]:[\\/]|\\\\)/;

const Q3_ACTIVITIES = [
  'exploratory',
  'usability',
  'accessibility',
  'compatibility',
  'other',
] as const;
const Q4_ACTIVITIES = [
  'performance',
  'security',
  'reliability',
  'operability',
  'other',
] as const;

export interface ShowcaseQ2Check {
  testId: string;
  scenarioIds: string[];
  processId: string;
  stepId: string;
  projectId: string | null;
  command: string;
}

export interface ShowcaseReadinessInput {
  q2Checks: ShowcaseQ2Check[];
  scenarioIds: string[];
  q2Observations: ShowcaseQ2Observation[];
  productObservations: ShowcaseProductObservation[];
  riskDecisions: ShowcaseRiskDecision[];
  evaluations: ShowcaseEvaluation[];
}

export type ShowcaseReadinessBlocker =
  | 'missing_q2'
  | 'failed_q2'
  | 'missing_product_observation'
  | 'missing_risk_decision'
  | 'missing_evaluation'
  | 'evaluation_concern';

export function materializeShowcaseQ2Checks(
  plan: TaskingCandidateDescription,
): ShowcaseQ2Check[] {
  const checks = plan.tests
    .filter((test) => test.quadrant === 'Q2')
    .map((test) => {
      const process = plan.processes.find(
        (candidate) => candidate.runtimePlanId === test.runtimePlanId,
      );
      const command = process?.focusedCommands.find(
        (candidate) =>
          candidate.testId === test.id && candidate.stepId === test.stepId,
      );
      if (!process || !command) {
        throw DomainError.conflict(
          `Approved Q2 TEST ${test.id} lost its locked process command`,
        );
      }
      return {
        testId: test.id,
        scenarioIds: [...test.scenarioIds],
        processId: process.processId,
        stepId: test.stepId,
        projectId: command.projectId,
        command: command.command,
      };
    });
  if (checks.length === 0) {
    throw DomainError.conflict(
      'Approved Tasking Plan must contain at least one Q2 TEST for Showcase',
    );
  }
  return checks;
}

export function showcaseReadinessBlockers(
  input: ShowcaseReadinessInput,
): ShowcaseReadinessBlocker[] {
  const blockers = new Set<ShowcaseReadinessBlocker>();
  for (const check of input.q2Checks) {
    const observation = input.q2Observations.find(
      (candidate) => candidate.description().testId === check.testId,
    );
    if (!observation) blockers.add('missing_q2');
    else if (!showcaseQ2Passed(observation)) blockers.add('failed_q2');
  }
  for (const scenarioId of input.scenarioIds) {
    if (
      !input.productObservations.some(
        (candidate) => candidate.description().scenarioId === scenarioId,
      )
    ) {
      blockers.add('missing_product_observation');
    }
  }
  for (const quadrant of ['Q3', 'Q4'] as const) {
    const risk = input.riskDecisions.find(
      (candidate) => candidate.description().quadrant === quadrant,
    );
    if (!risk) {
      blockers.add('missing_risk_decision');
      continue;
    }
    for (const activity of risk.description().activities) {
      const evaluations = input.evaluations
        .filter((candidate) => {
          const description = candidate.description();
          return (
            description.quadrant === quadrant &&
            description.activity === activity
          );
        })
        .sort(
          (left, right) =>
            right.description().sequence - left.description().sequence,
        );
      const latest = evaluations[0];
      if (!latest) blockers.add('missing_evaluation');
      else if (latest.description().outcome === 'concern') {
        blockers.add('evaluation_concern');
      }
    }
  }
  return [...blockers];
}

export function showcaseQ2Passed(observation: ShowcaseQ2Observation): boolean {
  const description = observation.description();
  return description.termination === 'exited' && description.exitCode === 0;
}

export function normalizeShowcaseQ2ObservationInput(
  input: RecordShowcaseQ2ObservationInput,
): RecordShowcaseQ2ObservationInput {
  requiredObject(input, 'Showcase Q2 observation');
  return {
    showcaseRunId: singleLine(input.showcaseRunId, 'Showcase Run id'),
    actionId: singleLine(input.actionId, 'Showcase action id'),
    expectedShowcaseVersion: positiveVersion(input.expectedShowcaseVersion),
    command: singleLine(input.command, 'Showcase Q2 command'),
    termination: oneOf(input.termination, 'Q2 termination', [
      'exited',
      'timed_out',
      'signaled',
      'spawn_error',
    ]),
    exitCode: nullableInteger(input.exitCode, 'Q2 exit code'),
    signal: optionalSingleLine(input.signal, 'Q2 signal'),
    durationMs: nonnegative(input.durationMs, 'Q2 duration'),
    stdoutSha256: normalizeContentSha256(input.stdoutSha256),
    stdoutBytes: nonnegative(input.stdoutBytes, 'Q2 stdout bytes'),
    stdoutLines: nonnegative(input.stdoutLines, 'Q2 stdout lines'),
    stderrSha256: normalizeContentSha256(input.stderrSha256),
    stderrBytes: nonnegative(input.stderrBytes, 'Q2 stderr bytes'),
    stderrLines: nonnegative(input.stderrLines, 'Q2 stderr lines'),
    approvedCommitSha: normalizeGitCommitSha(input.approvedCommitSha),
    worktreeSha256: normalizeContentSha256(input.worktreeSha256),
  };
}

export function normalizeShowcaseProductObservationInput(
  input: RecordShowcaseProductObservationInput,
): RecordShowcaseProductObservationInput {
  requiredObject(input, 'Showcase product observation');
  return {
    expectedShowcaseVersion: positiveVersion(input.expectedShowcaseVersion),
    scenarioId: singleLine(input.scenarioId, 'Scenario id'),
    observedOutcomes: textList(
      input.observedOutcomes,
      'Observed outcomes',
      true,
    ),
    observation: text(input.observation, 'Product observation', MAX_TEXT),
    valueFeedback: text(input.valueFeedback, 'Value feedback', MAX_TEXT),
    evidenceRefs: evidenceRefs(input.evidenceRefs),
  };
}

export function normalizeShowcaseRiskDecisionInput(
  input: RecordShowcaseRiskDecisionInput,
): RecordShowcaseRiskDecisionInput {
  requiredObject(input, 'Showcase risk decision');
  const quadrant = oneOf(input.quadrant, 'risk quadrant', ['Q3', 'Q4']);
  const disposition = oneOf(input.disposition, 'risk disposition', [
    'required',
    'not_required',
  ]);
  const activities = activityList(input.activities, quadrant);
  if (disposition === 'required' && activities.length === 0) {
    throw DomainError.validation(
      `${quadrant} required disposition must select an evaluation activity`,
    );
  }
  if (disposition === 'not_required' && activities.length > 0) {
    throw DomainError.validation(
      `${quadrant} not_required disposition cannot select activities`,
    );
  }
  return {
    expectedShowcaseVersion: positiveVersion(input.expectedShowcaseVersion),
    quadrant,
    disposition,
    activities,
    reason: text(input.reason, `${quadrant} decision reason`, MAX_TEXT),
  };
}

export function normalizeShowcaseEvaluationInput(
  input: RecordShowcaseEvaluationInput,
): RecordShowcaseEvaluationInput {
  requiredObject(input, 'Showcase evaluation');
  const quadrant = oneOf(input.quadrant, 'evaluation quadrant', ['Q3', 'Q4']);
  return {
    expectedShowcaseVersion: positiveVersion(input.expectedShowcaseVersion),
    quadrant,
    activity: activity(input.activity, quadrant),
    outcome: oneOf(input.outcome, 'evaluation outcome', ['passed', 'concern']),
    finding: text(input.finding, 'Evaluation finding', MAX_TEXT),
    evidenceRefs: evidenceRefs(input.evidenceRefs),
  };
}

export function normalizeShowcaseReviewInput(
  input: RecordShowcaseReviewInput,
): RecordShowcaseReviewInput {
  requiredObject(input, 'Showcase Review');
  return {
    expectedShowcaseVersion: positiveVersion(input.expectedShowcaseVersion),
    evidenceBundleSha256: normalizeContentSha256(input.evidenceBundleSha256),
    observedFacts: textList(input.observedFacts, 'Observed facts', true),
    productDomainFeedback: textList(
      input.productDomainFeedback,
      'Product/domain feedback',
      false,
    ),
    technicalQualityFeedback: textList(
      input.technicalQualityFeedback,
      'Technical quality feedback',
      false,
    ),
    unresolvedAssumptions: textList(
      input.unresolvedAssumptions,
      'Unresolved assumptions',
      false,
    ),
    recommendation: oneOf<ShowcaseReviewRecommendation>(
      input.recommendation,
      'Showcase recommendation',
      ['accept', 'revise'],
    ),
  };
}

export function normalizeDecideShowcaseInput(
  input: DecideShowcaseInput,
): Required<Omit<DecideShowcaseInput, 'feedbackTarget'>> & {
  feedbackTarget: ShowcaseFeedbackTarget | null;
} {
  requiredObject(input, 'Showcase decision');
  const action = oneOf(input.action, 'Showcase decision', [
    'accept',
    'revise',
    'reject',
  ]);
  const feedbackTarget = input.feedbackTarget
    ? oneOf<ShowcaseFeedbackTarget>(
        input.feedbackTarget,
        'Showcase feedback target',
        [
          'problem',
          'story',
          'business_knowledge',
          'scenario',
          'model',
          'modeling_method',
          'architecture',
          'test_strategy',
          'test_process',
          'test',
          'implementation',
          'refactor',
          'value_validation',
          'showcase_setup',
        ],
      )
    : null;
  if (action === 'revise' && !feedbackTarget) {
    throw DomainError.validation(
      'Showcase revise decision requires a feedback target',
    );
  }
  if (action !== 'revise' && feedbackTarget) {
    throw DomainError.validation(
      'Only a Showcase revise decision can include a feedback target',
    );
  }
  return {
    expectedShowcaseVersion: positiveVersion(input.expectedShowcaseVersion),
    action,
    reason: text(input.reason, 'Showcase decision reason', MAX_TEXT),
    evidenceBundleSha256: optionalSha(input.evidenceBundleSha256),
    reviewSha256: optionalSha(input.reviewSha256),
    feedbackTarget,
  };
}

function activityList(
  value: ShowcaseRiskActivity[],
  quadrant: ShowcaseQuadrant,
): ShowcaseRiskActivity[] {
  if (!Array.isArray(value) || value.length > MAX_LIST) {
    throw DomainError.validation('Risk activities must be a bounded array');
  }
  return [...new Set(value.map((candidate) => activity(candidate, quadrant)))];
}

function activity(
  value: ShowcaseRiskActivity,
  quadrant: ShowcaseQuadrant,
): ShowcaseRiskActivity {
  return quadrant === 'Q3'
    ? oneOf(value, 'Q3 activity', Q3_ACTIVITIES)
    : oneOf(value, 'Q4 activity', Q4_ACTIVITIES);
}

function evidenceRefs(value: string[]): string[] {
  const refs = textList(value, 'Evidence refs', true).map((entry) => {
    if (
      entry.startsWith('/') ||
      WINDOWS_ABSOLUTE_PATH.test(entry) ||
      entry.toLowerCase().startsWith('file:')
    ) {
      throw DomainError.validation(
        'Showcase evidence refs cannot contain local absolute paths',
      );
    }
    return entry;
  });
  return [...new Set(refs)];
}

function textList(value: string[], label: string, required: boolean): string[] {
  if (!Array.isArray(value) || value.length > MAX_LIST) {
    throw DomainError.validation(`${label} must be a bounded array`);
  }
  const normalized = value.map((entry, index) =>
    text(entry, `${label}[${String(index)}]`, MAX_SHORT_TEXT),
  );
  if (required && normalized.length === 0) {
    throw DomainError.validation(`${label} must not be empty`);
  }
  return normalized;
}

function requiredObject(value: unknown, label: string): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw DomainError.validation(`${label} input is required`);
  }
}

function positiveVersion(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw DomainError.validation(
      'Showcase expected version must be a positive integer',
    );
  }
  return value;
}

function nonnegative(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw DomainError.validation(`${label} must be a non-negative integer`);
  }
  return value;
}

function nullableInteger(value: number | null, label: string): number | null {
  if (value !== null && !Number.isSafeInteger(value)) {
    throw DomainError.validation(`${label} must be an integer or null`);
  }
  return value;
}

function optionalSha(value: string | null | undefined): string | null {
  return value ? normalizeContentSha256(value) : null;
}

function optionalSingleLine(
  value: string | null | undefined,
  label: string,
): string | null {
  return value ? singleLine(value, label) : null;
}

function singleLine(value: string, label: string): string {
  if (typeof value !== 'string' || !value.trim() || /[\r\n]/.test(value)) {
    throw DomainError.validation(`${label} must be a non-empty single line`);
  }
  return value.trim();
}

function text(value: string, label: string, maximum: number): string {
  if (typeof value !== 'string') {
    throw DomainError.validation(`${label} must not be empty`);
  }
  const normalized = value.replace(/\r\n?/g, '\n').trim();
  if (!normalized || normalized.length > maximum) {
    throw DomainError.validation(
      `${label} must contain 1-${String(maximum)} characters`,
    );
  }
  return normalized;
}

function oneOf<T extends string>(
  value: unknown,
  label: string,
  allowed: readonly T[],
): T {
  if (typeof value === 'string' && allowed.includes(value as T)) {
    return value as T;
  }
  throw DomainError.validation(`unsupported ${label}: ${String(value)}`);
}
