import { join, relative } from 'node:path';
import { collectArtifacts, collectCodeFiles, findFiles } from './artifacts';
import { formatPhaseModel, phaseModelConfig } from './config';
import { isGateAnswered } from './gates';
import { readState } from './state';

export function statusMarkdown(cwd: string): string {
  const state = readState(cwd);
  const artifacts = collectArtifacts(cwd);
  const codeFiles = collectCodeFiles(cwd);
  const configuredModel = phaseModelConfig(cwd, state.phase);
  const gates = findFiles(join(cwd, 'artifacts', 'gates'), (p) =>
    p.endsWith('.md'),
  ).map((p) => relative(cwd, p));
  return [
    `# Evidence Workflow Status`,
    ``,
    `| Field | Value |`,
    `|:---|:---|`,
    `| Phase | ${state.phase} |`,
    `| Configured Model | ${formatPhaseModel(configuredModel)} |`,
    `| Round | ${state.round} |`,
    `| Pending Gate | ${state.pending_gate ?? 'none'} |`,
    `| Pending Gate Answered | ${state.pending_gate ? (isGateAnswered(cwd, state.pending_gate) ? 'yes' : 'no') : 'n/a'} |`,
    `| Failures | ${state.failures} / ${state.max_rounds} |`,
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
