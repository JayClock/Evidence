import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  collectArtifacts,
  collectCodeFiles,
  ensureProjectDirs,
  missingPaths,
} from '../evidence/artifact-index';
import {
  validateDomainModelEvidence,
  validateScenarioExecutionEvidence,
} from '../evidence/model-and-code';
import {
  allPendingClarifications,
  validateClarificationStoriesComplete,
} from '../requirements/clarifications';
import { validateIssueSourceSnapshot } from '../requirements/github-issue';
import { validateConfirmedStoriesSpecified } from '../requirements/specifications';
import { validateStoryCards } from '../requirements/story-cards';
import {
  validateKnowledgePromotion,
  validateScenarioContextMap,
} from '../evidence/knowledge';
import {
  artifactPath,
  artifactRelativePath,
  iterationRoot,
} from './iteration-paths';
import { nextPhase, PHASE_META } from './phase-catalog';
import { readState, selectedTestProcesses, writeState } from './state-store';
import type { GateDecisionAction, Phase, WorkflowState } from './types';

interface GateMetadata {
  version: 1;
  id: string;
  iteration_id: string;
  phase: Exclude<Phase, 'complete'>;
  kind: 'phase' | 'emergency';
  decision?: { action: GateDecisionAction; comment: string };
}

const GATE_METADATA = /<!-- evidence-orchestrator-gate\n([\s\S]*?)\n-->/;

function gatePath(cwd: string, state: WorkflowState, gateId: string): string {
  return join(iterationRoot(cwd, state), 'gates', `${gateId}.md`);
}

function readGateMetadata(path: string): GateMetadata {
  if (!existsSync(path)) throw new Error(`Gate file not found: ${path}`);
  const text = readFileSync(path, 'utf8');
  const matched = GATE_METADATA.exec(text);
  if (!matched) throw new Error(`Gate file has no workflow metadata: ${path}`);
  try {
    return JSON.parse(matched[1]) as GateMetadata;
  } catch {
    throw new Error(`Gate file has invalid workflow metadata: ${path}`);
  }
}

function decisionFromText(decision: string): GateDecisionAction {
  const normalized = decision.trim().toLowerCase();
  if (
    normalized.startsWith('reject') ||
    normalized.startsWith('终止') ||
    normalized.startsWith('拒绝')
  ) {
    return 'reject';
  }
  if (
    normalized.startsWith('revise') ||
    normalized.startsWith('rework') ||
    normalized.startsWith('驳回') ||
    normalized.startsWith('修改')
  ) {
    return 'revise';
  }
  if (
    normalized.startsWith('approve') ||
    normalized.startsWith('通过') ||
    normalized.startsWith('批准')
  ) {
    return 'approve';
  }
  throw new Error(
    'Gate decision must start with approve/通过, revise/驳回, or reject/终止.',
  );
}

function checkedDecision(text: string): GateDecisionAction | undefined {
  if (/\[x\]\s*(通过|批准|approve)/i.test(text)) return 'approve';
  if (/\[x\]\s*(驳回|修改|revise|rework)/i.test(text)) return 'revise';
  if (/\[x\]\s*(终止|拒绝|reject)/i.test(text)) return 'reject';
  return undefined;
}

export function gateDecision(
  cwd: string,
  state: WorkflowState,
  gateId: string,
): GateMetadata['decision'] | undefined {
  const path = gatePath(cwd, state, gateId);
  const metadata = readGateMetadata(path);
  if (metadata.iteration_id !== state.iteration_id) {
    throw new Error(
      `Gate ${gateId} belongs to ${metadata.iteration_id}, not ${state.iteration_id}.`,
    );
  }
  const selected =
    metadata.decision ??
    (() => {
      const action = checkedDecision(readFileSync(path, 'utf8'));
      return action
        ? { action, comment: 'Decision selected in Gate Markdown.' }
        : undefined;
    })();
  if (!selected) return undefined;
  if (!['approve', 'revise', 'reject'].includes(selected.action)) {
    throw new Error(`Gate ${gateId} has an unsupported decision action.`);
  }
  if (
    typeof selected.comment !== 'string' ||
    selected.comment.trim().length === 0
  ) {
    throw new Error(`Gate ${gateId} requires a non-empty decision comment.`);
  }
  return selected;
}

export function isGateAnswered(cwd: string, gateId: string): boolean {
  const state = readState(cwd);
  return gateDecision(cwd, state, gateId) !== undefined;
}

export function answerGate(
  cwd: string,
  gateId: string,
  decision: string,
): { gatePath: string; answered: boolean } {
  const state = readState(cwd);
  const path = gatePath(cwd, state, gateId);
  const current = readFileSync(path, 'utf8');
  const metadata = readGateMetadata(path);
  if (metadata.iteration_id !== state.iteration_id) {
    throw new Error(`Gate ${gateId} does not belong to the active iteration.`);
  }
  const action = decisionFromText(decision);
  const updatedMetadata: GateMetadata = {
    ...metadata,
    decision: { action, comment: decision.trim() },
  };
  const next = current.replace(
    GATE_METADATA,
    `<!-- evidence-orchestrator-gate\n${JSON.stringify(updatedMetadata, null, 2)}\n-->`,
  );
  writeFileSync(path, `${next.trim()}\n`);
  return { gatePath: relative(cwd, path), answered: true };
}

export function resolvePendingGate(cwd: string): WorkflowState {
  const state = readState(cwd);
  if (!state.pending_gate) return state;
  const path = gatePath(cwd, state, state.pending_gate);
  const metadata = readGateMetadata(path);
  const decision = gateDecision(cwd, state, state.pending_gate);
  if (!decision) return state;

  if (metadata.kind === 'emergency' && decision.action === 'approve') {
    return writeState(cwd, {
      ...state,
      pending_gate: null,
      round: 0,
      failures: 0,
      last_failure: undefined,
    });
  }
  if (decision.action === 'approve') {
    return writeState(cwd, {
      ...state,
      pending_gate: null,
      active_work_item:
        metadata.phase === 'coding' ? undefined : state.active_work_item,
    });
  }
  if (decision.action === 'reject') {
    return writeState(cwd, {
      ...state,
      pending_gate: null,
      halted: {
        phase: metadata.phase,
        reason: decision.comment,
        recorded_at: new Date().toISOString(),
      },
    });
  }

  return writeState(cwd, {
    ...state,
    phase: metadata.phase,
    pending_gate: null,
    round: state.round + 1,
    failures: state.failures + 1,
    last_failure: {
      phase: metadata.phase,
      round: state.round + 1,
      summary: decision.comment,
      recorded_at: new Date().toISOString(),
    },
  });
}

export function generateGate(
  cwd: string,
  phase: Exclude<Phase, 'complete'>,
  artifacts: string[],
  summary = '',
  kind: GateMetadata['kind'] = 'phase',
): string {
  const state = readState(cwd);
  ensureProjectDirs(cwd, iterationRoot(cwd, state));
  const meta = PHASE_META[phase];
  const id = kind === 'phase' ? meta.gateId : `GATE-EMERGENCY-${phase}`;
  const file = gatePath(cwd, state, id);
  const today = new Date().toISOString().slice(0, 10);
  const artifactList = artifacts.length
    ? artifacts.map((artifact) => `- ${artifact}`).join('\n')
    : meta.outputs
        .map((artifact) => `- ${artifactRelativePath(state, artifact)}`)
        .join('\n');
  const metadata: GateMetadata = {
    version: 1,
    id,
    iteration_id: state.iteration_id,
    phase,
    kind,
  };
  const text = `<!-- evidence-orchestrator-gate
${JSON.stringify(metadata, null, 2)}
-->
# Gate: ${kind === 'emergency' ? '需要人工介入' : meta.gateTitle} (${id})

## 状态
⏳ 待审核 · ${today} · Iteration: ${state.iteration_id}

## 当前阶段
- Phase: ${phase}
- Title: ${meta.title}

## 当前工件
${artifactList}

## 自动摘要
${summary || '请审阅本阶段输出，确认下一步。'}

## 待人类决策

- [ ] 通过 / approve${kind === 'emergency' ? '：重置失败计数并允许重试。' : '：进入下一阶段。'}
- [ ] 驳回，需修改 / revise：回到本阶段，并保留本次反馈。
- [ ] 终止 / reject：停止本迭代。

也可执行：

\`/evidence-gate approve <说明>\`
\`/evidence-gate revise <说明>\`
\`/evidence-gate reject <说明>\`
`;
  writeFileSync(file, text);
  return relative(cwd, file);
}

export function validatePhaseCompletion(
  cwd: string,
  phase: Exclude<Phase, 'complete'>,
): void {
  const current = readState(cwd);
  if (current.halted) {
    throw new Error(
      `Cannot complete ${phase}: iteration is halted (${current.halted.reason}).`,
    );
  }
  if (current.phase !== phase) {
    throw new Error(
      `Cannot complete ${phase}: current phase is ${current.phase}. Reset the workflow before starting a new iteration.`,
    );
  }
  if (current.pending_gate) {
    throw new Error(
      `Cannot complete ${phase}: gate ${current.pending_gate} is pending.`,
    );
  }
  if (current.requirement_source) validateIssueSourceSnapshot(cwd, current);
  const pendingClarification = allPendingClarifications(current)[0];
  if (pendingClarification) {
    throw new Error(
      `Cannot complete ${phase}: pending clarification ${pendingClarification.question_id} for ${pendingClarification.story_id} must be answered first.`,
    );
  }

  if (phase === 'clarify') {
    validateClarificationStoriesComplete(cwd, current);
  }
  if (phase === 'specify') {
    validateConfirmedStoriesSpecified(cwd, current);
  }
  if (phase === 'architecture') {
    validateScenarioContextMap(
      cwd,
      artifactPath(
        cwd,
        current,
        'artifacts/03-architecture/scenario-context-map.json',
      ),
    );
  }
  if (phase === 'coding') {
    if (!current.active_work_item) {
      throw new Error(
        'Cannot complete coding: select exactly one US-xxx / SC-xxx work item first.',
      );
    }
    if (selectedTestProcesses(current.active_work_item).length === 0) {
      throw new Error(
        'Cannot complete coding: select one matching test process before changing code; add additional processes for each runtime.',
      );
    }
    const evidencePath = artifactRelativePath(
      current,
      `artifacts/05-code/${current.active_work_item.story_id}/${current.active_work_item.scenario_id}.md`,
    );
    if (missingPaths(cwd, [evidencePath]).length > 0) {
      throw new Error(
        `Cannot complete coding: missing scenario evidence ${evidencePath}.`,
      );
    }
  }
  const outputs = PHASE_META[phase].outputs.map((path) =>
    artifactRelativePath(current, path),
  );
  const missing = missingPaths(cwd, outputs);
  if (missing.length > 0) {
    throw new Error(
      `Cannot complete ${phase}: missing required outputs: ${missing.join(', ')}.`,
    );
  }
  if (phase === 'frame') validateStoryCards(cwd, current);
  const root = relative(cwd, iterationRoot(cwd, current));
  if (phase === 'domain_model') validateDomainModelEvidence(cwd, root);
  if (phase === 'learn') {
    validateKnowledgePromotion(
      cwd,
      artifactPath(
        cwd,
        current,
        'artifacts/07-learning/knowledge-promotion.json',
      ),
    );
  }
  if (phase === 'coding') {
    if (collectCodeFiles(cwd).length === 0) {
      throw new Error(
        'Cannot complete coding: no production or test code was found under apps/ or libs/.',
      );
    }
    const workItem = current.active_work_item;
    if (!workItem) {
      throw new Error('Cannot complete coding without an active work item.');
    }
    validateScenarioExecutionEvidence(cwd, workItem, root);
  }
}

/** Record a failed Check step and create an emergency human gate at the retry limit. */
export function recordPhaseFailure(
  cwd: string,
  phase: Exclude<Phase, 'complete'>,
  summary: string,
): WorkflowState {
  const current = readState(cwd);
  if (current.phase !== phase) {
    throw new Error(
      `Cannot record failure for ${phase}: current phase is ${current.phase}.`,
    );
  }
  const round = current.round + 1;
  const failures = current.failures + 1;
  const failure = {
    phase,
    round,
    summary,
    recorded_at: new Date().toISOString(),
  };
  const feedback = artifactPath(
    cwd,
    current,
    `artifacts/feedback/${phase}-round-${round}.md`,
  );
  ensureProjectDirs(cwd, iterationRoot(cwd, current));
  writeFileSync(
    feedback,
    `# ${phase} Check Failure — Round ${round}\n\n${summary}\n`,
  );
  let next = writeState(cwd, {
    ...current,
    round,
    failures,
    last_failure: failure,
  });
  if (round >= current.max_rounds) {
    const gate = generateGate(
      cwd,
      phase,
      collectArtifacts(cwd, iterationRoot(cwd, next)),
      summary,
      'emergency',
    );
    next = writeState(cwd, {
      ...next,
      pending_gate: gate.split('/').at(-1)?.replace(/\.md$/, '') ?? null,
    });
  }
  return next;
}

export function completePhase(
  cwd: string,
  phase: Exclude<Phase, 'complete'>,
  summary = '',
): WorkflowState {
  validatePhaseCompletion(cwd, phase);
  const current = readState(cwd);
  const artifacts = collectArtifacts(cwd, iterationRoot(cwd, current));
  const mode = current.gate_config[phase] ?? 'auto';
  const shouldGate =
    mode === 'review' ||
    mode === 'override' ||
    (mode === 'review_if' && current.failures > 0);
  const newPendingGate = shouldGate ? PHASE_META[phase].gateId : null;
  if (shouldGate) generateGate(cwd, phase, artifacts, summary);
  return writeState(cwd, {
    ...current,
    phase: nextPhase(phase),
    round: 0,
    pending_gate: newPendingGate,
    failures: 0,
    last_failure: undefined,
    artifacts,
    active_work_item:
      phase === 'coding' && !shouldGate ? undefined : current.active_work_item,
    pi: {
      enabled: true,
      version: 4,
      ...(current.pi ?? {}),
      last_completed_phase: phase,
      last_run_at: new Date().toISOString(),
    },
  });
}
