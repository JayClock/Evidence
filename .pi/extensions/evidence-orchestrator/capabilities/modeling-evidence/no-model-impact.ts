import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { artifactRelativePath } from '../../iteration/artifact-layout';
import { writeState } from '../../iteration/state-repository';
import { transitionLoopState } from '../../iteration/transition-graph';
import type { WorkflowState } from '../../iteration/state';

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

function noModelImpactEvidence(state: WorkflowState, baseline: string) {
  const profile = state.modeling_profile;
  if (profile?.method !== 'none' || profile.model_change_required !== false) {
    throw new Error(
      'Only method=none with model_change_required=false has no-model-impact evidence.',
    );
  }
  const scenarios = state.confirmed_scenarios ?? [];
  const first = scenarios[0];
  if (!first || new Set(scenarios.map(({ story_id }) => story_id)).size !== 1) {
    throw new Error(
      'No-model impact completion requires one Story Scenario Set.',
    );
  }
  const artifactPath = artifactRelativePath(
    state,
    `artifacts/02-domain-model/modeling-decisions/${first.story_id}-no-model.json`,
  );
  return {
    artifactPath,
    artifact: {
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
    },
  };
}

/** Verify the deterministic human no-model-impact decision has not drifted. */
export function verifyNoModelImpactEvidence(
  cwd: string,
  state: WorkflowState,
): string {
  const baseline = state.model_git_baseline;
  if (
    !baseline ||
    state.model_change_proposal ||
    state.model_change_application ||
    state.model_projection
  ) {
    throw new Error('The no-model-impact decision state is invalid.');
  }
  const expected = noModelImpactEvidence(state, baseline);
  if (
    state.model_expansion_path !== expected.artifactPath ||
    !existsSync(`${cwd}/${expected.artifactPath}`)
  ) {
    throw new Error('The no-model-impact decision is missing.');
  }
  let actual: unknown;
  try {
    actual = JSON.parse(
      readFileSync(`${cwd}/${expected.artifactPath}`, 'utf8'),
    ) as unknown;
  } catch {
    throw new Error('The no-model-impact decision is invalid JSON.');
  }
  if (JSON.stringify(actual) !== JSON.stringify(expected.artifact)) {
    throw new Error('The no-model-impact decision drifted.');
  }
  return expected.artifactPath;
}

/** Complete a human-confirmed method=none Profile without invoking model agents. */
export function completeNoModelImpact(
  cwd: string,
  state: WorkflowState,
  now = new Date().toISOString(),
): WorkflowState {
  if (
    state.loop !== 'understand' ||
    state.understand_stage !== 'modeling' ||
    state.modeling_stage !== 'expansion' ||
    !state.modeling_profile
  ) {
    throw new Error(
      'No-model impact completion requires a human-confirmed Profile at expansion.',
    );
  }
  const baseline = gitBaseline(cwd);
  const evidence = noModelImpactEvidence(state, baseline);
  const absolute = `${cwd}/${evidence.artifactPath}`;
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, `${JSON.stringify(evidence.artifact, null, 2)}\n`);

  const transitioned = transitionLoopState(state, { to: 'tasking' }, now);
  return writeState(cwd, {
    ...transitioned,
    modeling_stage: 'model_confirmed',
    model_expansion_path: evidence.artifactPath,
    model_git_baseline: baseline,
    model_change_proposal: undefined,
    model_change_application: undefined,
    model_projection: undefined,
  });
}
