import { createHash } from 'node:crypto';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import {
  FEEDBACK_LOOP_BY_TARGET,
  transitionLoopState,
} from '../workflow/loop-catalog';
import {
  artifactPath,
  artifactRelativePath,
} from '../workflow/iteration-paths';
import {
  readState,
  selectedTestProcesses,
  writeState,
} from '../workflow/state-store';
import type {
  FeedbackTarget,
  ShowcaseDecisionAction,
  ShowcaseDecisionRecord,
  ShowcaseEvaluationActivity,
  ShowcaseQ2Observation,
  ShowcaseReviewRecord,
  ShowcaseReviewRecommendation,
  ShowcaseRiskDecision,
  ShowcaseRiskDisposition,
  ShowcaseRiskQuadrant,
  WorkflowState,
} from '../workflow/types';
import {
  executeTestStep,
  type TestExecutionRecord,
} from './execution-recorder';
import {
  executionEvidencePaths,
  generateExecutionEvidence,
  validateExecutionEvidence,
} from './execution-manifest';
import { readTestProcess } from './process-catalog';
import {
  captureWorktreeSnapshot,
  restoreWorktreeSnapshot,
  type WorktreeSnapshot,
  worktreeDelta,
} from './worktree-snapshot';

const ACTIVITIES = new Set<ShowcaseEvaluationActivity>([
  'exploratory',
  'usability',
  'accessibility',
  'performance',
  'security',
  'reliability',
  'operability',
  'compatibility',
  'other',
]);

interface ShowcaseState extends WorkflowState {
  workflow_version: 5;
  loop: 'showcase';
}

export interface ShowcaseActionResult {
  state: WorkflowState;
  output: string;
  records: TestExecutionRecord[];
}

export interface ShowcaseReviewInput {
  observedFacts: string[];
  productDomainFeedback: string[];
  technicalQualityFeedback: string[];
  unresolvedAssumptions: string[];
  recommendation: ShowcaseReviewRecommendation;
}

export interface ShowcaseReviewerSnapshot {
  worktree: WorktreeSnapshot;
  reviewCount: number;
}

export interface ShowcaseReviewerCompletion {
  state: WorkflowState;
  blocked: boolean;
  output: string;
}

function digest(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function nonEmpty(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} requires a non-empty reason.`);
  return normalized;
}

function nonEmptyItems(values: string[], name: string): string[] {
  if (!Array.isArray(values)) throw new Error(`${name} must be an array.`);
  const normalized = values.map((value) => value.trim()).filter(Boolean);
  if (normalized.length !== values.length) {
    throw new Error(`${name} must not contain empty entries.`);
  }
  return normalized;
}

function showcaseState(cwd: string): ShowcaseState {
  const state = readState(cwd);
  if (
    state.workflow_version !== 5 ||
    state.loop !== 'showcase' ||
    !state.active_work_item ||
    !state.pair_session
  ) {
    throw new Error('Showcase requires the active v5 Scenario and Pair facts.');
  }
  return state as ShowcaseState;
}

function riskPath(state: WorkflowState): string {
  return artifactRelativePath(
    state,
    'artifacts/06-review/showcase-risks.jsonl',
  );
}

function decisionPath(state: WorkflowState): string {
  return artifactRelativePath(
    state,
    'artifacts/06-review/showcase-decisions.jsonl',
  );
}

function appendAudit(cwd: string, path: string, value: unknown): void {
  const absolute = join(cwd, path);
  mkdirSync(dirname(absolute), { recursive: true });
  appendFileSync(absolute, `${JSON.stringify(value)}\n`);
}

function currentRisk(
  state: WorkflowState,
  quadrant: ShowcaseRiskQuadrant,
): ShowcaseRiskDecision | undefined {
  return state.showcase_risk_decisions?.find(
    (decision) => decision.quadrant === quadrant,
  );
}

export function missingShowcaseRisks(
  state: WorkflowState,
): ShowcaseRiskQuadrant[] {
  return (['Q3', 'Q4'] as const).filter(
    (quadrant) => !currentRisk(state, quadrant),
  );
}

function approvedQ2Steps(cwd: string, state: WorkflowState) {
  const workItem = state.active_work_item;
  const candidate = state.tasking_candidate;
  if (!workItem || !candidate) {
    throw new Error('Showcase requires the approved Tasking traceability.');
  }
  return selectedTestProcesses(workItem).flatMap((process) => {
    const definition = readTestProcess(join(cwd, process.path));
    const selected = process.selected_step_ids ?? [];
    return definition.steps
      .filter(({ id, quadrant }) => selected.includes(id) && quadrant === 'Q2')
      .map((step) => {
        const command = process.focused_commands?.find(
          ({ step_id }) => step_id === step.id,
        )?.command;
        const testIds = candidate.tests
          .filter(
            ({ quadrant, process_id, step_id }) =>
              quadrant === 'Q2' &&
              process_id === process.id &&
              step_id === step.id,
          )
          .map(({ id }) => id);
        if (!command || testIds.length === 0) {
          throw new Error(
            `Approved Showcase Q2 traceability drifted: ${process.id}/${step.id}.`,
          );
        }
        return { processId: process.id, stepId: step.id, command, testIds };
      });
  });
}

function latestQ2Passed(cwd: string, state: WorkflowState): boolean {
  const expected = approvedQ2Steps(cwd, state);
  const observations = state.showcase_q2_observations ?? [];
  return (
    expected.length > 0 &&
    expected.every(({ processId, stepId }) => {
      const latest = observations
        .filter(
          ({ process_id, step_id }) =>
            process_id === processId && step_id === stepId,
        )
        .at(-1);
      return latest?.exit_code === 0;
    })
  );
}

export function enterShowcase(
  cwd: string,
  now = new Date().toISOString(),
): WorkflowState {
  const state = readState(cwd);
  if (
    state.workflow_version !== 5 ||
    state.loop !== 'pair' ||
    state.pair_session?.checkpoint !== 'quality_gates_passed'
  ) {
    throw new Error(
      'Showcase can start only after Pair final quality gates pass.',
    );
  }
  validateExecutionEvidence(cwd);
  const transitioned = transitionLoopState(state, { to: 'showcase' }, now);
  return writeState(cwd, {
    ...transitioned,
    showcase_stage: 'setup',
    showcase_q2_observations: undefined,
    showcase_risk_decisions: undefined,
  });
}

export function executeShowcaseQ2(
  cwd: string,
  now = new Date().toISOString(),
): ShowcaseActionResult {
  const state = showcaseState(cwd);
  if (state.showcase_stage !== 'setup') {
    throw new Error('Showcase Q2 can run only during Showcase setup.');
  }
  const steps = approvedQ2Steps(cwd, state);
  if (steps.length === 0) {
    throw new Error('Showcase has no approved Q2 command to execute.');
  }
  const records = steps.map((step) =>
    executeTestStep(cwd, {
      processId: step.processId,
      stepId: step.stepId,
      stage: 'showcase',
      command: step.command,
      invocation: 'showcase-controller',
    }),
  );
  const observations: ShowcaseQ2Observation[] = records.map((record) => {
    const step = steps.find(
      ({ processId, stepId }) =>
        processId === record.process_id && stepId === record.step_id,
    );
    if (!step) throw new Error('Showcase Q2 observation lost its test intent.');
    return {
      process_id: record.process_id,
      step_id: record.step_id ?? '',
      test_ids: step.testIds,
      command: record.command,
      sequence: record.sequence,
      exit_code: record.exit_code,
      stdout_summary: record.stdout_summary ?? '',
      stderr_summary: record.stderr_summary ?? '',
      observed_at: record.completed_at || now,
    };
  });
  const next = writeState(cwd, {
    ...state,
    showcase_q2_observations: [
      ...(state.showcase_q2_observations ?? []),
      ...observations,
    ],
  });
  generateExecutionEvidence(cwd);
  const scenario = state.confirmed_scenario;
  const result = observations
    .map(
      ({
        process_id,
        step_id,
        test_ids,
        exit_code,
        stdout_summary,
        stderr_summary,
      }) =>
        `${process_id}/${step_id} · ${test_ids.join(', ')} · exit=${exit_code}${stdout_summary || stderr_summary ? ` · ${stdout_summary || stderr_summary}` : ''}`,
    )
    .join('\n');
  return {
    state: next,
    records,
    output: `Showcase Q2 observed for ${scenario?.story_id ?? 'unknown'} / ${scenario?.scenario_id ?? 'unknown'}.
Given: ${scenario?.given.join('；') ?? 'missing'}
When: ${scenario?.when ?? 'missing'}
Then: ${scenario?.then.join('；') ?? 'missing'}

${result}

${observations.every(({ exit_code }) => exit_code === 0) ? 'All selected Q2 observations passed. Record explicit Q3 and Q4 risk decisions next.' : 'At least one selected Q2 observation failed. Accept is blocked; route the feedback with /evidence-showcase revise.'}`,
  };
}

export function recordShowcaseRisk(
  cwd: string,
  quadrant: ShowcaseRiskQuadrant,
  disposition: ShowcaseRiskDisposition,
  activities: ShowcaseEvaluationActivity[],
  reason: string,
  now = new Date().toISOString(),
): WorkflowState {
  const state = showcaseState(cwd);
  if (state.showcase_stage !== 'setup') {
    throw new Error('Showcase risks can be decided only during setup.');
  }
  if (
    !['Q3', 'Q4'].includes(quadrant) ||
    !['not_required', 'required'].includes(disposition)
  ) {
    throw new Error('Showcase risk decision has an unsupported value.');
  }
  const normalizedReason = nonEmpty(reason, `${quadrant} risk decision`);
  const normalizedActivities = [...new Set(activities)];
  if (normalizedActivities.some((activity) => !ACTIVITIES.has(activity))) {
    throw new Error(`${quadrant} has an unsupported evaluation activity.`);
  }
  if (
    (disposition === 'required' && normalizedActivities.length === 0) ||
    (disposition === 'not_required' && normalizedActivities.length > 0)
  ) {
    throw new Error(
      `${quadrant} required must name activities; not_required must name none.`,
    );
  }
  const decision: ShowcaseRiskDecision = {
    quadrant,
    disposition,
    activities: normalizedActivities,
    reason: normalizedReason,
    decided_by: 'human',
    decided_at: now,
  };
  appendAudit(cwd, riskPath(state), decision);
  return writeState(cwd, {
    ...state,
    showcase_risk_decisions: [
      ...(state.showcase_risk_decisions ?? []).filter(
        (existing) => existing.quadrant !== quadrant,
      ),
      decision,
    ].sort((left, right) => left.quadrant.localeCompare(right.quadrant)),
  });
}

function validateSharedTraceability(cwd: string, state: ShowcaseState) {
  const workItem = state.active_work_item;
  const scenario = state.confirmed_scenario;
  const pair = state.pair_session;
  if (
    !workItem ||
    !scenario ||
    !pair ||
    scenario.story_id !== workItem.story_id ||
    scenario.scenario_id !== workItem.scenario_id ||
    pair.story_id !== workItem.story_id ||
    pair.scenario_id !== workItem.scenario_id ||
    pair.git_baseline !== workItem.git_baseline
  ) {
    throw new Error(
      'Scenario, Pair tests, and production implementation do not share one work item and Git baseline.',
    );
  }
  if (
    state.model_git_baseline !== workItem.git_baseline ||
    (state.model_change_proposal &&
      (state.model_change_proposal.story_id !== workItem.story_id ||
        state.model_change_proposal.scenario_id !== workItem.scenario_id ||
        state.model_change_proposal.git_baseline !== workItem.git_baseline))
  ) {
    throw new Error(
      'Model candidate, tests, and production implementation do not share the Scenario Git baseline.',
    );
  }
  const manifest = validateExecutionEvidence(cwd, workItem);
  if (
    manifest.story_id !== workItem.story_id ||
    manifest.scenario_id !== workItem.scenario_id ||
    manifest.source.git_baseline !== workItem.git_baseline
  ) {
    throw new Error(
      'Execution manifest does not trace to the active Scenario.',
    );
  }
  return manifest;
}

export function validateShowcaseReadiness(
  cwd: string,
  requireReview = false,
): WorkflowState {
  const state = showcaseState(cwd);
  const manifest = validateSharedTraceability(cwd, state);
  if (!latestQ2Passed(cwd, state) || manifest.showcase.status !== 'passed') {
    throw new Error(
      'Showcase accept requires a passed selected Q2 observation.',
    );
  }
  const missing = missingShowcaseRisks(state);
  if (missing.length > 0) {
    throw new Error(
      `Showcase requires explicit risk decisions for ${missing.join(' and ')}.`,
    );
  }
  if (requireReview && state.showcase_stage !== 'decision') {
    throw new Error('Showcase requires an independent Reviewer report.');
  }
  return state;
}

export function prepareShowcaseReview(cwd: string): WorkflowState {
  const state = validateShowcaseReadiness(cwd);
  if (state.showcase_stage === 'decision') return state;
  if (
    state.showcase_stage !== 'setup' &&
    state.showcase_stage !== 'reviewing'
  ) {
    throw new Error('Showcase is not ready for independent review.');
  }
  return writeState(cwd, { ...state, showcase_stage: 'reviewing' });
}

export function recordShowcaseReview(
  cwd: string,
  input: ShowcaseReviewInput,
  now = new Date().toISOString(),
): ShowcaseReviewRecord {
  const state = showcaseState(cwd);
  if (state.showcase_stage !== 'reviewing') {
    throw new Error('No independent Showcase review is currently running.');
  }
  validateShowcaseReadiness(cwd);
  const observedFacts = nonEmptyItems(input.observedFacts, 'observedFacts');
  if (observedFacts.length === 0) {
    throw new Error(
      'Showcase Reviewer must record at least one observed fact.',
    );
  }
  const productDomainFeedback = nonEmptyItems(
    input.productDomainFeedback,
    'productDomainFeedback',
  );
  const technicalQualityFeedback = nonEmptyItems(
    input.technicalQualityFeedback,
    'technicalQualityFeedback',
  );
  const unresolvedAssumptions = nonEmptyItems(
    input.unresolvedAssumptions,
    'unresolvedAssumptions',
  );
  if (!['accept', 'revise'].includes(input.recommendation)) {
    throw new Error('Showcase review recommendation must be accept or revise.');
  }
  const workItem = state.active_work_item;
  if (!workItem) throw new Error('Showcase has no active work item.');
  const evidence = executionEvidencePaths(cwd);
  if (!evidence.manifest) throw new Error('Showcase manifest is missing.');
  const manifestContent = readFileSync(join(cwd, evidence.manifest));
  const round = (state.showcase_reviews?.length ?? 0) + 1;
  const base = `artifacts/06-review/${workItem.story_id}/${workItem.scenario_id}.review-${String(round).padStart(3, '0')}`;
  const artifactPathValue = artifactRelativePath(state, `${base}.json`);
  const summaryPathValue = artifactRelativePath(state, `${base}.md`);
  const document = {
    version: 1 as const,
    story_id: workItem.story_id,
    scenario_id: workItem.scenario_id,
    git_baseline: workItem.git_baseline,
    execution_manifest_path: evidence.manifest,
    execution_manifest_sha256: digest(manifestContent),
    observed_facts: observedFacts,
    product_domain_feedback: productDomainFeedback,
    technical_quality_feedback: technicalQualityFeedback,
    unresolved_assumptions: unresolvedAssumptions,
    recommendation: input.recommendation,
    reviewed_by: 'showcase-reviewer' as const,
    reviewed_at: now,
  };
  const content = `${JSON.stringify(document, null, 2)}\n`;
  const summary = `# Showcase Review — ${workItem.story_id} / ${workItem.scenario_id}

## Observed facts
${observedFacts.map((item) => `- ${item}`).join('\n')}

## Product / domain feedback
${productDomainFeedback.map((item) => `- ${item}`).join('\n') || '- none'}

## Technical quality feedback
${technicalQualityFeedback.map((item) => `- ${item}`).join('\n') || '- none'}

## Unresolved assumptions
${unresolvedAssumptions.map((item) => `- ${item}`).join('\n') || '- none'}

## Recommendation
- ${input.recommendation}
`;
  const absolute = artifactPath(cwd, state, `${base}.json`);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content);
  writeFileSync(artifactPath(cwd, state, `${base}.md`), summary);
  const record: ShowcaseReviewRecord = {
    ...document,
    artifact_path: artifactPathValue,
    summary_path: summaryPathValue,
    artifact_sha256: digest(content),
  };
  writeState(cwd, {
    ...state,
    showcase_stage: 'decision',
    showcase_reviews: [...(state.showcase_reviews ?? []), record],
  });
  return record;
}

export function captureShowcaseReviewer(cwd: string): ShowcaseReviewerSnapshot {
  const state = showcaseState(cwd);
  if (state.showcase_stage !== 'reviewing') {
    throw new Error('Showcase Reviewer is not ready to run.');
  }
  return {
    worktree: captureWorktreeSnapshot(cwd),
    reviewCount: state.showcase_reviews?.length ?? 0,
  };
}

export function completeShowcaseReviewer(
  cwd: string,
  snapshot: ShowcaseReviewerSnapshot,
  exitCode: number,
  diagnostic: string,
  now = new Date().toISOString(),
): ShowcaseReviewerCompletion {
  let state: WorkflowState | undefined;
  try {
    state = readState(cwd);
  } catch {
    state = undefined;
  }
  const latest = state?.showcase_reviews?.at(-1);
  const reviewRecorded =
    exitCode === 0 &&
    state?.showcase_stage === 'decision' &&
    state.showcase_reviews?.length === snapshot.reviewCount + 1 &&
    latest !== undefined;
  const allowed = new Set(
    reviewRecorded && latest
      ? ['evidence-state.json', latest.artifact_path, latest.summary_path]
      : [],
  );
  const delta = worktreeDelta(cwd, snapshot.worktree);
  const unauthorized = delta.paths.filter((path) => !allowed.has(path));
  const blocked =
    !reviewRecorded ||
    delta.headChanged ||
    delta.indexChanged ||
    unauthorized.length > 0;
  if (!blocked && state) {
    return {
      state,
      blocked: false,
      output: `Independent Showcase review recorded: ${latest?.artifact_path}. Human accept, revise, or reject is required.`,
    };
  }
  restoreWorktreeSnapshot(cwd, snapshot.worktree);
  const restored = readState(cwd);
  const reason = [
    exitCode === 0 ? '' : `Reviewer exited ${exitCode}.`,
    reviewRecorded ? '' : 'Reviewer did not record one structured report.',
    delta.headChanged ? 'Reviewer changed Git HEAD.' : '',
    delta.indexChanged ? 'Reviewer changed the Git index.' : '',
    unauthorized.length
      ? `Reviewer crossed its read-only boundary: ${unauthorized.join(', ')}.`
      : '',
    diagnostic.trim(),
  ]
    .filter(Boolean)
    .join(' ');
  const next = writeState(cwd, {
    ...restored,
    showcase_stage: 'reviewing',
    showcase_review_failures: [
      ...(restored.showcase_review_failures ?? []),
      {
        reason,
        restored_paths: delta.paths,
        recorded_at: now,
      },
    ],
  });
  return {
    state: next,
    blocked: true,
    output: `Showcase Reviewer blocked: ${reason}\nRestored paths: ${delta.paths.join(', ') || 'none'}.`,
  };
}

function reviewSha(state: WorkflowState): string | undefined {
  return state.showcase_reviews?.at(-1)?.artifact_sha256;
}

function clearShowcaseCurrent(state: WorkflowState): WorkflowState {
  return {
    ...state,
    showcase_stage: undefined,
    showcase_q2_observations: undefined,
    showcase_risk_decisions: undefined,
  };
}

function routeRevision(
  state: ShowcaseState,
  target: FeedbackTarget,
  reason: string,
  now: string,
): WorkflowState {
  const destination = FEEDBACK_LOOP_BY_TARGET[target];
  const routed = transitionLoopState(
    state,
    {
      to: destination,
      feedback: { target, reason, decided_by: 'human' },
    },
    now,
  );
  const cleared = clearShowcaseCurrent(routed);
  if (destination === 'showcase') {
    return { ...cleared, showcase_stage: 'setup' };
  }
  if (destination === 'pair') {
    const session = state.pair_session;
    if (!session) throw new Error('Showcase cannot route to a missing Pair.');
    const currentKey = `${session.process_id}/${session.step_id}`;
    return {
      ...cleared,
      phase: 'coding',
      pair_session: {
        ...session,
        checkpoint:
          target === 'test'
            ? 'plan_confirmed'
            : target === 'refactor'
              ? 'green_observed'
              : 'red_observed',
        completed_step_ids: session.completed_step_ids.filter(
          (key) => key !== currentKey,
        ),
        quality_gate_index: 0,
        ...(target === 'test' ? { red_observation: undefined } : {}),
      },
    };
  }
  if (destination === 'tasking') {
    return {
      ...cleared,
      tasking_stage: 'drafting',
      tasking_candidate: undefined,
      tasking_gap: {
        kind: target === 'architecture' ? 'architecture_gap' : 'process_gap',
        reason,
        recorded_at: now,
      },
      approved_test_plan_path: undefined,
      approved_test_plan_sha256: undefined,
      active_work_item: undefined,
      pair_session: undefined,
    };
  }
  if (destination === 'understand') {
    const modeling = target === 'model' || target === 'modeling_method';
    return {
      ...cleared,
      phase: modeling ? 'domain_model' : 'clarify',
      understand_stage: modeling ? 'modeling' : 'tqa',
      ...(modeling
        ? {
            modeling_stage: 'profile' as const,
            modeling_profile_proposal: undefined,
            modeling_profile: undefined,
          }
        : {
            confirmed_scenario: undefined,
            scenario_drafts: undefined,
            active_clarification_story: {
              story_id:
                state.confirmed_scenario?.story_id ??
                state.pair_session.story_id,
              selected_at: now,
            },
            modeling_stage: undefined,
            modeling_profile_proposal: undefined,
            modeling_profile: undefined,
          }),
      model_expansion_path: undefined,
      model_git_baseline: undefined,
      model_change_proposal: undefined,
      model_change_application: undefined,
      model_projection: undefined,
      model_challenges: undefined,
      tasking_stage: undefined,
      tasking_candidate: undefined,
      tasking_gap: undefined,
      approved_test_plan_path: undefined,
      approved_test_plan_sha256: undefined,
      active_work_item: undefined,
      pair_session: undefined,
    };
  }
  return {
    ...cleared,
    phase: 'frame',
    kickoff_candidate: undefined,
    understand_stage: undefined,
    scenario_drafts: undefined,
    confirmed_scenario: undefined,
    active_clarification_story: undefined,
    modeling_stage: undefined,
    modeling_profile_proposal: undefined,
    modeling_profile: undefined,
    model_expansion_path: undefined,
    model_git_baseline: undefined,
    model_change_proposal: undefined,
    model_change_application: undefined,
    model_projection: undefined,
    model_challenges: undefined,
    tasking_stage: undefined,
    tasking_candidate: undefined,
    tasking_gap: undefined,
    approved_test_plan_path: undefined,
    approved_test_plan_sha256: undefined,
    active_work_item: undefined,
    pair_session: undefined,
  };
}

export function decideShowcase(
  cwd: string,
  action: ShowcaseDecisionAction,
  reason: string,
  target?: FeedbackTarget,
  now = new Date().toISOString(),
): WorkflowState {
  const state = showcaseState(cwd);
  if (!['accept', 'revise', 'reject'].includes(action)) {
    throw new Error(`Unsupported Showcase decision: ${action}.`);
  }
  const normalizedReason = nonEmpty(reason, `Showcase ${action}`);
  if (action === 'accept') {
    validateShowcaseReadiness(cwd, true);
  }
  if (action === 'revise' && (!target || !FEEDBACK_LOOP_BY_TARGET[target])) {
    throw new Error('Showcase revise requires one semantic feedback target.');
  }
  if (action !== 'revise' && target) {
    throw new Error(`Showcase ${action} must not declare a feedback target.`);
  }
  const destination =
    action === 'accept'
      ? 'respond'
      : action === 'revise' && target
        ? FEEDBACK_LOOP_BY_TARGET[target]
        : undefined;
  const path = decisionPath(state);
  const decision: ShowcaseDecisionRecord = {
    action,
    reason: normalizedReason,
    ...(target ? { feedback_target: target } : {}),
    from_loop: 'showcase',
    ...(destination ? { to_loop: destination } : {}),
    ...(reviewSha(state) ? { review_artifact_sha256: reviewSha(state) } : {}),
    decided_by: 'human',
    artifact_path: path,
    decided_at: now,
  };
  appendAudit(cwd, path, decision);
  const decisions = [...(state.showcase_decisions ?? []), decision];
  if (action === 'reject') {
    return writeState(cwd, {
      ...state,
      showcase_stage: 'rejected',
      showcase_decisions: decisions,
      halted: {
        phase: 'review',
        reason: normalizedReason,
        recorded_at: now,
      },
    });
  }
  if (action === 'accept') {
    const accepted = transitionLoopState(
      { ...state, showcase_stage: 'accepted' },
      { to: 'respond' },
      now,
    );
    return writeState(cwd, {
      ...accepted,
      showcase_stage: 'accepted',
      showcase_decisions: decisions,
    });
  }
  const revised = routeRevision(
    state,
    target as FeedbackTarget,
    normalizedReason,
    now,
  );
  return writeState(cwd, {
    ...revised,
    showcase_decisions: decisions,
  });
}

export function validateShowcaseEvidence(cwd: string): void {
  const state = readState(cwd);
  if (state.workflow_version !== 5 || !state.showcase_stage) return;
  const manifest = validateExecutionEvidence(cwd);
  if (
    (state.showcase_q2_observations?.length ?? 0) > 0 &&
    manifest.showcase.status === 'not_run'
  ) {
    throw new Error(
      'Persisted Showcase Q2 observations are missing from manifest.',
    );
  }
  const risks = state.showcase_risk_decisions ?? [];
  if (risks.length > 0) {
    const path = riskPath(state);
    const audit = readFileSync(join(cwd, path), 'utf8');
    if (risks.some((risk) => !audit.includes(JSON.stringify(risk)))) {
      throw new Error('Showcase risk audit is missing or stale.');
    }
  }
  for (const review of state.showcase_reviews ?? []) {
    const content = readFileSync(join(cwd, review.artifact_path));
    if (
      digest(content) !== review.artifact_sha256 ||
      !existsSync(join(cwd, review.summary_path))
    ) {
      throw new Error(
        `Showcase review artifact drifted: ${review.artifact_path}.`,
      );
    }
  }
  if ((state.showcase_decisions?.length ?? 0) > 0) {
    const audit = readFileSync(join(cwd, decisionPath(state)), 'utf8');
    const latest = state.showcase_decisions?.at(-1);
    if (!latest || !audit.includes(JSON.stringify(latest))) {
      throw new Error('Showcase human decision audit is missing or stale.');
    }
  }
  if (['decision', 'accepted'].includes(state.showcase_stage)) {
    const latestReview = state.showcase_reviews?.at(-1);
    const currentManifestPath = executionEvidencePaths(cwd).manifest;
    if (
      !latestReview ||
      !currentManifestPath ||
      digest(readFileSync(join(cwd, currentManifestPath))) !==
        latestReview.execution_manifest_sha256
    ) {
      throw new Error(
        'The latest Showcase review references a stale manifest.',
      );
    }
    const q2Passed =
      manifest.showcase.status === 'passed' && latestQ2Passed(cwd, state);
    if (
      !q2Passed ||
      missingShowcaseRisks(state).length > 0 ||
      !state.showcase_reviews?.length
    ) {
      throw new Error(
        'Completed Showcase evidence requires passed Q2, Q3/Q4 decisions, and an independent review.',
      );
    }
  }
  if (
    state.showcase_stage === 'accepted' &&
    state.showcase_decisions?.at(-1)?.action !== 'accept'
  ) {
    throw new Error(
      'Respond requires the latest Showcase decision to be accept.',
    );
  }
}

export function showcaseNextInstruction(cwd: string): string {
  const state = showcaseState(cwd);
  if (!latestQ2Passed(cwd, state)) {
    const failed = (state.showcase_q2_observations ?? []).some(
      ({ exit_code }) => exit_code !== 0,
    );
    return failed
      ? '/evidence-showcase revise <target> <reason>'
      : '/evidence-run executes the selected Q2 Showcase observation';
  }
  const missing = missingShowcaseRisks(state);
  if (missing.length > 0) {
    return `/evidence-showcase risk ${missing[0]?.toLowerCase()} <not-required|required> [activities] <reason>`;
  }
  if (state.showcase_stage === 'decision') {
    return '/evidence-showcase accept|revise|reject <reason>';
  }
  return '/evidence-run starts the independent read-only Showcase Reviewer';
}
