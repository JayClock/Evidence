import { join, relative } from 'node:path';
import {
  collectArtifacts,
  collectCodeFiles,
  findFiles,
} from '../evidence/artifact-index';
import { isGateAnswered } from '../workflow/gates';
import { iterationRoot } from '../workflow/iteration-paths';
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
    try {
      const agent = loadPhaseAgent(cwd, state.phase);
      phaseAgent = `${agent.name} · ${agent.model} (thinking=${agent.thinking})`;
    } catch {
      phaseAgent = 'missing';
    }
  }
  const gates = findFiles(join(root, 'gates'), (p) => p.endsWith('.md')).map(
    (p) => relative(cwd, p),
  );
  const activeWorkItem = state.active_work_item
    ? `${state.active_work_item.story_id} / ${state.active_work_item.scenario_id}`
    : 'none';
  const activeClarificationStory =
    state.active_clarification_story?.story_id ?? 'none';
  const pendingStoryDecision = state.proposed_clarification_story_outcome
    ? `${state.proposed_clarification_story_outcome.story_id} · ${state.proposed_clarification_story_outcome.outcome}`
    : 'none';
  const clarificationOutcomes = state.clarification_story_outcomes?.length
    ? state.clarification_story_outcomes
        .map(
          ({ story_id, outcome, decided_by }) =>
            `${story_id}=${outcome}${decided_by ? ` (${decided_by})` : ''}`,
        )
        .join(', ')
    : 'none';
  const pendingClarification = state.pending_clarification
    ? `${state.pending_clarification.question_id} · ${state.pending_clarification.story_id}`
    : 'none';
  const requirementSource = state.requirement_source
    ? `${state.requirement_source.repository}#${state.requirement_source.issue_number}`
    : state.phase === 'complete'
      ? 'archived bootstrap iteration'
      : 'missing — execution blocked';
  return [
    `# Evidence Orchestrator Status`,
    ``,
    `| Field | Value |`,
    `|:---|:---|`,
    `| Iteration | ${state.iteration_id} |`,
    `| Phase | ${state.phase} |`,
    `| Requirement Source | ${requirementSource} |`,
    `| Requirements Substage | ${requirementsSubstage(state.phase)} |`,
    `| Active Work Item | ${activeWorkItem} |`,
    `| Active Clarification Story | ${activeClarificationStory} |`,
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
