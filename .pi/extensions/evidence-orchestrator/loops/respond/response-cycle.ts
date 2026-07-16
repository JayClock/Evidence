import { execFileSync } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import {
  artifactPath,
  artifactRelativePath,
} from '../../iteration/artifact-layout';
import { transitionLoopState } from '../../iteration/transition-graph';
import { readState, writeState } from '../../iteration/state-repository';
import type {
  KnowledgeDecision,
  KnowledgeKind,
  KnowledgePromotionProposal,
  NextProbe,
  RespondCandidate,
  RespondDecisionRecord,
  WorkflowState,
} from '../../iteration/state';
import {
  executionEvidencePaths,
  validateExecutionEvidence,
} from '../../capabilities/execution-evidence/manifest';
import { testProcessDefinitionSha256 } from '../../capabilities/test-process/catalog';
import { validateShowcaseEvidence } from '../showcase/public';
import { validateKnowledgePromotion } from '../../capabilities/working-knowledge/promotion-validation';

const KNOWLEDGE_KINDS = new Set<KnowledgeKind>([
  'product',
  'model',
  'architecture',
  'contract',
  'test_process',
  'skill',
  'prompt',
  'other',
]);
const KNOWLEDGE_DECISIONS = new Set<KnowledgeDecision>([
  'promoted',
  'deferred',
  'rejected',
]);
const CANONICAL_ROOTS = [
  'docs/product/',
  '.evidence/',
  'docs/architecture/',
  'contracts/',
  'engineering/evidence-orchestrator/',
  '.pi/skills/',
  '.pi/prompts/',
];

export interface RespondProposalInput {
  promotions: KnowledgePromotionProposal[];
  noPromotionReason?: string;
  observedOutcomes: string[];
  residualRisks: string[];
  nextProbe: NextProbe;
}

function nonEmpty(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} must not be empty.`);
  return normalized;
}

function stringArray(values: string[], name: string, allowEmpty = false) {
  if (!Array.isArray(values) || (!allowEmpty && values.length === 0)) {
    throw new Error(
      `${name} must be ${allowEmpty ? 'an' : 'a non-empty'} array.`,
    );
  }
  const normalized = values.map((value) => nonEmpty(value, name));
  if (new Set(normalized).size !== normalized.length) {
    throw new Error(`${name} must not contain duplicates.`);
  }
  return normalized;
}

function changedPaths(cwd: string, baseline: string): string[] {
  execFileSync('git', ['cat-file', '-e', `${baseline}^{commit}`], { cwd });
  const tracked = execFileSync('git', ['diff', '--name-only', baseline, '--'], {
    cwd,
    encoding: 'utf8',
  }).split('\n');
  const untracked = execFileSync(
    'git',
    ['ls-files', '--others', '--exclude-standard'],
    { cwd, encoding: 'utf8' },
  ).split('\n');
  return [...new Set([...tracked, ...untracked].filter(Boolean))].sort();
}

function requireFile(cwd: string, path: string, name: string): void {
  if (!existsSync(join(cwd, path))) {
    throw new Error(`${name} does not exist: ${path}.`);
  }
}

function respondState(cwd: string): WorkflowState {
  const state = readState(cwd);
  if (
    state.loop !== 'respond' ||
    state.showcase_stage !== 'accepted' ||
    !state.active_work_item
  ) {
    throw new Error('Respond requires one human-accepted Showcase.');
  }
  return state;
}

function validateProbe(cwd: string, probe: NextProbe): NextProbe {
  const question = nonEmpty(probe.question, 'nextProbe.question');
  const whyNow = nonEmpty(probe.why_now, 'nextProbe.why_now');
  const firstAction = nonEmpty(probe.first_action, 'nextProbe.first_action');
  const evidenceRefs = stringArray(
    probe.evidence_refs,
    'nextProbe.evidence_refs',
  );
  evidenceRefs.forEach((path) => requireFile(cwd, path, 'nextProbe evidence'));
  if (/^(todo|tbd|continue|follow up|待办|继续)$/i.test(question)) {
    throw new Error('Next Probe must describe a concrete learning question.');
  }
  return {
    question,
    why_now: whyNow,
    evidence_refs: evidenceRefs,
    first_action: firstAction,
  };
}

function nextCandidatePath(cwd: string, state: WorkflowState): string {
  const root = artifactPath(
    cwd,
    state,
    'artifacts/07-learning/respond-candidates',
  );
  let sequence = 1;
  while (
    existsSync(join(root, `CAND-${String(sequence).padStart(3, '0')}.json`))
  ) {
    sequence += 1;
  }
  return artifactRelativePath(
    state,
    `artifacts/07-learning/respond-candidates/CAND-${String(sequence).padStart(3, '0')}.json`,
  );
}

function validatePromotions(
  cwd: string,
  state: WorkflowState,
  promotions: KnowledgePromotionProposal[],
  noPromotionReason: string | undefined,
): KnowledgePromotionProposal[] {
  if (!Array.isArray(promotions)) {
    throw new Error('Respond promotions must be an array.');
  }
  if (promotions.length === 0) {
    nonEmpty(noPromotionReason ?? '', 'noPromotionReason');
    return [];
  }
  if (noPromotionReason?.trim()) {
    throw new Error(
      'noPromotionReason is valid only when promotions is empty.',
    );
  }
  const workItem = state.active_work_item;
  if (!workItem) throw new Error('Respond has no active work item.');
  const manifest = validateExecutionEvidence(cwd, workItem);
  const actualChanges = changedPaths(cwd, workItem.git_baseline);
  const required = [
    ...(state.confirmed_scenarios ?? []).map(
      ({ artifact_path }) => artifact_path,
    ),
    state.showcase_decisions?.at(-1)?.artifact_path,
    executionEvidencePaths(cwd).manifest,
  ].filter((value): value is string => Boolean(value));
  return promotions.map((item, index) => {
    const name = `promotions[${index}]`;
    if (!KNOWLEDGE_KINDS.has(item.kind)) {
      throw new Error(`${name}.kind is unsupported.`);
    }
    if (!KNOWLEDGE_DECISIONS.has(item.decision)) {
      throw new Error(`${name}.decision is unsupported.`);
    }
    const source = nonEmpty(item.source, `${name}.source`);
    requireFile(cwd, source, `${name}.source`);
    const evidence = stringArray(
      item.validation_evidence,
      `${name}.validation_evidence`,
    );
    evidence.forEach((path) => requireFile(cwd, path, `${name} evidence`));
    const reason = nonEmpty(item.reason, `${name}.reason`);
    if (item.decision !== 'promoted') {
      if (
        item.canonical_target &&
        actualChanges.includes(item.canonical_target)
      ) {
        throw new Error(
          `${name} is ${item.decision} but its canonical target is already changed.`,
        );
      }
      return {
        source,
        kind: item.kind,
        decision: item.decision,
        reason,
        validation_evidence: evidence,
        ...(item.canonical_target
          ? { canonical_target: item.canonical_target }
          : {}),
      };
    }
    const target = nonEmpty(
      item.canonical_target ?? '',
      `${name}.canonical_target`,
    );
    if (!CANONICAL_ROOTS.some((root) => target.startsWith(root))) {
      throw new Error(`${name} target is outside canonical knowledge roots.`);
    }
    requireFile(cwd, target, `${name}.canonical_target`);
    if (!required.every((path) => evidence.includes(path))) {
      throw new Error(
        `${name} must cite the confirmed Scenario, Showcase decision, and execution manifest.`,
      );
    }
    if (!actualChanges.includes(target)) {
      throw new Error(
        `${name} target was not changed from the shared Git baseline.`,
      );
    }
    if (
      item.kind === 'model' &&
      !manifest.changed_paths.model.includes(target)
    ) {
      throw new Error(
        `${name} model target was not validated with the implementation.`,
      );
    }
    if (item.kind === 'test_process') {
      const processHash = testProcessDefinitionSha256(join(cwd, target));
      if (
        !manifest.processes.some(
          ({ definition_sha256 }) => definition_sha256 === processHash,
        )
      ) {
        throw new Error(`${name} test process was not used by the Scenario.`);
      }
    }
    if (
      item.kind === 'skill' &&
      target.includes('evidence-8x-flow') &&
      !(
        state.modeling_profile?.subject === 'business' &&
        state.modeling_profile.method === 'eight_x_flow' &&
        state.model_challenges?.at(-1)?.outcome === 'pass'
      )
    ) {
      throw new Error(
        `${name} 8X Skill was not used and validated by this Scenario.`,
      );
    }
    return {
      source,
      kind: item.kind,
      decision: item.decision,
      reason,
      validation_evidence: evidence,
      canonical_target: target,
    };
  });
}

function consistency(cwd: string, state: WorkflowState) {
  const workItem = state.active_work_item;
  const scenarios = state.confirmed_scenarios ?? [];
  if (!workItem || scenarios.length === 0) {
    throw new Error(
      'Respond requires the confirmed Scenario Set and work item.',
    );
  }
  if (state.model_git_baseline !== workItem.git_baseline) {
    throw new Error(
      'Model and code do not share the accepted Scenario Git baseline.',
    );
  }
  validateShowcaseEvidence(cwd);
  const manifest = validateExecutionEvidence(cwd, workItem);
  if (
    manifest.source.git_baseline !== workItem.git_baseline ||
    manifest.story_id !== workItem.story_id ||
    JSON.stringify(manifest.scenario_ids) !==
      JSON.stringify(workItem.scenario_ids)
  ) {
    throw new Error(
      'Model and code do not share the accepted Scenario Git baseline.',
    );
  }
  const appliedModelPaths = [
    ...(state.model_change_application?.changed_paths ?? []),
  ].sort();
  const observedModelPaths = [...manifest.changed_paths.model].sort();
  if (
    JSON.stringify(appliedModelPaths) !== JSON.stringify(observedModelPaths)
  ) {
    throw new Error(
      'Applied model paths and Showcase-observed model paths disagree.',
    );
  }
  const manifestPath = executionEvidencePaths(cwd).manifest;
  if (!manifestPath) throw new Error('Respond execution manifest is missing.');
  return {
    story_id: workItem.story_id,
    scenario_ids: workItem.scenario_ids,
    git_baseline: workItem.git_baseline,
    execution_manifest: manifestPath,
    model_paths: observedModelPaths,
    code_paths: [...manifest.changed_paths.code],
    consistent: true as const,
  };
}

function validateModelPromotionCoverage(
  state: WorkflowState,
  promotions: KnowledgePromotionProposal[],
): void {
  const applied = state.model_change_application?.changed_paths ?? [];
  if (applied.length === 0) return;
  const promotedTargets = new Set(
    promotions
      .filter(
        ({ kind, decision }) => kind === 'model' && decision === 'promoted',
      )
      .map(({ canonical_target }) => canonical_target),
  );
  const missing = applied.filter((path) => !promotedTargets.has(path));
  if (missing.length > 0) {
    throw new Error(
      `Applied model changes require promoted, validated model entries: ${missing.join(', ')}.`,
    );
  }
}

export function proposeKnowledgeResponse(
  cwd: string,
  input: RespondProposalInput,
  now = new Date().toISOString(),
): RespondCandidate {
  const state = respondState(cwd);
  if (state.respond_stage === 'decision' && state.respond_candidate) {
    throw new Error('A Respond candidate already awaits a human decision.');
  }
  const promotions = validatePromotions(
    cwd,
    state,
    input.promotions,
    input.noPromotionReason,
  );
  validateModelPromotionCoverage(state, promotions);
  const candidate: RespondCandidate = {
    version: 1,
    promotions,
    ...(promotions.length === 0
      ? {
          no_promotion_reason: nonEmpty(
            input.noPromotionReason ?? '',
            'noPromotionReason',
          ),
        }
      : {}),
    observed_outcomes: stringArray(input.observedOutcomes, 'observedOutcomes'),
    residual_risks: stringArray(input.residualRisks, 'residualRisks', true),
    next_probe: validateProbe(cwd, input.nextProbe),
    consistency: consistency(cwd, state),
    artifact_path: nextCandidatePath(cwd, state),
    proposed_at: now,
  };
  const absolute = join(cwd, candidate.artifact_path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, `${JSON.stringify(candidate, null, 2)}\n`);
  writeState(cwd, {
    ...state,
    respond_stage: 'decision',
    respond_candidate: candidate,
  });
  return candidate;
}

function decisionPath(state: WorkflowState): string {
  return artifactRelativePath(
    state,
    'artifacts/07-learning/respond-decisions.jsonl',
  );
}

function persistDecision(
  cwd: string,
  state: WorkflowState,
  decision: RespondDecisionRecord,
): void {
  const path = join(cwd, decision.artifact_path);
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(decision)}\n`);
}

function renderSummary(candidate: RespondCandidate): string {
  return `# Iteration Summary — ${candidate.consistency.story_id} / [${candidate.consistency.scenario_ids.join(', ')}]\n\n## Observed outcomes\n${candidate.observed_outcomes.map((item) => `- ${item}`).join('\n')}\n\n## Knowledge response\n${candidate.promotions.length ? candidate.promotions.map((item) => `- ${item.kind} · ${item.decision} · ${item.source} — ${item.reason}`).join('\n') : `- No promotion: ${candidate.no_promotion_reason}`}\n\n## Residual risks\n${candidate.residual_risks.map((item) => `- ${item}`).join('\n') || '- none'}\n`;
}

function renderProbe(probe: NextProbe): string {
  return `# Next Probe\n\n## Learning question\n${probe.question}\n\n## Why now\n${probe.why_now}\n\n## Evidence\n${probe.evidence_refs.map((path) => `- ${path}`).join('\n')}\n\n## First action\n${probe.first_action}\n\n> Updating the GitHub Issue and creating a new snapshot remain explicit human actions.\n`;
}

export function decideKnowledgeResponse(
  cwd: string,
  action: 'approve' | 'revise',
  reason: string,
  now = new Date().toISOString(),
): WorkflowState {
  const state = respondState(cwd);
  if (!['approve', 'revise'].includes(action)) {
    throw new Error(`Unsupported Respond decision: ${action}.`);
  }
  const candidate = state.respond_candidate;
  if (state.respond_stage !== 'decision' || !candidate) {
    throw new Error('No Respond candidate awaits a human decision.');
  }
  const normalizedReason = nonEmpty(reason, `Respond ${action} reason`);
  if (action === 'approve') {
    const persisted = JSON.parse(
      readFileSync(join(cwd, candidate.artifact_path), 'utf8'),
    ) as unknown;
    if (JSON.stringify(persisted) !== JSON.stringify(candidate)) {
      throw new Error('Respond candidate changed after proposal.');
    }
    const promotions = validatePromotions(
      cwd,
      state,
      candidate.promotions,
      candidate.no_promotion_reason,
    );
    validateModelPromotionCoverage(state, promotions);
    if (
      JSON.stringify(consistency(cwd, state)) !==
      JSON.stringify(candidate.consistency)
    ) {
      throw new Error(
        'Respond model/code consistency changed before approval.',
      );
    }
    validateProbe(cwd, candidate.next_probe);
  }
  const decision: RespondDecisionRecord = {
    action,
    reason: normalizedReason,
    decided_by: 'human',
    artifact_path: decisionPath(state),
    decided_at: now,
  };
  persistDecision(cwd, state, decision);
  const decisions = [...(state.respond_decisions ?? []), decision];
  if (action === 'revise') {
    return writeState(cwd, {
      ...state,
      respond_stage: 'drafting',
      respond_candidate: undefined,
      respond_decisions: decisions,
    });
  }
  const promotionPath = artifactRelativePath(
    state,
    'artifacts/07-learning/knowledge-promotion.json',
  );
  const promotionDocument = {
    version: 2,
    ...(candidate.promotions.length === 0
      ? { no_promotion_reason: candidate.no_promotion_reason }
      : {}),
    promotions: candidate.promotions.map((promotion) => ({
      ...promotion,
      human_decision: {
        decision: promotion.decision,
        reason: normalizedReason,
        confirmed_by: 'human',
        confirmed_at: now,
      },
    })),
    consistency: candidate.consistency,
  };
  const summaryPath = artifactPath(
    cwd,
    state,
    'artifacts/07-learning/iteration-summary.md',
  );
  const probePath = artifactPath(
    cwd,
    state,
    'artifacts/07-learning/next-iteration.md',
  );
  const promotionAbsolute = join(cwd, promotionPath);
  mkdirSync(dirname(promotionAbsolute), { recursive: true });
  writeFileSync(
    promotionAbsolute,
    `${JSON.stringify(promotionDocument, null, 2)}\n`,
  );
  writeFileSync(summaryPath, renderSummary(candidate));
  writeFileSync(probePath, renderProbe(candidate.next_probe));
  validateKnowledgePromotion(cwd, promotionAbsolute, state);
  const completed = transitionLoopState(
    {
      ...state,
      respond_stage: 'complete',
      respond_decisions: decisions,
      knowledge_promotion_path: promotionPath,
      next_probe: candidate.next_probe,
    },
    { to: 'complete' },
    now,
  );
  return writeState(cwd, {
    ...completed,
    respond_stage: 'complete',
    respond_decisions: decisions,
    knowledge_promotion_path: promotionPath,
    next_probe: candidate.next_probe,
  });
}
