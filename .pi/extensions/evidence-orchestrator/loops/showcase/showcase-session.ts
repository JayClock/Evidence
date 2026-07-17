import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
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
} from '../../iteration/transition-graph';
import {
  artifactPath,
  artifactRelativePath,
} from '../../iteration/artifact-layout';
import {
  readState,
  selectedTestProcesses,
  writeState,
} from '../../iteration/state-repository';
import {
  requireCompletedWorkItem,
  type ActiveWorkItem,
  type CompletedWorkItem,
  FeedbackTarget,
  PairSession,
  ShowcaseDecisionAction,
  ShowcaseDecisionRecord,
  ShowcaseEvaluationActivity,
  ShowcaseEvaluationObservation,
  ShowcaseEvaluationOutcome,
  ShowcaseProductObservation,
  ShowcaseQ2Observation,
  ShowcaseReviewRecord,
  ShowcaseReviewRecommendation,
  ShowcaseRiskDecision,
  ShowcaseRiskDisposition,
  ShowcaseRiskQuadrant,
  type WorkflowState,
} from '../../iteration/state';
import {
  approvedCommandTimeoutMs,
  assertLockedMaterializedPlan,
  executeTestStep,
  formatOutputDiagnostic,
  outputDiagnostic,
  type TestExecutionRecord,
} from '../../capabilities/execution-evidence/observation-log';
import {
  executionEvidencePaths,
  generateExecutionEvidence,
  validateExecutionEvidence,
} from '../../capabilities/execution-evidence/manifest';
import { readTestProcess } from '../../capabilities/test-process/catalog';
import {
  captureWorktreeSnapshot,
  restoreWorktreeSnapshot,
  type WorktreeSnapshot,
  worktreeDelta,
} from '../../capabilities/worktree-protection/snapshot';

const ACTIVITIES_BY_QUADRANT: Record<
  ShowcaseRiskQuadrant,
  ShowcaseEvaluationActivity[]
> = {
  Q3: ['exploratory', 'usability', 'accessibility', 'compatibility', 'other'],
  Q4: ['performance', 'security', 'reliability', 'operability', 'other'],
};

export function showcaseActivitiesForQuadrant(
  quadrant: ShowcaseRiskQuadrant,
): ShowcaseEvaluationActivity[] {
  return [...ACTIVITIES_BY_QUADRANT[quadrant]];
}

interface ShowcaseState extends WorkflowState {
  loop: 'showcase';
  active_work_item: ActiveWorkItem;
  pair_session: PairSession;
}

export interface ShowcaseActionResult {
  state: WorkflowState;
  output: string;
  records: TestExecutionRecord[];
}

export interface ShowcaseProductObservationInput {
  observation: string;
  valueFeedback: string;
  evidenceRefs: string[];
}

export interface ShowcaseEvaluationInput {
  quadrant: ShowcaseRiskQuadrant;
  activity: ShowcaseEvaluationActivity;
  outcome: ShowcaseEvaluationOutcome;
  finding: string;
  evidenceRefs: string[];
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
    state.loop !== 'showcase' ||
    !state.active_work_item ||
    !state.pair_session
  ) {
    throw new Error('Showcase requires the active Scenario and Pair facts.');
  }
  return state as ShowcaseState;
}

function riskPath(state: WorkflowState): string {
  return artifactRelativePath(
    state,
    'artifacts/06-review/showcase-risks.jsonl',
  );
}

function productObservationPath(state: WorkflowState): string {
  return artifactRelativePath(
    state,
    'artifacts/06-review/showcase-product-observations.jsonl',
  );
}

function evaluationObservationPath(state: WorkflowState): string {
  return artifactRelativePath(
    state,
    'artifacts/06-review/showcase-evaluations.jsonl',
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

function auditCount(cwd: string, path: string): number {
  const absolute = join(cwd, path);
  if (!existsSync(absolute)) return 0;
  return readFileSync(absolute, 'utf8').split('\n').filter(Boolean).length;
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

function latestEvaluation(
  state: WorkflowState,
  quadrant: ShowcaseRiskQuadrant,
  activity: ShowcaseEvaluationActivity,
): ShowcaseEvaluationObservation | undefined {
  return state.showcase_evaluation_observations
    ?.filter(
      (observation) =>
        observation.quadrant === quadrant && observation.activity === activity,
    )
    .at(-1);
}

export function missingShowcaseEvaluations(state: WorkflowState): string[] {
  return (state.showcase_risk_decisions ?? []).flatMap((decision) =>
    decision.disposition === 'required'
      ? decision.activities
          .filter(
            (activity) => !latestEvaluation(state, decision.quadrant, activity),
          )
          .map((activity) => `${decision.quadrant}/${activity}`)
      : [],
  );
}

export function concerningShowcaseEvaluations(state: WorkflowState): string[] {
  return (state.showcase_risk_decisions ?? []).flatMap((decision) =>
    decision.disposition === 'required'
      ? decision.activities
          .filter(
            (activity) =>
              latestEvaluation(state, decision.quadrant, activity)?.outcome ===
              'concern',
          )
          .map((activity) => `${decision.quadrant}/${activity}`)
      : [],
  );
}

function showcaseItems(state: WorkflowState): CompletedWorkItem[] {
  return [requireCompletedWorkItem(state)];
}

function showcaseScenarios(state: WorkflowState) {
  return requireCompletedWorkItem(state).scenarios;
}

export function missingShowcaseProductObservations(
  state: WorkflowState,
): string[] {
  const observations = state.showcase_product_observations ?? [];
  return showcaseScenarios(state)
    .filter(
      (scenario) =>
        !observations.some(
          (observation) =>
            observation.story_id === scenario.story_id &&
            observation.scenario_id === scenario.scenario_id,
        ),
    )
    .map(({ story_id, scenario_id }) => `${story_id}/${scenario_id}`);
}

function hasProductObservation(state: WorkflowState): boolean {
  const observations = state.showcase_product_observations ?? [];
  return showcaseScenarios(state).every((scenario) =>
    observations.some(
      (observation) =>
        observation.story_id === scenario.story_id &&
        observation.scenario_id === scenario.scenario_id &&
        JSON.stringify(observation.given) === JSON.stringify(scenario.given) &&
        observation.when === scenario.when &&
        JSON.stringify(observation.observed_outcomes) ===
          JSON.stringify(scenario.then) &&
        JSON.stringify(observation.business_data) ===
          JSON.stringify(scenario.business_data),
    ),
  );
}

function approvedQ2Steps(cwd: string, state: WorkflowState) {
  return showcaseItems(state).flatMap((item) =>
    selectedTestProcesses(item.work_item).flatMap((process) => {
      const definition = readTestProcess(join(cwd, process.path));
      assertLockedMaterializedPlan(cwd, process, definition);
      const selected = process.selected_step_ids ?? [];
      return item.tasking.tests
        .filter(
          ({ quadrant, process_id }) =>
            quadrant === 'Q2' && process_id === process.id,
        )
        .map((test) => {
          const step = definition.steps.find(
            ({ id, quadrant }) =>
              id === test.step_id && selected.includes(id) && quadrant === 'Q2',
          );
          const command = process.focused_commands.find(
            ({ test_id }) => test_id === test.id,
          )?.command;
          if (!command || !step) {
            throw new Error(
              `Approved Showcase Q2 traceability drifted: ${item.story_id}/[${item.scenarios.map(({ scenario_id }) => scenario_id).join(',')}]/${process.id}/${test.step_id}/${test.id}.`,
            );
          }
          return {
            storyId: item.story_id,
            scenarioIds: item.scenarios.map(({ scenario_id }) => scenario_id),
            processId: process.id,
            stepId: step.id,
            testId: test.id,
            command,
            testIds: [test.id],
          };
        });
    }),
  );
}

function latestQ2Passed(cwd: string, state: WorkflowState): boolean {
  const expected = approvedQ2Steps(cwd, state);
  const observations = state.showcase_q2_observations ?? [];
  return (
    expected.length > 0 &&
    expected.every(({ storyId, scenarioIds, processId, stepId, testId }) => {
      const latest = observations
        .filter(
          ({ story_id, scenario_ids, process_id, step_id, test_ids }) =>
            story_id === storyId &&
            JSON.stringify(scenario_ids) === JSON.stringify(scenarioIds) &&
            process_id === processId &&
            step_id === stepId &&
            test_ids.includes(testId),
        )
        .at(-1);
      return latest?.exit_code === 0;
    })
  );
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
  const current = state.active_work_item;
  const records = steps.map((step, index) => {
    if (
      current?.story_id === step.storyId &&
      JSON.stringify(current.scenario_ids) === JSON.stringify(step.scenarioIds)
    ) {
      return executeTestStep(cwd, {
        processId: step.processId,
        stepId: step.stepId,
        testId: step.testId,
        stage: 'showcase',
        command: step.command,
        invocation: 'showcase-controller',
      });
    }
    const startedAt = new Date().toISOString();
    const result = spawnSync(step.command, {
      cwd,
      shell: true,
      encoding: 'utf8',
      timeout: approvedCommandTimeoutMs(state),
    });
    const stdout = result.stdout ?? '';
    const stderr = `${result.stderr ?? ''}${result.error?.message ?? ''}`;
    const stdoutDiagnostic = outputDiagnostic(stdout);
    const stderrDiagnostic = outputDiagnostic(stderr);
    return {
      version: 2 as const,
      process_id: step.processId,
      step_id: step.stepId,
      test_id: step.testId,
      stage: 'showcase' as const,
      command: step.command,
      sequence: index + 1,
      exit_code: result.status ?? (result.error ? 1 : 0),
      expected_failure: false,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      stdout_sha256: stdoutDiagnostic.sha256,
      stderr_sha256: stderrDiagnostic.sha256,
      stdout_summary: formatOutputDiagnostic(stdoutDiagnostic),
      stderr_summary: formatOutputDiagnostic(stderrDiagnostic),
      stdout_diagnostic: stdoutDiagnostic,
      stderr_diagnostic: stderrDiagnostic,
      git_head: execFileSync('git', ['rev-parse', '--verify', 'HEAD'], {
        cwd,
        encoding: 'utf8',
      }).trim(),
      worktree_sha256: digest('iteration-showcase'),
      invocation: 'showcase-controller' as const,
    } satisfies TestExecutionRecord;
  });
  const observations: ShowcaseQ2Observation[] = records.map((record, index) => {
    const step = steps[index];
    if (!step) throw new Error('Showcase Q2 observation lost its test intent.');
    return {
      story_id: step.storyId,
      scenario_ids: step.scenarioIds,
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
  let next = writeState(cwd, {
    ...state,
    showcase_q2_observations: [
      ...(state.showcase_q2_observations ?? []),
      ...observations,
    ],
  });
  const generated = generateExecutionEvidence(cwd);
  const completed = requireCompletedWorkItem(next);
  if (
    completed.story_id !== generated.manifest.story_id ||
    JSON.stringify(completed.work_item.scenario_ids) !==
      JSON.stringify(generated.manifest.scenario_ids)
  ) {
    throw new Error(
      'Showcase execution no longer matches the completed Story.',
    );
  }
  next = writeState(cwd, {
    ...next,
    completed_work_items: [
      {
        ...completed,
        execution_manifest_sha256: digest(generated.manifestContent),
      },
    ],
  });
  const result = observations
    .map(
      ({
        story_id,
        scenario_ids,
        process_id,
        step_id,
        test_ids,
        exit_code,
        stdout_summary,
        stderr_summary,
      }) =>
        `${story_id}/[${scenario_ids.join(',')}] · ${process_id}/${step_id} · ${test_ids.join(', ')} · exit=${exit_code}${stdout_summary || stderr_summary ? ` · ${stdout_summary || stderr_summary}` : ''}`,
    )
    .join('\n');
  return {
    state: next,
    records,
    output: `Iteration Showcase Q2 observed for ${showcaseItems(state).length} completed Story plan(s).

${showcaseScenarios(state)
  .map(
    (scenario) =>
      `${scenario.story_id}/${scenario.scenario_id}: Given ${scenario.given.join('；')} · When ${scenario.when} · Then ${scenario.then.join('；')}`,
  )
  .join('\n')}

${result}

${observations.every(({ exit_code }) => exit_code === 0) ? 'All selected Q2 observations passed. A human must now observe the actual product behavior and value.' : 'At least one selected Q2 observation failed. Accept is blocked; route the feedback with /evidence-showcase revise.'}`,
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
  const allowedActivities = showcaseActivitiesForQuadrant(quadrant);
  if (
    normalizedActivities.some(
      (activity) => !allowedActivities.includes(activity),
    )
  ) {
    throw new Error(
      `${quadrant} activities must use: ${allowedActivities.join(', ')}.`,
    );
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

export function recordShowcaseProductObservation(
  cwd: string,
  input: ShowcaseProductObservationInput,
  now = new Date().toISOString(),
): WorkflowState {
  const state = showcaseState(cwd);
  if (state.showcase_stage !== 'setup' || !latestQ2Passed(cwd, state)) {
    throw new Error(
      'A human product observation requires passed Showcase Q2 during setup.',
    );
  }
  const observed = new Set(
    (state.showcase_product_observations ?? []).map(
      ({ story_id, scenario_id }) => `${story_id}/${scenario_id}`,
    ),
  );
  const scenario = showcaseScenarios(state).find(
    ({ story_id, scenario_id }) => !observed.has(`${story_id}/${scenario_id}`),
  );
  if (!scenario) {
    throw new Error(
      'Every completed Scenario already has a product observation.',
    );
  }
  const path = productObservationPath(state);
  const observation: ShowcaseProductObservation = {
    version: 1,
    observation_id: `OBS-${String(auditCount(cwd, path) + 1).padStart(3, '0')}`,
    story_id: scenario.story_id,
    scenario_id: scenario.scenario_id,
    given: [...scenario.given],
    when: scenario.when,
    observed_outcomes: [...scenario.then],
    business_data: [...scenario.business_data],
    observation: nonEmpty(input.observation, 'Product observation'),
    value_feedback: nonEmpty(input.valueFeedback, 'Product value feedback'),
    evidence_refs: nonEmptyItems(input.evidenceRefs, 'Product evidence refs'),
    artifact_path: path,
    observed_by: 'human',
    observed_at: now,
  };
  if (observation.evidence_refs.length === 0) {
    throw new Error('Product observation requires at least one evidence ref.');
  }
  appendAudit(cwd, path, observation);
  return writeState(cwd, {
    ...state,
    showcase_product_observations: [
      ...(state.showcase_product_observations ?? []),
      observation,
    ],
  });
}

export function recordShowcaseEvaluation(
  cwd: string,
  input: ShowcaseEvaluationInput,
  now = new Date().toISOString(),
): WorkflowState {
  const state = showcaseState(cwd);
  if (state.showcase_stage !== 'setup' || !latestQ2Passed(cwd, state)) {
    throw new Error('A Showcase evaluation requires passed Q2 during setup.');
  }
  const risk = currentRisk(state, input.quadrant);
  if (
    !risk ||
    risk.disposition !== 'required' ||
    !risk.activities.includes(input.activity)
  ) {
    throw new Error(
      `${input.quadrant}/${input.activity} is not a required Showcase activity.`,
    );
  }
  if (!showcaseActivitiesForQuadrant(input.quadrant).includes(input.activity)) {
    throw new Error(
      `${input.activity} is not an activity for ${input.quadrant}.`,
    );
  }
  if (!['passed', 'concern'].includes(input.outcome)) {
    throw new Error('Showcase evaluation outcome must be passed or concern.');
  }
  const path = evaluationObservationPath(state);
  const observation: ShowcaseEvaluationObservation = {
    version: 1,
    evaluation_id: `EVAL-${String(auditCount(cwd, path) + 1).padStart(3, '0')}`,
    quadrant: input.quadrant,
    activity: input.activity,
    outcome: input.outcome,
    finding: nonEmpty(input.finding, 'Showcase evaluation finding'),
    evidence_refs: nonEmptyItems(
      input.evidenceRefs,
      'Showcase evaluation evidence refs',
    ),
    artifact_path: path,
    observed_by: 'human',
    observed_at: now,
  };
  if (observation.evidence_refs.length === 0) {
    throw new Error('Showcase evaluation requires at least one evidence ref.');
  }
  appendAudit(cwd, path, observation);
  return writeState(cwd, {
    ...state,
    showcase_evaluation_observations: [
      ...(state.showcase_evaluation_observations ?? []),
      observation,
    ],
  });
}

function validateSharedTraceability(cwd: string, state: ShowcaseState) {
  for (const item of showcaseItems(state)) {
    const absolute = join(cwd, item.execution_manifest_path);
    if (
      !existsSync(absolute) ||
      digest(readFileSync(absolute)) !== item.execution_manifest_sha256
    ) {
      throw new Error(
        `Completed Story manifest is missing or changed: ${item.story_id}.`,
      );
    }
  }
  const workItem = state.active_work_item;
  const scenarios = state.confirmed_scenarios ?? [];
  const pair = state.pair_session;
  if (
    !workItem ||
    scenarios.length === 0 ||
    !pair ||
    scenarios.some(({ story_id }) => story_id !== workItem.story_id) ||
    JSON.stringify(scenarios.map(({ scenario_id }) => scenario_id)) !==
      JSON.stringify(workItem.scenario_ids) ||
    pair.story_id !== workItem.story_id ||
    JSON.stringify(pair.scenario_ids) !==
      JSON.stringify(workItem.scenario_ids) ||
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
        JSON.stringify(state.model_change_proposal.scenario_ids) !==
          JSON.stringify(workItem.scenario_ids) ||
        state.model_change_proposal.git_baseline !== workItem.git_baseline))
  ) {
    throw new Error(
      'Model candidate, tests, and production implementation do not share the Scenario Git baseline.',
    );
  }
  const manifest = validateExecutionEvidence(cwd, workItem);
  if (
    manifest.story_id !== workItem.story_id ||
    JSON.stringify(manifest.scenario_ids) !==
      JSON.stringify(workItem.scenario_ids) ||
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
  if (!hasProductObservation(state)) {
    throw new Error(
      'Showcase requires a human observation of the actual product behavior and value.',
    );
  }
  const missingEvaluations = missingShowcaseEvaluations(state);
  if (missingEvaluations.length > 0) {
    throw new Error(
      `Showcase requires execution evidence for ${missingEvaluations.join(', ')}.`,
    );
  }
  const concerns = concerningShowcaseEvaluations(state);
  if (concerns.length > 0) {
    throw new Error(
      `Showcase has unresolved evaluation concerns: ${concerns.join(', ')}. Route feedback before acceptance.`,
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
  const base = `artifacts/06-review/${workItem.story_id}/review-${String(round).padStart(3, '0')}`;
  const artifactPathValue = artifactRelativePath(state, `${base}.json`);
  const summaryPathValue = artifactRelativePath(state, `${base}.md`);
  const productObservationIds = (state.showcase_product_observations ?? []).map(
    ({ observation_id }) => observation_id,
  );
  const evaluationIds = (state.showcase_evaluation_observations ?? []).map(
    ({ evaluation_id }) => evaluation_id,
  );
  const document = {
    version: 2 as const,
    story_id: workItem.story_id,
    scenario_ids: workItem.scenario_ids,
    git_baseline: workItem.git_baseline,
    execution_manifest_path: evidence.manifest,
    execution_manifest_sha256: digest(manifestContent),
    product_observation_ids: productObservationIds,
    evaluation_ids: evaluationIds,
    observed_facts: observedFacts,
    product_domain_feedback: productDomainFeedback,
    technical_quality_feedback: technicalQualityFeedback,
    unresolved_assumptions: unresolvedAssumptions,
    recommendation: input.recommendation,
    reviewed_by: 'showcase-reviewer' as const,
    reviewed_at: now,
  };
  const content = `${JSON.stringify(document, null, 2)}\n`;
  const summary = `# Showcase Review — ${workItem.story_id} / [${workItem.scenario_ids.join(', ')}]

## Human product observations
${(state.showcase_product_observations ?? []).map(({ observation_id, given, when, observed_outcomes, business_data, observation, value_feedback }) => `- ${observation_id}: Given ${given.join('；')} · When ${when} · Then ${observed_outcomes.join('；')} · data=${business_data.join('；')} · observed=${observation} · value=${value_feedback}`).join('\n')}

## Q3/Q4 evaluations
${(state.showcase_evaluation_observations ?? []).map(({ evaluation_id, quadrant, activity, outcome, finding }) => `- ${evaluation_id}: ${quadrant}/${activity}=${outcome} · ${finding}`).join('\n') || '- none required'}

## Reviewer-observed facts
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
    showcase_product_observations: undefined,
    showcase_evaluation_observations: undefined,
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
  const reopened = { ...cleared, completed_work_items: undefined };
  if (destination === 'pair') {
    const session = state.pair_session;
    if (!session) throw new Error('Showcase cannot route to a missing Pair.');
    const currentKey = `${session.process_id}/${session.step_id}`;
    return {
      ...reopened,
      pair_session: {
        ...session,
        checkpoint:
          target === 'test'
            ? 'plan_confirmed'
            : target === 'refactor'
              ? 'green_observed'
              : 'red_observed',
        completed_task_ids: session.completed_task_ids.filter(
          (id) => id !== session.task_id,
        ),
        completed_test_ids: session.completed_test_ids.filter(
          (id) => id !== session.test_id,
        ),
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
      ...reopened,
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
      ...reopened,
      understand_stage: modeling ? 'modeling' : 'tqa',
      ...(modeling
        ? {
            modeling_stage: 'profile' as const,
            modeling_profile_proposal: undefined,
            modeling_profile: undefined,
          }
        : {
            confirmed_scenarios: undefined,
            scenario_drafts: undefined,
            active_clarification_story: {
              story_id:
                state.confirmed_scenarios?.[0]?.story_id ??
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
    ...reopened,
    kickoff_candidate: undefined,
    understand_stage: undefined,
    scenario_drafts: undefined,
    confirmed_scenarios: undefined,
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
        loop: 'showcase',
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
  if (!state.showcase_stage) return;
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
  const productObservations = state.showcase_product_observations ?? [];
  if (productObservations.length > 0) {
    const audit = readFileSync(
      join(cwd, productObservationPath(state)),
      'utf8',
    );
    if (
      productObservations.some(
        (observation) => !audit.includes(JSON.stringify(observation)),
      )
    ) {
      throw new Error(
        'Showcase product-observation audit is missing or stale.',
      );
    }
  }
  const evaluations = state.showcase_evaluation_observations ?? [];
  if (evaluations.length > 0) {
    const audit = readFileSync(
      join(cwd, evaluationObservationPath(state)),
      'utf8',
    );
    if (
      evaluations.some(
        (observation) => !audit.includes(JSON.stringify(observation)),
      )
    ) {
      throw new Error('Showcase evaluation audit is missing or stale.');
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
    const productIds = productObservations.map(
      ({ observation_id }) => observation_id,
    );
    const evaluationIds = evaluations.map(({ evaluation_id }) => evaluation_id);
    if (
      !latestReview ||
      !currentManifestPath ||
      digest(readFileSync(join(cwd, currentManifestPath))) !==
        latestReview.execution_manifest_sha256 ||
      JSON.stringify(latestReview.product_observation_ids) !==
        JSON.stringify(productIds) ||
      JSON.stringify(latestReview.evaluation_ids) !==
        JSON.stringify(evaluationIds)
    ) {
      throw new Error(
        'The latest Showcase review references stale execution or human-observation evidence.',
      );
    }
    const q2Passed =
      manifest.showcase.status === 'passed' && latestQ2Passed(cwd, state);
    if (
      !q2Passed ||
      missingShowcaseRisks(state).length > 0 ||
      !hasProductObservation(state) ||
      missingShowcaseEvaluations(state).length > 0 ||
      concerningShowcaseEvaluations(state).length > 0 ||
      !state.showcase_reviews?.length
    ) {
      throw new Error(
        'Completed Showcase evidence requires passed Q2, human product observation, executed Q3/Q4 decisions, and an independent review.',
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

export function showcaseRequiresHumanAction(cwd: string): boolean {
  const state = showcaseState(cwd);
  if (!latestQ2Passed(cwd, state)) {
    return (state.showcase_q2_observations ?? []).some(
      ({ exit_code }) => exit_code !== 0,
    );
  }
  return (
    !hasProductObservation(state) ||
    missingShowcaseRisks(state).length > 0 ||
    missingShowcaseEvaluations(state).length > 0 ||
    concerningShowcaseEvaluations(state).length > 0 ||
    state.showcase_stage === 'decision'
  );
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
  if (!hasProductObservation(state)) {
    return '/evidence-showcase observe <evidence-ref> <observation> :: <value-feedback>';
  }
  const missing = missingShowcaseRisks(state);
  if (missing.length > 0) {
    return `/evidence-showcase risk ${missing[0]?.toLowerCase()} <not-required|required> [activities] <reason>`;
  }
  const missingEvaluations = missingShowcaseEvaluations(state);
  if (missingEvaluations.length > 0) {
    return `/evidence-showcase evaluate ${missingEvaluations[0]} <passed|concern> <evidence-ref> <finding>`;
  }
  const concerns = concerningShowcaseEvaluations(state);
  if (concerns.length > 0) {
    return `/evidence-showcase evaluate ${concerns[0]} <passed|concern> <evidence-ref> <finding> or revise <target> <reason> — unresolved: ${concerns.join(', ')}`;
  }
  if (state.showcase_stage === 'decision') {
    return '/evidence-showcase accept|revise|reject <reason>';
  }
  return '/evidence-run starts the independent read-only Showcase Reviewer';
}
