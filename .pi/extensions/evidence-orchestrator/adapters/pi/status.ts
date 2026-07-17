import {
  collectArtifacts,
  collectCodeFiles,
} from '../../iteration/artifact-inventory';
import {
  iterationActivitySummary,
  type ActivityAggregate,
} from '../../capabilities/activity-observability/summary';
import { activityTraceRelativePath } from '../../capabilities/activity-observability/trace';
import { readHtmlChangeExplanationRecord } from '../../loops/pair/change-explanation';
import {
  pairDriverMode,
  pairNextInstruction,
} from '../../loops/pair/pair-session';
import { showcaseNextInstruction } from '../../loops/showcase/showcase-session';
import { executionEvidencePaths } from '../../capabilities/execution-evidence/manifest';
import { iterationRoot } from '../../iteration/artifact-layout';
import { allowedLoopActions } from '../../iteration/transition-graph';
import { readPersistedState } from '../../iteration/state-repository';
import { completedWorkItem, type WorkflowState } from '../../iteration/state';
import { loadActivityAgent } from '../node/activity-agent-process';
import { nextStepGuidance } from './next-step';

function agentName(state: WorkflowState): string | undefined {
  if (state.loop === 'kickoff') return 'requirements-analyst';
  if (state.loop === 'understand') {
    if (state.understand_stage === 'tqa') return 'requirements-analyst';
    if (
      state.modeling_stage === 'model_review' ||
      (state.modeling_stage === 'expansion' &&
        state.modeling_profile?.method === 'none')
    ) {
      return undefined;
    }
    return state.modeling_stage === 'candidate_ready'
      ? 'model-challenger'
      : 'domain-modeler';
  }
  if (state.loop === 'tasking') return 'architect';
  if (state.loop === 'pair') {
    if (
      state.pair_session?.checkpoint === 'red_observed' &&
      state.pair_session.red_observation?.accepted !== true
    ) {
      return 'red-reviewer';
    }
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
  if (state.loop === 'understand' && state.modeling_stage === 'model_review') {
    return 'human:/evidence-model confirm [reason] | revise|scenario-gap|method-gap <reason>';
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

function compactNumber(value: number): string {
  if (value < 1_000) return String(value);
  if (value < 10_000) return `${(value / 1_000).toFixed(1)}k`;
  if (value < 1_000_000) return `${Math.round(value / 1_000)}k`;
  return `${(value / 1_000_000).toFixed(1)}M`;
}

function activityAggregateLine(aggregate: ActivityAggregate): string {
  const reportedActivities =
    aggregate.activities_finished - aggregate.unreported_cost_activities;
  const cost = reportedActivities
    ? `$${aggregate.reported_cost_usd.toFixed(4)} reported`
    : 'cost:n/a';
  const unreported = aggregate.unreported_cost_activities
    ? ` · cost:n/a=${aggregate.unreported_cost_activities}`
    : '';
  return `${aggregate.activities_finished}/${aggregate.activities_started} finished · ${aggregate.turns} turns · ↑${compactNumber(aggregate.input_tokens)} ↓${compactNumber(aggregate.output_tokens)} R${compactNumber(aggregate.cache_read_tokens)} W${compactNumber(aggregate.cache_write_tokens)} · ${cost}${unreported} · ${(aggregate.duration_ms / 1_000).toFixed(1)}s`;
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
      '## 下一步',
      '',
      nextStepGuidance(cwd, undefined),
      '',
      'No active iteration state is persisted. Collect Inbox sources, extract candidates, and select one with /evidence-new.',
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
  const activity = iterationActivitySummary(cwd, state.iteration_id);
  const activityAgents = Object.entries(activity.by_agent)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(
      ([name, aggregate]) => `${name} · ${activityAggregateLine(aggregate)}`,
    );
  const explanation = readHtmlChangeExplanationRecord(cwd, state);
  const reviews = state.showcase_reviews?.at(-1);
  const decision = state.showcase_decisions?.at(-1);
  const scenarios = state.confirmed_scenarios ?? [];
  const completed = completedWorkItem(state);
  return [
    '# Evidence Orchestrator Status',
    '',
    '| Field | Value |',
    '|:---|:---|',
    `| Iteration | ${state.iteration_id} |`,
    `| Loop | ${state.loop} |`,
    `| Allowed Actions | ${nextActions(cwd, state)} |`,
    `| Iteration Intake | ${state.intake_snapshot?.candidate_id ?? 'missing'} |`,
    `| Kickoff Candidate | ${state.kickoff_candidate?.artifact_path ?? 'none'} |`,
    `| Story | ${state.active_clarification_story?.story_id ?? scenarios[0]?.story_id ?? 'none'} |`,
    `| Understand Stage | ${state.understand_stage ?? 'none'} |`,
    `| Pending TQA | ${state.pending_clarification ? `${state.pending_clarification.question_id} · ${state.pending_clarification.question}` : 'none'} |`,
    `| Scenario Set | ${scenarios.map(({ scenario_id }) => scenario_id).join(', ') || 'none'} |`,
    `| Completed Story | ${completed ? `${completed.story_id}/[${completed.scenarios.map(({ scenario_id }) => scenario_id).join(',')}]` : 'none'} |`,
    `| Modeling Stage | ${state.modeling_stage ?? 'none'} |`,
    `| Modeling Profile | ${state.modeling_profile ? `${state.modeling_profile.subject}/${state.modeling_profile.method}` : 'none'} |`,
    `| Model Expansion | ${state.model_expansion_path ?? 'none'} |`,
    `| Model Decision | ${state.modeling_profile?.method === 'none' && state.modeling_stage === 'model_confirmed' ? 'no model required · human Profile' : (state.model_decisions?.at(-1)?.action ?? 'none')} |`,
    `| Tasking Stage | ${state.tasking_stage ?? 'none'} |`,
    `| Tasking Draft | ${state.tasking_candidate?.draft_id ?? 'none'} |`,
    `| Approved Test Plan | ${state.approved_test_plan_path ?? 'none'} |`,
    `| Pair Checkpoint | ${state.pair_session?.checkpoint ?? 'none'} |`,
    `| Pair Unit | ${state.pair_session ? `${state.pair_session.task_id}/${state.pair_session.test_id}` : 'none'} |`,
    `| Pair Step | ${state.pair_session ? `${state.pair_session.process_id}/${state.pair_session.step_id}` : 'none'} |`,
    `| Pair Automation Exception | ${state.pair_session?.automation_exception?.reason ?? 'none'} |`,
    `| Activity Trace | ${activity.activities_started ? activityTraceRelativePath(state.iteration_id) : 'none'} |`,
    `| Activity Q/T/C | ${activityAggregateLine(activity)} |`,
    `| Activity Failures | failed=${activity.failed} · aborted=${activity.aborted} · timeout=${activity.timed_out} |`,
    `| Incomplete Activity Spans | ${activity.incomplete_spans.join(', ') || 'none'} |`,
    `| Peak Activity Context | ${activity.peak_context_tokens === null ? 'n/a' : compactNumber(activity.peak_context_tokens)} |`,
    `| Execution Log | ${execution.log ?? 'none'} |`,
    `| Execution Manifest | ${execution.manifest ?? 'none'} |`,
    `| Execution Summary | ${execution.summary ?? 'none'} |`,
    `| HTML Change Explanation | ${explanation ? `${explanation.output_path} · ${explanation.html_sha256}` : 'none'} |`,
    `| Human Coding Decision | ${state.pair_session?.coding_decision ? `approve · ${state.pair_session.coding_decision.artifact_path}` : 'none'} |`,
    `| Showcase Stage | ${state.showcase_stage ?? 'none'} |`,
    `| Human Product Observations | ${state.showcase_product_observations?.length ?? 0} |`,
    `| Q3/Q4 Evaluation Observations | ${state.showcase_evaluation_observations?.length ?? 0} |`,
    `| Showcase Review | ${reviews ? `${reviews.recommendation} · ${reviews.artifact_path}` : 'none'} |`,
    `| Showcase Decision | ${decision?.action ?? 'none'} |`,
    `| Respond Stage | ${state.respond_stage ?? 'none'} |`,
    `| Knowledge Promotion | ${state.knowledge_promotion_path ?? 'none'} |`,
    `| Next Probe | ${state.next_probe?.question ?? state.respond_candidate?.next_probe.question ?? 'none'} |`,
    `| Activity Agent | ${agent} |`,
    `| Halted | ${state.halted?.reason ?? 'no'} |`,
    `| Last Run | ${state.pi?.last_run_at ?? 'never'} |`,
    '',
    '## 下一步',
    '',
    nextStepGuidance(cwd, state),
    '',
    ...list('Activity by Agent', activityAgents),
    '',
    ...list('Artifacts', artifacts),
    '',
    ...list('Code Files', codeFiles),
  ].join('\n');
}
