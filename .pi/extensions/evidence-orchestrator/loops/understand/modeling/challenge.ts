import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { artifactRelativePath } from '../../../iteration/artifact-layout';
import { transitionLoopState } from '../../../iteration/transition-graph';
import { readState, writeState } from '../../../iteration/state-repository';
import type {
  FeedbackTarget,
  ModelChallengeOutcome,
  ModelChallengeRecord,
  WorkflowState,
} from '../../../iteration/state';
import {
  prepareModelProjection,
  projectCandidateModel,
  validateModelRegressions,
} from './projection';

export interface ModelChallengeInput {
  outcome: ModelChallengeOutcome;
  summary: string;
}

const OUTCOMES = new Set<ModelChallengeOutcome>([
  'pass',
  'scenario_gap',
  'model_gap',
  'method_gap',
]);

function requiredSummary(value: string): string {
  const normalized = value.trim();
  if (!normalized)
    throw new Error('Model challenge summary must not be empty.');
  return normalized;
}

function clearCandidateEvidence(): Partial<WorkflowState> {
  return {
    model_expansion_path: undefined,
    model_git_baseline: undefined,
    model_change_proposal: undefined,
    model_change_application: undefined,
    model_projection: undefined,
  };
}

function routeFeedback(
  state: WorkflowState,
  record: ModelChallengeRecord,
  now: string,
): WorkflowState {
  const feedbackTarget: FeedbackTarget =
    record.outcome === 'scenario_gap'
      ? 'scenario'
      : record.outcome === 'method_gap'
        ? 'modeling_method'
        : 'model';
  const routed = transitionLoopState(
    state,
    {
      to: 'understand',
      feedback: {
        target: feedbackTarget,
        reason: record.summary,
        decided_by: 'system',
      },
    },
    now,
  );
  const history = [...(state.model_challenges ?? []), record];
  if (record.outcome === 'scenario_gap') {
    return { ...routed, model_challenges: history };
  }
  const requiresChange = state.modeling_profile?.model_change_required === true;
  return {
    ...routed,
    understand_stage: 'modeling',
    modeling_stage:
      record.outcome === 'model_gap' && requiresChange
        ? 'expansion'
        : 'profile',
    ...(record.outcome === 'model_gap' && requiresChange
      ? {}
      : {
          modeling_profile: undefined,
          modeling_profile_proposal: undefined,
        }),
    ...clearCandidateEvidence(),
    model_challenges: history,
  };
}

/** Persist one read-only challenge result and route feedback to its source. */
export function recordModelChallenge(
  cwd: string,
  input: ModelChallengeInput,
  now = new Date().toISOString(),
): WorkflowState {
  let state = readState(cwd);
  if (
    state.loop !== 'understand' ||
    state.modeling_stage !== 'candidate_ready'
  ) {
    throw new Error('A candidate-ready model is required for challenge.');
  }
  if (!OUTCOMES.has(input.outcome)) {
    throw new Error(`Unsupported model challenge outcome: ${input.outcome}.`);
  }
  state = prepareModelProjection(cwd, now);
  const projection = projectCandidateModel(cwd, state);
  let regressionError: string | undefined;
  try {
    validateModelRegressions(projection);
  } catch (error) {
    regressionError = error instanceof Error ? error.message : String(error);
  }
  const methodError = projection.method_failures.length
    ? `Method-specific validation failed: ${projection.method_failures.join(' ')}`
    : undefined;
  const deterministicError = methodError ?? regressionError;
  const outcome: ModelChallengeOutcome = methodError
    ? 'method_gap'
    : regressionError
      ? 'model_gap'
      : input.outcome;
  const sequence = (state.model_challenges?.length ?? 0) + 1;
  const artifactPath = artifactRelativePath(
    state,
    `artifacts/02-domain-model/model-challenges/CHALLENGE-${String(sequence).padStart(3, '0')}.json`,
  );
  const record: ModelChallengeRecord = {
    version: 1,
    requested_outcome: input.outcome,
    outcome,
    summary: deterministicError
      ? `${requiredSummary(input.summary)} Deterministic check: ${deterministicError}`
      : requiredSummary(input.summary),
    checked_regression_ids: projection.regressions.map(({ id }) => id),
    projection_sha256: projection.model_sha256,
    artifact_path: artifactPath,
    challenged_by: 'model-challenger',
    challenged_at: now,
  };
  const absolute = `${cwd}/${artifactPath}`;
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, `${JSON.stringify(record, null, 2)}\n`);

  if (outcome === 'pass') {
    return writeState(cwd, {
      ...state,
      modeling_stage: 'model_review',
      model_challenges: [...(state.model_challenges ?? []), record],
    });
  }

  const routed = routeFeedback(state, record, now);
  if (outcome === 'scenario_gap') {
    const storyId = state.confirmed_scenarios?.[0]?.story_id;
    if (!storyId) throw new Error('Scenario Set routing requires a Story id.');
    return writeState(cwd, {
      ...routed,
      understand_stage: 'tqa',
      active_clarification_story: {
        story_id: storyId,
        selected_at: now,
      },
      scenario_drafts: undefined,
      confirmed_scenarios: undefined,
      modeling_stage: undefined,
      modeling_profile: undefined,
      modeling_profile_proposal: undefined,
      ...clearCandidateEvidence(),
      model_challenges: [...(state.model_challenges ?? []), record],
    });
  }
  return writeState(cwd, routed);
}
