import type { ExtensionCommandContext } from '@earendil-works/pi-coding-agent';
import { readState } from '../../../iteration/state-repository';
import type { DeskCheckAction } from '../../../iteration/state';
import {
  inspectDeskCheck,
  type DeskCheckReview,
} from '../../../loops/tasking/public';
import {
  sanitizeDecisionText,
  validateDecisionPacket,
  type DecisionPacketCheck,
  type DecisionPacketEvidenceRef,
  type DecisionPacketItem,
  type HumanDecisionPacket,
} from './contract';
import { showDecisionPacket } from './dialog';
import { boundDecisionList } from './renderer';

export interface DeskCheckDecisionInput {
  action: DeskCheckAction;
  reason?: string;
}

export type DeskCheckDecisionPacket = HumanDecisionPacket<DeskCheckAction>;

interface PromptDeskCheckOptions {
  inspect?: (cwd: string) => DeskCheckReview;
  show?: typeof showDecisionPacket;
}

const ACTIONS: Record<
  DeskCheckAction,
  Omit<
    DeskCheckDecisionPacket['actions'][number],
    'id' | 'enabled' | 'disabled_reason'
  >
> = {
  approve: {
    label: '批准当前完整计划并进入 Pair',
    description:
      'Approve the reviewed Story-level test and implementation plan.',
    effect: 'Create immutable plan artifacts and enter Pair.',
    tone: 'approve',
    reason_mode: 'optional',
  },
  revise: {
    label: '修改测试/任务候选',
    description: 'Return the TEST/TASK candidate for revision.',
    effect: 'Remain in Tasking drafting.',
    tone: 'feedback',
    reason_mode: 'required',
  },
  architecture_gap: {
    label: '架构知识缺口',
    description: 'Record missing or uncertain architecture knowledge.',
    effect: 'Enter the Tasking architecture knowledge-gap branch.',
    tone: 'feedback',
    reason_mode: 'required',
  },
  process_gap: {
    label: '测试工序缺口',
    description: 'Record a missing or ambiguous v3 test process.',
    effect: 'Enter the Tasking test-process knowledge-gap branch.',
    tone: 'feedback',
    reason_mode: 'required',
  },
  scenario_gap: {
    label: 'Scenario 理解缺口',
    description:
      'Reject the current acceptance boundary as incomplete or wrong.',
    effect: 'Return the Story to Understand TQA.',
    tone: 'feedback',
    reason_mode: 'required',
  },
};

const DEFAULT_REASONS: Record<Exclude<DeskCheckAction, 'approve'>, string> = {
  revise:
    '当前测试或任务候选尚未准确表达完整计划边界，需要修订后重新 Desk Check。',
  architecture_gap:
    '当前计划缺少做出架构边界决定所需的知识，需要先补齐架构证据。',
  process_gap: '当前 v3 test process 存在缺失或歧义，需要先补齐测试工序知识。',
  scenario_gap:
    '当前 Scenario Set 未准确表达本轮完整验收边界，需要返回 Understand TQA。',
};

function clean(value: string): string {
  return sanitizeDecisionText(value);
}

function shadow(value: number | null, suffix = ''): string {
  return value === null ? 'shadow' : `${value}${suffix}`;
}

function evidencePath(review: DeskCheckReview, label: string): string {
  return (
    review.evidence_refs.find((reference) => reference.label === label)?.path ??
    review.evidence_refs[0]?.path ??
    'review evidence references'
  );
}

function evidenceLabels(
  review: DeskCheckReview,
  predicate: (label: string) => boolean,
): string[] {
  return review.evidence_refs
    .filter(({ label }) => predicate(label))
    .map(({ label }) => clean(label));
}

function acceptanceItems(review: DeskCheckReview): DecisionPacketItem[] {
  const shown = review.acceptance.scenarios.slice(0, 8);
  const items = shown.map((scenario) => ({
    label: clean(`${scenario.scenario_id} · ${scenario.title}`),
    value: clean(
      `Then ${scenario.then.length} · business data ${scenario.business_data.length}`,
    ),
    detail: clean(
      `Then: ${scenario.then.join('；') || 'none'} · Business data: ${scenario.business_data.join('；') || 'none'}`,
    ),
    evidence_ref_labels: evidenceLabels(
      review,
      (label) => label === `Scenario ${scenario.scenario_id}`,
    ),
  }));
  const omitted = review.acceptance.scenarios.length - shown.length;
  if (omitted > 0) {
    items.push({
      label: 'Scenario summary omission',
      value: clean(`${omitted} Scenario(s) omitted from the TUI summary.`),
      detail: clean(
        `Review the complete Scenario boundary through ${evidencePath(review, 'Test list')}.`,
      ),
      evidence_ref_labels: evidenceLabels(
        review,
        (label) => label === 'Test list',
      ),
    });
  }
  return items;
}

function processItems(review: DeskCheckReview): DecisionPacketItem[] {
  const shown = review.processes.slice(0, 10);
  const items = shown.map((process) => ({
    label: clean(process.id),
    value: clean(
      `${process.runtime} · process v${process.process_version} · steps ${process.selected_step_ids.join(', ')}`,
    ),
    detail: clean(
      `projects=${process.project_ids.join(', ') || 'not applicable'} · contexts=${process.functional_contexts.join(', ')} · boundaries=${process.technical_boundaries.join(', ')} · definition=${process.definition_sha256.slice(0, 12)} · materialized=${process.materialized_sha256.slice(0, 12)}`,
    ),
    evidence_ref_labels: evidenceLabels(
      review,
      (label) =>
        label === `Process ${process.id}` ||
        label === `Project catalog ${process.id}`,
    ),
  }));
  const omitted = review.processes.length - shown.length;
  if (omitted > 0) {
    items.push({
      label: 'Process summary omission',
      value: clean(`${omitted} process selection(s) omitted.`),
      detail: clean(
        `Review the complete candidate: ${evidencePath(review, 'Tasking candidate')}.`,
      ),
      evidence_ref_labels: evidenceLabels(
        review,
        (label) => label === 'Tasking candidate',
      ),
    });
  }
  return items;
}

function commandItems(review: DeskCheckReview): DecisionPacketItem[] {
  const completePath = evidencePath(review, 'Tasking candidate');
  const focused = boundDecisionList(review.commands.focused, 5, completePath);
  const gates = boundDecisionList(
    review.commands.quality_gates,
    5,
    completePath,
  );
  const items: DecisionPacketItem[] = [
    {
      label: 'Command inventory',
      value: clean(
        `${review.commands.focused.length} focused · ${review.commands.quality_gates.length} quality gate`,
      ),
      evidence_ref_labels: evidenceLabels(
        review,
        (label) => label === 'Tasking candidate',
      ),
    },
    ...focused.shown.map((command, index) => ({
      label: `Focused ${index + 1}`,
      value: clean(command),
    })),
  ];
  if (focused.omission_notice) {
    items.push({
      label: 'Focused command omission',
      value: clean(focused.omission_notice),
    });
  }
  items.push(
    ...gates.shown.map((command, index) => ({
      label: `Gate ${index + 1}`,
      value: clean(command),
    })),
  );
  if (gates.omission_notice) {
    items.push({
      label: 'Quality gate omission',
      value: clean(gates.omission_notice),
    });
  }
  return items;
}

function budgetItems(review: DeskCheckReview): DecisionPacketItem[] {
  const budget = review.budget_preview;
  if (!budget) {
    return [
      {
        label: 'Budget preview',
        value: 'Unavailable; see the BLOCKED budget policy check.',
        evidence_ref_labels: evidenceLabels(
          review,
          (label) => label === 'Execution budget policy',
        ),
      },
    ];
  }
  return [
    {
      label: 'Mode and Pair calls',
      value: clean(
        `${budget.mode} · expected=${budget.expected_pair_agent_calls} · max=${shadow(budget.max_pair_agent_calls)}`,
      ),
    },
    {
      label: 'Timeouts',
      value: clean(
        `activity=${budget.activity_timeout_ms}ms · command=${budget.command_timeout_ms}ms`,
      ),
    },
    {
      label: 'Checkpoints and progress',
      value: clean(
        `emergency=${budget.emergency_max_checkpoints} · retry/fingerprint=${budget.max_retries_per_failure_fingerprint} · no-progress=${shadow(budget.max_no_progress_checkpoints)}`,
      ),
    },
    {
      label: 'Iteration hard limits',
      value: clean(
        `duration=${shadow(budget.max_duration_ms, 'ms')} · input=${shadow(budget.max_input_tokens)} · output=${shadow(budget.max_output_tokens)} · cost=${shadow(budget.max_reported_cost_usd, ' USD')}`,
      ),
      detail: clean(
        `Policy ${budget.policy_path} · sha256:${budget.policy_sha256.slice(0, 12)}. null is displayed as shadow.`,
      ),
      evidence_ref_labels: evidenceLabels(
        review,
        (label) => label === 'Execution budget policy',
      ),
    },
  ];
}

function packetChecks(review: DeskCheckReview): DecisionPacketCheck[] {
  const labels: Record<DeskCheckReview['checks'][number]['id'], string> = {
    candidate: 'Candidate, process, and traceability integrity',
    model: 'Confirmed modeling evidence',
    git_baseline: 'Clean coding Git baseline',
    budget_policy: 'Human-owned execution budget policy',
  };
  return review.checks.map((check) => ({
    id: check.id,
    label: labels[check.id],
    status: check.status,
    detail: clean(check.detail),
    evidence_ref_labels: evidenceLabels(review, (label) => {
      if (check.id === 'candidate') {
        return (
          ['Tasking candidate', 'Test list', 'Task list'].includes(label) ||
          label.startsWith('Process ') ||
          label.startsWith('Project catalog ')
        );
      }
      if (check.id === 'model') return label.startsWith('Model ');
      if (check.id === 'budget_policy')
        return label === 'Execution budget policy';
      return label.startsWith('Model ');
    }),
  }));
}

function packetEvidence(review: DeskCheckReview): DecisionPacketEvidenceRef[] {
  return review.evidence_refs.map((reference) => ({
    label: clean(reference.label),
    path: clean(reference.path),
    ...(reference.sha256 && /^[a-f0-9]{64}$/.test(reference.sha256)
      ? { sha256: reference.sha256 }
      : {}),
  }));
}

/** Map Tasking-owned review facts into the generic, non-authoritative UI contract. */
export function buildDeskCheckDecisionPacket(
  review: DeskCheckReview,
): DeskCheckDecisionPacket {
  const blocked = review.checks.some(({ status }) => status === 'blocked');
  const actions = (Object.keys(ACTIONS) as DeskCheckAction[]).map((id) => ({
    id,
    ...ACTIONS[id],
    enabled: id !== 'approve' || !blocked,
    ...(id === 'approve' && blocked
      ? {
          disabled_reason:
            'One or more Desk Check readiness checks are BLOCKED.',
        }
      : {}),
  }));
  const packet: DeskCheckDecisionPacket = {
    version: 1,
    packet_kind: 'tasking_desk_check',
    iteration_id: clean(review.iteration_id),
    loop: 'Tasking',
    stage: 'Desk Check',
    title: 'Review one complete Story test and implementation plan',
    authority_request:
      'Approve the complete Story plan or route one precise knowledge gap.',
    authority_scope: [
      'Scenario → Q2/Q1 → TEST → TASK traceability and ordering.',
      'Runtime, process v3, Nx ownership, commands, gates, and execution budget.',
    ],
    authority_exclusions: [
      'Code implementation, test execution results, and Story coding approval.',
      'Product behavior/value acceptance, Showcase, and Respond decisions.',
    ],
    subject_label: clean(
      `${review.draft_id} · ${review.story_id} · ${review.scenario_ids.join(', ')}`,
    ),
    subject_sha256: review.subject_sha256,
    sections: [
      {
        id: 'acceptance_boundary',
        title: 'Acceptance boundary',
        items: acceptanceItems(review),
      },
      {
        id: 'modeling_disposition',
        title: 'Modeling disposition',
        items: [
          {
            label: 'Profile and model impact',
            value: clean(
              `${review.model.profile} · model change required=${review.model.model_change_required}`,
            ),
          },
          {
            label: 'Reviewed model evidence',
            value: clean(
              `expansion=${review.model.expansion_path} · decision=${review.model.decision_path}${review.model.challenge_path ? ` · challenge=${review.model.challenge_path}` : ''}`,
            ),
            detail: clean(
              `projection=${review.model.projection_sha256?.slice(0, 12) ?? 'no canonical projection'}`,
            ),
            evidence_ref_labels: evidenceLabels(review, (label) =>
              label.startsWith('Model '),
            ),
          },
        ],
      },
      {
        id: 'test_task_shape',
        title: 'Test and task shape',
        items: [
          {
            label: 'Q1 / Q2 / TEST / TASK',
            value: clean(
              `${review.traceability.q1_count} / ${review.traceability.q2_count} / ${review.traceability.test_count} / ${review.traceability.task_count}`,
            ),
          },
          {
            label: 'Traceability invariants',
            value: clean(
              `Then→Q2=${review.traceability.every_then_has_q2} · TEST→one TASK=${review.traceability.every_test_has_one_task}`,
            ),
            detail: clean(
              `${review.traceability.scenario_outcome_count} Scenario outcome(s) form the acceptance boundary.`,
            ),
            evidence_ref_labels: evidenceLabels(
              review,
              (label) => label === 'Test list' || label === 'Task list',
            ),
          },
        ],
      },
      {
        id: 'runtime_process_ownership',
        title: 'Runtime and process ownership',
        items: processItems(review),
      },
      {
        id: 'commands_gates',
        title: 'Commands and gates',
        items: commandItems(review),
      },
      {
        id: 'execution_budget',
        title: 'Execution budget',
        items: budgetItems(review),
      },
    ],
    checks: packetChecks(review),
    evidence_refs: packetEvidence(review),
    actions,
  };
  return validateDecisionPacket(packet);
}

async function promptLegacyDeskCheckDecision(
  ctx: ExtensionCommandContext,
): Promise<DeskCheckDecisionInput | undefined> {
  const candidate = readState(ctx.cwd).tasking_candidate;
  if (!candidate) throw new Error('No Tasking draft awaits Desk Check.');
  const labels = [
    '批准并进入 Pair',
    '修改测试/任务列表',
    '架构知识缺口',
    '测试工序缺口',
    'Scenario 理解缺口',
  ];
  const selected = await ctx.ui.select(
    `${candidate.draft_id} · ${candidate.test_list_path}`,
    labels,
  );
  if (!selected) return undefined;
  const actions: Record<string, DeskCheckAction> = {
    批准并进入Pair: 'approve',
    修改测试任务列表: 'revise',
    架构知识缺口: 'architecture_gap',
    测试工序缺口: 'process_gap',
    Scenario理解缺口: 'scenario_gap',
  };
  const action = actions[selected.replace(/[ /]/g, '')];
  if (!action) return undefined;
  if (action === 'approve') return { action };
  const reason = (await ctx.ui.input(`请说明“${selected}”的理由`))?.trim();
  return reason ? { action, reason } : undefined;
}

async function collectReason(
  ctx: ExtensionCommandContext,
  action: DeskCheckAction,
): Promise<{ cancelled: boolean; reason?: string }> {
  const definition = ACTIONS[action];
  if (definition.reason_mode === 'none') return { cancelled: false };
  if (definition.reason_mode === 'optional') {
    const value = await ctx.ui.input(
      `请说明“${definition.label}”的理由（可选；空白提交表示不记录理由）`,
    );
    if (value === undefined) return { cancelled: true };
    const reason = value.trim();
    return { cancelled: false, ...(reason ? { reason } : {}) };
  }
  const value = await ctx.ui.editor(
    `请确认或修改“${definition.label}”的理由`,
    DEFAULT_REASONS[action as Exclude<DeskCheckAction, 'approve'>],
  );
  if (value === undefined) return { cancelled: true };
  const reason = value.trim();
  return reason ? { cancelled: false, reason } : { cancelled: true };
}

/** Prompt one atomic Desk Check decision and reject stale Packet submissions. */
export async function promptDeskCheckDecision(
  ctx: ExtensionCommandContext,
  options: PromptDeskCheckOptions = {},
): Promise<DeskCheckDecisionInput | undefined> {
  if (!ctx.hasUI) {
    throw new Error(
      'Desk Check requires interactive mode or explicit command arguments.',
    );
  }
  const supportsCustom =
    typeof (ctx.ui as unknown as { custom?: unknown }).custom === 'function';
  if (ctx.mode !== 'tui' || !supportsCustom) {
    return promptLegacyDeskCheckDecision(ctx);
  }

  const inspect = options.inspect ?? inspectDeskCheck;
  const show = options.show ?? showDecisionPacket;
  const review = inspect(ctx.cwd);
  const packet = buildDeskCheckDecisionPacket(review);
  const action = await show(ctx, packet);
  if (!action) return undefined;
  if (
    !packet.actions.some(
      (candidate) => candidate.id === action && candidate.enabled,
    )
  ) {
    throw new Error(`Desk Check Packet action is not enabled: ${action}.`);
  }
  const collected = await collectReason(ctx, action);
  if (collected.cancelled) return undefined;

  const latest = inspect(ctx.cwd);
  if (latest.subject_sha256 !== review.subject_sha256) {
    throw new Error(
      'Desk Check inputs changed while the decision packet was open. No human decision was recorded. Reopen /evidence-desk-check and review the new facts.',
    );
  }
  return {
    action,
    ...(collected.reason ? { reason: collected.reason } : {}),
  };
}
