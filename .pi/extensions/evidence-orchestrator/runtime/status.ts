import { join, relative } from 'node:path';
import {
  collectArtifacts,
  collectCodeFiles,
  findFiles,
} from '../evidence/artifact-index';
import {
  allClarificationStoryOutcomeProposals,
  allPendingClarifications,
} from '../requirements/clarifications';
import { isGateAnswered } from '../workflow/gates';
import { pairDriverMode, pairNextInstruction } from '../testing/pairing';
import { iterationRoot } from '../workflow/iteration-paths';
import { allowedLoopActions, isV5Workflow } from '../workflow/loop-catalog';
import { readState } from '../workflow/state-store';
import { loadPhaseAgent } from '../subagents/phase-runner';

function requirementsSubstage(phase: string): string {
  return ['frame', 'clarify', 'specify', 'validate'].includes(phase)
    ? phase
    : 'n/a';
}

export function statusMarkdown(cwd: string): string {
  const state = readState(cwd);
  const root = iterationRoot(cwd, state);
  const artifacts = collectArtifacts(cwd, root);
  const codeFiles = collectCodeFiles(cwd);
  let phaseAgent = 'none';
  if (state.phase !== 'complete') {
    const pairMode = pairDriverMode(state);
    if (state.workflow_version === 5 && state.loop === 'pair' && !pairMode) {
      phaseAgent = 'pair-controller · deterministic / human Navigator';
    } else {
      try {
        const agent = loadPhaseAgent(
          cwd,
          state.phase,
          state.workflow_version === 5 &&
            state.modeling_stage === 'candidate_ready'
            ? 'model-challenger'
            : pairMode === 'test'
              ? 'test-driver'
              : pairMode
                ? 'production-driver'
                : undefined,
        );
        phaseAgent = `${agent.name} · ${agent.model} (thinking=${agent.thinking})`;
      } catch {
        phaseAgent = 'missing';
      }
    }
  }
  const gates = findFiles(join(root, 'gates'), (p) => p.endsWith('.md')).map(
    (p) => relative(cwd, p),
  );
  const activeWorkItem = state.active_work_item
    ? `${state.active_work_item.story_id} / ${state.active_work_item.scenario_id}`
    : 'none';
  const kickoffCandidate = state.kickoff_candidate
    ? `${state.kickoff_candidate.title} · ${state.kickoff_candidate.cognitive_mode} · ${state.kickoff_candidate.artifact_path}`
    : 'none';
  const kickoffDecisions = state.kickoff_decisions?.length
    ? state.kickoff_decisions
        .map(
          ({ action, story_id }) =>
            `${action}${story_id ? ` (${story_id})` : ''}`,
        )
        .join(', ')
    : 'none';
  const activeClarificationStory =
    state.active_clarification_story?.story_id ?? 'none';
  const scenarioDrafts = state.scenario_drafts?.length
    ? state.scenario_drafts
        .map(({ draft_id, title }) => `${draft_id} · ${title}`)
        .join(', ')
    : 'none';
  const confirmedScenario = state.confirmed_scenario
    ? `${state.confirmed_scenario.story_id} / ${state.confirmed_scenario.scenario_id}`
    : 'none';
  const modelingProfile = state.modeling_profile
    ? `${state.modeling_profile.subject}/${state.modeling_profile.method} · change=${state.modeling_profile.model_change_required}`
    : state.modeling_profile_proposal
      ? `proposed ${state.modeling_profile_proposal.subject}/${state.modeling_profile_proposal.method} · change=${state.modeling_profile_proposal.model_change_required}`
      : 'none';
  const latestModelChallenge = state.model_challenges?.at(-1)
    ? `${state.model_challenges.at(-1)?.outcome} · ${state.model_challenges.at(-1)?.artifact_path}`
    : 'none';
  const pendingStoryDecisions = allClarificationStoryOutcomeProposals(state);
  const pendingStoryDecision = pendingStoryDecisions.length
    ? pendingStoryDecisions
        .map(({ story_id, outcome }) => `${story_id} · ${outcome}`)
        .join(', ')
    : 'none';
  const clarificationOutcomes = state.clarification_story_outcomes?.length
    ? state.clarification_story_outcomes
        .map(
          ({ story_id, outcome, decided_by }) =>
            `${story_id}=${outcome}${decided_by ? ` (${decided_by})` : ''}`,
        )
        .join(', ')
    : 'none';
  const pendingClarifications = allPendingClarifications(state);
  const pendingClarification = pendingClarifications.length
    ? pendingClarifications
        .map(({ question_id, story_id }) => `${question_id} · ${story_id}`)
        .join(', ')
    : 'none';
  const requirementSource = state.requirement_source
    ? `${state.requirement_source.repository}#${state.requirement_source.issue_number}`
    : state.phase === 'complete'
      ? 'archived bootstrap iteration'
      : 'missing — execution blocked';
  const v5 = isV5Workflow(state);
  const workflowVersion = state.workflow_version ?? 4;
  const workflowCompatibility = v5
    ? 'native v5'
    : state.phase === 'complete' || state.halted
      ? 'legacy v4 · read-only'
      : 'legacy v4 active — complete or halt before starting v5; in-place migration is disabled';
  const allowedActions = v5
    ? state.loop === 'tasking' && state.tasking_stage !== 'approved'
      ? [
          ...allowedLoopActions(state.loop).filter(
            (action) => action !== 'advance:pair',
          ),
          ...(state.tasking_stage === 'desk_check'
            ? ['human:/evidence-desk-check']
            : []),
        ].join(', ') || 'none'
      : state.loop === 'pair'
        ? pairNextInstruction(state)
        : allowedLoopActions(state.loop).join(', ') || 'none'
    : 'legacy phase controls only';
  return [
    `# Evidence Orchestrator Status`,
    ``,
    `| Field | Value |`,
    `|:---|:---|`,
    `| Iteration | ${state.iteration_id} |`,
    `| Workflow Version | v${workflowVersion} |`,
    `| Loop | ${v5 ? state.loop : 'n/a (legacy phase)'} |`,
    `| Allowed Actions | ${allowedActions} |`,
    `| Workflow Compatibility | ${workflowCompatibility} |`,
    `| Phase | ${state.phase} |`,
    `| Requirement Source | ${requirementSource} |`,
    `| Requirements Substage | ${requirementsSubstage(state.phase)} |`,
    `| Kickoff Candidate | ${kickoffCandidate} |`,
    `| Kickoff Decisions | ${kickoffDecisions} |`,
    `| Active Work Item | ${activeWorkItem} |`,
    `| Active Clarification Story | ${activeClarificationStory} |`,
    `| Understand Stage | ${state.understand_stage ?? 'none'} |`,
    `| Scenario Drafts | ${scenarioDrafts} |`,
    `| Confirmed Scenario | ${confirmedScenario} |`,
    `| Modeling Stage | ${state.modeling_stage ?? 'none'} |`,
    `| Modeling Profile | ${modelingProfile} |`,
    `| Model Expansion | ${state.model_expansion_path ?? 'none'} |`,
    `| Model Change Proposal | ${state.model_change_proposal?.artifact_path ?? 'none'} |`,
    `| Latest Model Challenge | ${latestModelChallenge} |`,
    `| Tasking Stage | ${state.tasking_stage ?? 'none'} |`,
    `| Tasking Draft | ${state.tasking_candidate ? `${state.tasking_candidate.draft_id} · ${state.tasking_candidate.test_list_path}` : 'none'} |`,
    `| Tasking Gap | ${state.tasking_gap ? `${state.tasking_gap.kind} · ${state.tasking_gap.reason}` : 'none'} |`,
    `| Approved Test Plan | ${state.approved_test_plan_path ?? 'none'} |`,
    `| Pair Checkpoint | ${state.pair_session?.checkpoint ?? 'none'} |`,
    `| Pair Step | ${state.pair_session ? `${state.pair_session.process_id}/${state.pair_session.step_id}` : 'none'} |`,
    `| Pair Next | ${state.pair_session ? pairNextInstruction(state) : 'none'} |`,
    `| Pending Story Decision | ${pendingStoryDecision} |`,
    `| Clarification Outcomes | ${clarificationOutcomes} |`,
    `| Pending Clarification | ${pendingClarification} |`,
    `| Phase Subagent | ${phaseAgent} |`,
    `| Round | ${state.round} |`,
    `| Pending Gate | ${state.pending_gate ?? 'none'} |`,
    `| Pending Gate Answered | ${state.pending_gate ? (isGateAnswered(cwd, state.pending_gate) ? 'yes' : 'no') : 'n/a'} |`,
    `| Failures | ${state.failures} / ${state.max_rounds} |`,
    `| Halted | ${state.halted ? state.halted.reason : 'no'} |`,
    `| Last Run | ${state.pi?.last_run_at ?? 'never'} |`,
    ``,
    `## Artifacts (${artifacts.length})`,
    artifacts.length ? artifacts.map((a) => `- ${a}`).join('\n') : `- none`,
    ``,
    `## Code Files (${codeFiles.length})`,
    codeFiles.length ? codeFiles.map((a) => `- ${a}`).join('\n') : `- none`,
    ``,
    `## Gates (${gates.length})`,
    gates.length ? gates.map((g) => `- ${g}`).join('\n') : `- none`,
  ].join('\n');
}
