import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { artifactRelativePath } from '../../../iteration/artifact-layout';
import { transitionLoopState } from '../../../iteration/transition-graph';
import { readState, writeState } from '../../../iteration/state-repository';
import type {
  ModelDecisionAction,
  ModelDecisionRecord,
  WorkflowState,
} from '../../../iteration/state';
import { projectCandidateModel } from './projection';

const ACTIONS = new Set<ModelDecisionAction>([
  'confirm',
  'revise',
  'scenario_gap',
  'method_gap',
]);

function digest(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function required(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} must not be empty.`);
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

function persistDecision(
  cwd: string,
  state: WorkflowState,
  action: ModelDecisionAction,
  reason: string,
  now: string,
): ModelDecisionRecord {
  const challenge = state.model_challenges?.at(-1);
  const projection = state.model_projection;
  if (!challenge || challenge.outcome !== 'pass' || !projection) {
    throw new Error('Model confirmation requires one passing challenge.');
  }
  const projected = projectCandidateModel(cwd, state);
  if (
    projected.model_sha256 !== projection.model_sha256 ||
    challenge.projection_sha256 !== projection.model_sha256
  ) {
    throw new Error('The challenged model projection drifted before review.');
  }
  const challengePath = join(cwd, challenge.artifact_path);
  if (!existsSync(challengePath)) {
    throw new Error(
      `Model challenge artifact is missing: ${challenge.artifact_path}.`,
    );
  }
  const expansionPath = state.model_expansion_path;
  if (!expansionPath || !existsSync(join(cwd, expansionPath))) {
    throw new Error(
      `Model expansion artifact is missing: ${expansionPath ?? 'unset'}.`,
    );
  }
  const proposalPath = state.model_change_proposal?.artifact_path;
  if (proposalPath && !existsSync(join(cwd, proposalPath))) {
    throw new Error(`Model proposal artifact is missing: ${proposalPath}.`);
  }
  const sequence = (state.model_decisions?.length ?? 0) + 1;
  const artifactPath = artifactRelativePath(
    state,
    `artifacts/02-domain-model/model-decisions/MODEL-${String(sequence).padStart(3, '0')}.json`,
  );
  const record: ModelDecisionRecord = {
    version: 1,
    action,
    reason,
    challenge_artifact_path: challenge.artifact_path,
    challenge_artifact_sha256: digest(readFileSync(challengePath)),
    projection_sha256: projection.model_sha256,
    model_expansion_sha256: digest(readFileSync(join(cwd, expansionPath))),
    ...(proposalPath
      ? {
          model_change_proposal_sha256: digest(
            readFileSync(join(cwd, proposalPath)),
          ),
        }
      : {}),
    artifact_path: artifactPath,
    decided_by: 'human',
    decided_at: now,
  };
  const absolute = join(cwd, artifactPath);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, `${JSON.stringify(record, null, 2)}\n`, {
    flag: 'wx',
  });
  return record;
}

/** Confirm or route feedback from the human model/ubiquitous-language review. */
export function decideModel(
  cwd: string,
  action: ModelDecisionAction,
  reason: string,
  now = new Date().toISOString(),
): WorkflowState {
  const state = readState(cwd);
  if (
    state.loop !== 'understand' ||
    state.understand_stage !== 'modeling' ||
    state.modeling_stage !== 'model_review'
  ) {
    throw new Error('A challenged model must await human model review.');
  }
  if (!ACTIONS.has(action)) {
    throw new Error(`Unsupported model decision: ${action}.`);
  }
  const normalizedReason = required(reason, 'Model decision reason');
  const decision = persistDecision(cwd, state, action, normalizedReason, now);
  const decisions = [...(state.model_decisions ?? []), decision];

  if (action === 'confirm') {
    const transitioned = transitionLoopState(state, { to: 'tasking' }, now);
    return writeState(cwd, {
      ...transitioned,
      modeling_stage: 'model_confirmed',
      model_decisions: decisions,
    });
  }

  const target =
    action === 'scenario_gap'
      ? 'scenario'
      : action === 'method_gap'
        ? 'modeling_method'
        : 'model';
  const routed = transitionLoopState(
    state,
    {
      to: 'understand',
      feedback: {
        target,
        reason: normalizedReason,
        decided_by: 'human',
      },
    },
    now,
  );

  if (action === 'scenario_gap') {
    const storyId = state.confirmed_scenario?.story_id;
    if (!storyId) throw new Error('Scenario feedback requires a Story id.');
    return writeState(cwd, {
      ...routed,
      understand_stage: 'tqa',
      active_clarification_story: { story_id: storyId, selected_at: now },
      scenario_drafts: undefined,
      confirmed_scenario: undefined,
      modeling_stage: undefined,
      modeling_profile: undefined,
      modeling_profile_proposal: undefined,
      ...clearCandidateEvidence(),
      model_decisions: decisions,
    });
  }

  if (action === 'method_gap') {
    return writeState(cwd, {
      ...routed,
      understand_stage: 'modeling',
      modeling_stage: 'profile',
      modeling_profile: undefined,
      modeling_profile_proposal: undefined,
      ...clearCandidateEvidence(),
      model_decisions: decisions,
    });
  }

  const canReviseCandidate =
    state.modeling_profile?.model_change_required === true &&
    Boolean(state.model_change_proposal);
  return writeState(cwd, {
    ...routed,
    understand_stage: 'modeling',
    modeling_stage: canReviseCandidate ? 'expansion' : 'profile',
    ...(canReviseCandidate
      ? {}
      : {
          modeling_profile: undefined,
          modeling_profile_proposal: undefined,
        }),
    ...clearCandidateEvidence(),
    model_decisions: decisions,
  });
}
