import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { artifactRelativePath } from '../../../iteration/artifact-layout';
import { writeState } from '../../../iteration/state-repository';
import { transitionLoopState } from '../../../iteration/transition-graph';
import type { WorkflowState } from '../../../iteration/state';

function gitBaseline(cwd: string): string {
  try {
    return execFileSync('git', ['rev-parse', '--verify', 'HEAD'], {
      cwd,
      encoding: 'utf8',
    }).trim();
  } catch {
    throw new Error(
      'A no-model-impact decision requires a Git repository with an initial commit.',
    );
  }
}

/** Complete a human-confirmed method=none Profile without invoking model agents. */
export function completeNoModelImpact(
  cwd: string,
  state: WorkflowState,
  now = new Date().toISOString(),
): WorkflowState {
  const profile = state.modeling_profile;
  if (
    state.loop !== 'understand' ||
    state.understand_stage !== 'modeling' ||
    state.modeling_stage !== 'expansion' ||
    !profile
  ) {
    throw new Error(
      'No-model impact completion requires a human-confirmed Profile at expansion.',
    );
  }
  if (profile.method !== 'none' || profile.model_change_required !== false) {
    throw new Error(
      'Only method=none with model_change_required=false may bypass model expansion.',
    );
  }
  const scenarios = state.confirmed_scenarios ?? [];
  const first = scenarios[0];
  if (!first || new Set(scenarios.map(({ story_id }) => story_id)).size !== 1) {
    throw new Error(
      'No-model impact completion requires one Story Scenario Set.',
    );
  }

  const baseline = gitBaseline(cwd);
  const artifactPath = artifactRelativePath(
    state,
    `artifacts/02-domain-model/modeling-decisions/${first.story_id}-no-model.json`,
  );
  const artifact = {
    version: 1,
    disposition: 'no_model_required',
    work_item: {
      story_id: first.story_id,
      scenario_ids: scenarios.map(({ scenario_id }) => scenario_id),
    },
    source_scenarios: scenarios.map(({ artifact_path }) => artifact_path),
    modeling_profile: profile,
    model_refs: { entities: [], associations: [] },
    scenarios: scenarios.map(({ scenario_id, artifact_path }) => ({
      scenario_id,
      source_scenario: artifact_path,
      model_refs: { entities: [], associations: [] },
    })),
    analysis_reason:
      profile.reason ??
      profile.proposal?.reason ??
      'The human-confirmed Profile requires no canonical model semantics.',
    git_baseline: baseline,
    decided_by: 'human',
    decided_at: profile.confirmed_at,
  };
  const absolute = `${cwd}/${artifactPath}`;
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, `${JSON.stringify(artifact, null, 2)}\n`);

  const transitioned = transitionLoopState(state, { to: 'tasking' }, now);
  return writeState(cwd, {
    ...transitioned,
    modeling_stage: 'model_confirmed',
    model_expansion_path: artifactPath,
    model_git_baseline: baseline,
    model_change_proposal: undefined,
    model_change_application: undefined,
    model_projection: undefined,
  });
}
