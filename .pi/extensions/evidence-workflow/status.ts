import { join, relative } from 'node:path';
import { collectArtifacts, collectCodeFiles, findFiles } from './artifacts';
import { formatPhaseModel, phaseModelConfig } from './config';
import { isGateAnswered } from './gates';
import { iterationRoot } from './iteration';
import { readState } from './state';

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
  const configuredModel = phaseModelConfig(cwd, state.phase);
  const gates = findFiles(join(root, 'gates'), (p) => p.endsWith('.md')).map(
    (p) => relative(cwd, p),
  );
  const activeWorkItem = state.active_work_item
    ? `${state.active_work_item.story_id} / ${state.active_work_item.scenario_id}`
    : 'none';
  const pendingClarification = state.pending_clarification
    ? `${state.pending_clarification.question_id} · ${state.pending_clarification.story_id}`
    : 'none';
  const requirementSource = state.requirement_source
    ? `${state.requirement_source.repository}#${state.requirement_source.issue_number}`
    : 'legacy local snapshot';
  return [
    `# Evidence Workflow Status`,
    ``,
    `| Field | Value |`,
    `|:---|:---|`,
    `| Iteration | ${state.iteration_id} |`,
    `| Phase | ${state.phase} |`,
    `| Requirement Source | ${requirementSource} |`,
    `| Requirements Substage | ${requirementsSubstage(state.phase)} |`,
    `| Active Work Item | ${activeWorkItem} |`,
    `| Pending Clarification | ${pendingClarification} |`,
    `| Configured Model | ${formatPhaseModel(configuredModel)} |`,
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
