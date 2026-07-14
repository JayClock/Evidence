import { join, relative } from 'node:path';
import {
  collectArtifacts,
  collectCodeFiles,
  findFiles,
} from '../evidence/artifact-index';
import { singleStoryId } from '../requirements/story-cards';
import { loadPhaseAgent } from '../subagents/phase-runner';
import { isGateAnswered } from '../workflow/gates';
import { iterationRoot } from '../workflow/iteration-paths';
import { readState } from '../workflow/state-store';

export function statusMarkdown(cwd: string): string {
  const state = readState(cwd);
  if (state.phase === 'idle') {
    return [
      '# Evidence Orchestrator Status',
      '',
      '| Field | Value |',
      '|:---|:---|',
      '| Iteration | none |',
      '| Phase | idle |',
      '| Next feedback | Select a GitHub Issue and run Kickoff |',
    ].join('\n');
  }

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
  const gates = findFiles(join(root, 'gates'), (path) =>
    path.endsWith('.md'),
  ).map((path) => relative(cwd, path));
  let storyId = 'not created';
  if (!['kickoff'].includes(state.phase)) {
    try {
      storyId = singleStoryId(cwd, state);
    } catch {
      storyId = 'missing or invalid';
    }
  }
  const activeWorkItem = state.active_work_item
    ? `${state.active_work_item.story_id} / ${state.active_work_item.scenario_id}`
    : 'none';
  const pendingClarification = state.pending_clarification
    ? `${state.pending_clarification.question_id} · ${state.pending_clarification.story_id}`
    : 'none';
  const requirementSource = state.requirement_source
    ? `${state.requirement_source.repository}#${state.requirement_source.issue_number}`
    : 'missing';

  return [
    '# Evidence Orchestrator Status',
    '',
    '| Field | Value |',
    '|:---|:---|',
    `| Iteration | ${state.iteration_id} |`,
    `| Phase | ${state.phase} |`,
    `| Requirement Source | ${requirementSource} |`,
    `| Single Story | ${storyId} |`,
    `| Active Build Scenario | ${activeWorkItem} |`,
    `| Pending TQA | ${pendingClarification} |`,
    `| Answered TQA Exchanges | ${state.clarification_history?.length ?? 0} |`,
    `| Phase Agent | ${phaseAgent} |`,
    `| Round | ${state.round} |`,
    `| Pending Feedback Gate | ${state.pending_gate ?? 'none'} |`,
    `| Gate Answered | ${state.pending_gate ? (isGateAnswered(cwd, state.pending_gate) ? 'yes' : 'no') : 'n/a'} |`,
    `| Failures | ${state.failures} / ${state.max_rounds} |`,
    `| Halted | ${state.halted ? state.halted.reason : 'no'} |`,
    `| Last Run | ${state.pi?.last_run_at ?? 'never'} |`,
    '',
    `## Artifacts (${artifacts.length})`,
    artifacts.length
      ? artifacts.map((path) => `- ${path}`).join('\n')
      : '- none',
    '',
    `## Code Files (${codeFiles.length})`,
    codeFiles.length
      ? codeFiles.map((path) => `- ${path}`).join('\n')
      : '- none',
    '',
    `## Gates (${gates.length})`,
    gates.length ? gates.map((path) => `- ${path}`).join('\n') : '- none',
  ].join('\n');
}
