import {
  collectArtifacts,
  collectCodeFiles,
} from '../../iteration/artifact-inventory';
import {
  pairDriverMode,
  pairNextInstruction,
} from '../../loops/pair/pair-session';
import { showcaseNextInstruction } from '../../loops/showcase/showcase-session';
import { executionEvidencePaths } from '../../capabilities/execution-evidence/manifest';
import { iterationRoot } from '../../iteration/artifact-layout';
import { allowedLoopActions } from '../../iteration/transition-graph';
import { readPersistedState } from '../../iteration/state-repository';
import type { WorkflowState } from '../../iteration/state';
import { loadActivityAgent } from '../node/activity-agent-process';

function agentName(state: WorkflowState): string | undefined {
  if (state.loop === 'kickoff') return 'requirements-analyst';
  if (state.loop === 'understand') {
    if (state.understand_stage === 'tqa') return 'requirements-analyst';
    return state.modeling_stage === 'candidate_ready'
      ? 'model-challenger'
      : 'domain-modeler';
  }
  if (state.loop === 'tasking') return 'architect';
  if (state.loop === 'pair') {
    const mode = pairDriverMode(state);
    return mode === 'test'
      ? 'test-driver'
      : mode
        ? 'production-driver'
        : undefined;
  }
  if (state.loop === 'showcase') return 'showcase-reviewer';
  if (state.loop === 'respond') return 'respond-learner';
  return undefined;
}

function nextActions(cwd: string, state: WorkflowState): string {
  if (state.halted) return 'none — iteration halted';
  if (state.loop === 'pair') return pairNextInstruction(state);
  if (state.loop === 'showcase') return showcaseNextInstruction(cwd);
  if (state.loop === 'respond' && state.respond_stage === 'decision') {
    return 'human:/evidence-respond approve|revise <reason>';
  }
  if (state.loop === 'tasking' && state.tasking_stage === 'desk_check') {
    return 'human:/evidence-desk-check';
  }
  return allowedLoopActions(state.loop).join(', ') || 'none';
}

function list(title: string, values: string[]): string[] {
  return [
    `## ${title} (${values.length})`,
    values.length ? values.map((value) => `- ${value}`).join('\n') : '- none',
  ];
}

export function statusMarkdown(cwd: string): string {
  const state = readPersistedState(cwd);
  const codeFiles = collectCodeFiles(cwd);
  if (!state) {
    return [
      '# Evidence Orchestrator Status',
      '',
      '| Field | Value |',
      '|:---|:---|',
      '| Iteration | none |',
      '| Loop | idle |',
      '| Allowed Actions | /evidence-new |',
      '',
      'No active iteration state is persisted. Start one from an explicit GitHub Issue.',
      '',
      ...list('Code Files', codeFiles),
    ].join('\n');
  }
  const root = iterationRoot(cwd, state);
  const artifacts = collectArtifacts(cwd, root);
  const requestedAgent = agentName(state);
  let agent = 'deterministic controller / human Navigator';
  if (requestedAgent) {
    try {
      const loaded = loadActivityAgent(cwd, requestedAgent);
      agent = `${loaded.name} · ${loaded.model} (thinking=${loaded.thinking})`;
    } catch {
      agent = `missing: ${requestedAgent}`;
    }
  }
  const execution = executionEvidencePaths(cwd);
  const reviews = state.showcase_reviews?.at(-1);
  const decision = state.showcase_decisions?.at(-1);
  return [
    '# Evidence Orchestrator Status',
    '',
    '| Field | Value |',
    '|:---|:---|',
    `| Iteration | ${state.iteration_id} |`,
    `| Loop | ${state.loop} |`,
    `| Allowed Actions | ${nextActions(cwd, state)} |`,
    `| Requirement Source | ${state.requirement_source ? `${state.requirement_source.repository}#${state.requirement_source.issue_number}` : 'missing'} |`,
    `| Kickoff Candidate | ${state.kickoff_candidate?.artifact_path ?? 'none'} |`,
    `| Story | ${state.active_clarification_story?.story_id ?? state.confirmed_scenario?.story_id ?? 'none'} |`,
    `| Understand Stage | ${state.understand_stage ?? 'none'} |`,
    `| Pending TQA | ${state.pending_clarification ? `${state.pending_clarification.question_id} · ${state.pending_clarification.question}` : 'none'} |`,
    `| Confirmed Scenario | ${state.confirmed_scenario ? `${state.confirmed_scenario.story_id} / ${state.confirmed_scenario.scenario_id}` : 'none'} |`,
    `| Modeling Stage | ${state.modeling_stage ?? 'none'} |`,
    `| Modeling Profile | ${state.modeling_profile ? `${state.modeling_profile.subject}/${state.modeling_profile.method}` : 'none'} |`,
    `| Model Expansion | ${state.model_expansion_path ?? 'none'} |`,
    `| Tasking Stage | ${state.tasking_stage ?? 'none'} |`,
    `| Tasking Draft | ${state.tasking_candidate?.draft_id ?? 'none'} |`,
    `| Approved Test Plan | ${state.approved_test_plan_path ?? 'none'} |`,
    `| Pair Checkpoint | ${state.pair_session?.checkpoint ?? 'none'} |`,
    `| Pair Step | ${state.pair_session ? `${state.pair_session.process_id}/${state.pair_session.step_id}` : 'none'} |`,
    `| Execution Log | ${execution.log ?? 'none'} |`,
    `| Execution Manifest | ${execution.manifest ?? 'none'} |`,
    `| Execution Summary | ${execution.summary ?? 'none'} |`,
    `| Showcase Stage | ${state.showcase_stage ?? 'none'} |`,
    `| Showcase Review | ${reviews ? `${reviews.recommendation} · ${reviews.artifact_path}` : 'none'} |`,
    `| Showcase Decision | ${decision?.action ?? 'none'} |`,
    `| Respond Stage | ${state.respond_stage ?? 'none'} |`,
    `| Knowledge Promotion | ${state.knowledge_promotion_path ?? 'none'} |`,
    `| Next Probe | ${state.next_probe?.question ?? state.respond_candidate?.next_probe.question ?? 'none'} |`,
    `| Activity Agent | ${agent} |`,
    `| Halted | ${state.halted?.reason ?? 'no'} |`,
    `| Last Run | ${state.pi?.last_run_at ?? 'never'} |`,
    '',
    ...list('Artifacts', artifacts),
    '',
    ...list('Code Files', codeFiles),
  ].join('\n');
}
