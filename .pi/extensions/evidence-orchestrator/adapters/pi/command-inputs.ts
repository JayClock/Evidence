import type { ExtensionCommandContext } from '@earendil-works/pi-coding-agent';
import { readState } from '../../iteration/state-repository';
import type {
  DeskCheckAction,
  KickoffDecisionAction,
  ModelingMethod,
  ModelingSubject,
  ModelDecisionAction,
  RedFailureKind,
  ShowcaseDecisionAction,
  ShowcaseEvaluationActivity,
  ShowcaseEvaluationOutcome,
  ShowcaseRiskDisposition,
  ShowcaseRiskQuadrant,
  FeedbackTarget,
  UnderstandingDecisionAction,
} from '../../iteration/state';
import {
  concerningShowcaseEvaluations,
  missingShowcaseEvaluations,
  missingShowcaseRisks,
  showcaseActivitiesForQuadrant,
} from '../../loops/showcase/showcase-session';
import type { PairNavigationAction } from '../../loops/pair/pair-session';

export async function waitForIdle(ctx: ExtensionCommandContext): Promise<void> {
  if (!ctx.isIdle()) await ctx.waitForIdle();
}

const KICKOFF_ACTIONS: Record<string, KickoffDecisionAction> = {
  confirm: 'confirmed',
  confirmed: 'confirmed',
  revise: 'revise',
  split: 'split',
  defer: 'deferred',
  deferred: 'deferred',
  stop: 'stopped',
  stopped: 'stopped',
};
const SCENARIO_ACTIONS: Record<string, UnderstandingDecisionAction> = {
  confirm: 'confirmed',
  confirmed: 'confirmed',
  continue: 'continue',
  split: 'split',
  defer: 'deferred',
  deferred: 'deferred',
};
const DESK_CHECK_ACTIONS: Record<string, DeskCheckAction> = {
  approve: 'approve',
  revise: 'revise',
  architecture_gap: 'architecture_gap',
  process_gap: 'process_gap',
  scenario_gap: 'scenario_gap',
};

export function parseKickoffDecision(
  args: string,
): { action: KickoffDecisionAction; reason: string } | undefined {
  const [rawAction, ...reasonParts] = args.trim().split(/\s+/);
  if (!rawAction) return undefined;
  const action = KICKOFF_ACTIONS[rawAction.toLowerCase()];
  if (!action) {
    throw new Error(
      'Usage: /evidence-next [confirm | revise | split | defer | stop] <business reason>.',
    );
  }
  const reason = reasonParts.join(' ').trim();
  if (!reason) {
    throw new Error(`Kickoff ${rawAction} requires a business reason.`);
  }
  return { action, reason };
}

export async function promptKickoffDecision(
  ctx: ExtensionCommandContext,
): Promise<{ action: KickoffDecisionAction; reason: string } | undefined> {
  const state = readState(ctx.cwd);
  const candidate = state.kickoff_candidate;
  if (!candidate) throw new Error('No Kickoff candidate is awaiting review.');
  if (!ctx.hasUI) {
    throw new Error(
      'Kickoff confirmation requires interactive mode or explicit command arguments.',
    );
  }
  const options = [
    '确认这张 Story',
    '要求修改候选',
    '先拆分问题',
    '延期本轮',
    '停止本轮',
  ];
  const selected = await ctx.ui.select(
    `${candidate.title} · ${candidate.role} → ${candidate.value}`,
    options,
  );
  const actions: Record<string, KickoffDecisionAction> = {
    确认这张Story: 'confirmed',
    要求修改候选: 'revise',
    先拆分问题: 'split',
    延期本轮: 'deferred',
    停止本轮: 'stopped',
  };
  const action = selected ? actions[selected.replaceAll(' ', '')] : undefined;
  if (!action) return undefined;
  const defaultReasons: Record<KickoffDecisionAction, string> = {
    confirmed: `候选“${candidate.title}”准确表达了本轮需要解决的业务问题、受益角色和预期价值。`,
    revise: `候选“${candidate.title}”尚未准确表达本轮业务问题、受益角色或预期价值，需要修改。`,
    split: `候选“${candidate.title}”包含多个可独立验证的业务结果，需要先拆分。`,
    deferred: `候选“${candidate.title}”当前不具备继续推进所需的业务条件，本轮延期。`,
    stopped: `候选“${candidate.title}”不再属于本轮需要推进的业务问题，本轮停止。`,
  };
  const reason = (
    await ctx.ui.editor(
      `请确认或修改“${selected}”的业务理由`,
      defaultReasons[action],
    )
  )?.trim();
  return reason ? { action, reason } : undefined;
}

interface ScenarioDecision {
  action: UnderstandingDecisionAction;
  reason: string;
  draftId?: string;
}

export function parseScenarioDecision(
  args: string,
): ScenarioDecision | undefined {
  const [rawAction, ...rest] = args.trim().split(/\s+/);
  if (!rawAction) return undefined;
  const action = SCENARIO_ACTIONS[rawAction.toLowerCase()];
  if (!action) {
    throw new Error(
      'Usage: /evidence-next confirm <DRAFT-xxx> <reason> | continue <reason> | split <reason> | defer <reason>.',
    );
  }
  const draftId =
    action === 'confirmed' ? rest.shift()?.toUpperCase() : undefined;
  if (action === 'confirmed' && !draftId) {
    throw new Error('Scenario confirmation requires a DRAFT-xxx id.');
  }
  const reason = rest.join(' ').trim();
  if (!reason) throw new Error(`Scenario ${rawAction} requires a reason.`);
  return { action, reason, ...(draftId ? { draftId } : {}) };
}

export async function promptScenarioDecision(
  ctx: ExtensionCommandContext,
): Promise<ScenarioDecision | undefined> {
  const state = readState(ctx.cwd);
  if (!ctx.hasUI) {
    throw new Error(
      'Scenario confirmation requires interactive mode or explicit command arguments.',
    );
  }
  const confirmOptions = (state.scenario_drafts ?? []).map(
    ({ draft_id, title }) => `确认 ${draft_id} · ${title}`,
  );
  const options = [...confirmOptions, '继续 TQA', '拆分 Story', '延期 Story'];
  const selected = await ctx.ui.select('决定本轮最小业务 Scenario', options);
  if (!selected) return undefined;
  let action: UnderstandingDecisionAction;
  let draftId: string | undefined;
  if (selected.startsWith('确认 ')) {
    action = 'confirmed';
    draftId = selected.split(/\s+/)[1];
  } else if (selected === '继续 TQA') {
    action = 'continue';
  } else if (selected === '拆分 Story') {
    action = 'split';
  } else {
    action = 'deferred';
  }
  const selectedDraft = draftId
    ? state.scenario_drafts?.find((draft) => draft.draft_id === draftId)
    : undefined;
  const defaultReasons: Record<UnderstandingDecisionAction, string> = {
    confirmed: `“${draftId} · ${selectedDraft?.title ?? '候选 Scenario'}”是本轮可独立验证并交付用户价值的最小业务 Scenario。`,
    continue:
      '当前候选尚未消除影响 Scenario 边界或预期结果的关键业务不确定性，需要继续 TQA。',
    split: '当前候选包含多个可独立验证的业务结果，需要拆分 Story 后分别确认。',
    deferred: '当前候选尚不具备继续推进所需的业务条件，本轮延期。',
  };
  const reason = (
    await ctx.ui.editor(
      `请确认或修改“${selected}”的业务理由`,
      defaultReasons[action],
    )
  )?.trim();
  return reason
    ? { action, reason, ...(draftId ? { draftId } : {}) }
    : undefined;
}

interface ModelingProfileDecision {
  reason?: string;
  subject?: ModelingSubject;
  method?: ModelingMethod;
  modelChangeRequired?: boolean;
}

const MODELING_SUBJECTS: ModelingSubject[] = ['business', 'domain', 'tool'];
const MODELING_METHODS: ModelingMethod[] = [
  'none',
  'object',
  'event',
  'four_color',
  'eight_x_flow',
  'algorithmic',
];

export function parseModelingProfileDecision(
  args: string,
): ModelingProfileDecision | undefined {
  const [rawAction, ...rest] = args.trim().split(/\s+/);
  if (!rawAction) return undefined;
  if (rawAction === 'confirm') {
    const reason = rest.join(' ').trim();
    return reason ? { reason } : {};
  }
  if (rawAction !== 'set') {
    throw new Error(
      'Usage: /evidence-next confirm <reason> | set <business|domain|tool> <method> <true|false> <reason>.',
    );
  }
  const [rawSubject, rawMethod, rawRequired, ...reasonParts] = rest;
  if (
    !MODELING_SUBJECTS.includes(rawSubject as ModelingSubject) ||
    !MODELING_METHODS.includes(rawMethod as ModelingMethod) ||
    !['true', 'false'].includes(rawRequired ?? '')
  ) {
    throw new Error(
      'Profile override requires a valid subject, method, and true/false model-change decision.',
    );
  }
  const reason = reasonParts.join(' ').trim();
  if (!reason) throw new Error('Profile override requires a reason.');
  return {
    subject: rawSubject as ModelingSubject,
    method: rawMethod as ModelingMethod,
    modelChangeRequired: rawRequired === 'true',
    reason,
  };
}

export interface ModelDecisionInput {
  action: ModelDecisionAction;
  reason: string;
}

const MODEL_DECISIONS: Record<string, ModelDecisionAction> = {
  confirm: 'confirm',
  revise: 'revise',
  scenario_gap: 'scenario_gap',
  'scenario-gap': 'scenario_gap',
  method_gap: 'method_gap',
  'method-gap': 'method_gap',
};

export function parseModelDecision(
  args: string,
): ModelDecisionInput | undefined {
  const [rawAction, ...reasonParts] = args.trim().split(/\s+/);
  if (!rawAction) return undefined;
  const action = MODEL_DECISIONS[rawAction.toLowerCase()];
  if (!action) {
    throw new Error(
      'Usage: /evidence-next <confirm|revise|scenario-gap|method-gap> <business reason>.',
    );
  }
  const reason = reasonParts.join(' ').trim();
  if (!reason) throw new Error(`Model ${rawAction} requires a reason.`);
  return { action, reason };
}

export async function promptModelDecision(
  ctx: ExtensionCommandContext,
): Promise<ModelDecisionInput | undefined> {
  const state = readState(ctx.cwd);
  if (
    state.modeling_stage !== 'model_review' ||
    state.model_challenges?.at(-1)?.outcome !== 'pass'
  ) {
    throw new Error('No challenged model awaits human review.');
  }
  if (!ctx.hasUI) {
    throw new Error(
      'Model review requires interactive mode or explicit command arguments.',
    );
  }
  const projection = state.model_projection;
  const selected = await ctx.ui.select(
    [
      `模型投影：${projection?.mermaid_path ?? 'missing'}`,
      `统一语言：${projection?.glossary_path ?? 'missing'}`,
      `候选变更：${state.model_change_proposal?.artifact_path ?? 'none'}`,
      `独立检查：${state.model_challenges?.at(-1)?.summary ?? 'missing'}`,
    ].join('\n'),
    ['确认模型与统一语言', '修改模型', 'Scenario 理解缺口', '建模方法缺口'],
  );
  if (!selected) return undefined;
  const action: ModelDecisionAction = selected.startsWith('确认')
    ? 'confirm'
    : selected.startsWith('修改')
      ? 'revise'
      : selected.startsWith('Scenario')
        ? 'scenario_gap'
        : 'method_gap';
  const reason = (await ctx.ui.input(`请说明“${selected}”的业务理由`))?.trim();
  return reason ? { action, reason } : undefined;
}

interface DeskCheckDecisionInput {
  action: DeskCheckAction;
  reason: string;
}

export function parseDeskCheckDecision(
  args: string,
): DeskCheckDecisionInput | undefined {
  const [rawAction, ...reasonParts] = args.trim().split(/\s+/);
  if (!rawAction) return undefined;
  const action = DESK_CHECK_ACTIONS[rawAction.toLowerCase()];
  if (!action) {
    throw new Error(
      'Usage: /evidence-next <approve|revise|architecture_gap|process_gap|scenario_gap> <reason>.',
    );
  }
  const reason = reasonParts.join(' ').trim();
  if (!reason) throw new Error(`Desk Check ${rawAction} requires a reason.`);
  return { action, reason };
}

export async function promptDeskCheckDecision(
  ctx: ExtensionCommandContext,
): Promise<DeskCheckDecisionInput | undefined> {
  const candidate = readState(ctx.cwd).tasking_candidate;
  if (!candidate) throw new Error('No Tasking draft awaits Desk Check.');
  if (!ctx.hasUI) {
    throw new Error(
      'Desk Check requires interactive mode or explicit command arguments.',
    );
  }
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
  const reason = (await ctx.ui.input(`请说明“${selected}”的理由`))?.trim();
  return reason ? { action, reason } : undefined;
}

type PairDecisionInput =
  | { kind: 'red'; failureKind: RedFailureKind; reason: string }
  | { kind: 'navigate'; action: PairNavigationAction; reason: string };

const RED_FAILURE_KINDS: RedFailureKind[] = [
  'behavior',
  'compile',
  'dependency',
  'configuration',
  'network',
  'fixture',
  'other',
];

export function parsePairDecision(args: string): PairDecisionInput | undefined {
  const [rawAction, ...rest] = args.trim().split(/\s+/);
  if (!rawAction) return undefined;
  const action = rawAction.toLowerCase().replaceAll('-', '_');
  if (action === 'accept_red') {
    const reason = rest.join(' ').trim();
    if (!reason) throw new Error('accept-red requires a behavior reason.');
    return { kind: 'red', failureKind: 'behavior', reason };
  }
  if (action === 'reject_red') {
    const failureKind = rest.shift() as RedFailureKind | undefined;
    const reason = rest.join(' ').trim();
    if (!failureKind || !RED_FAILURE_KINDS.includes(failureKind) || !reason) {
      throw new Error(
        'reject-red requires <compile|dependency|configuration|network|fixture|other> <reason>.',
      );
    }
    if (failureKind === 'behavior') {
      throw new Error('Use accept-red for a legitimate behavior failure.');
    }
    return { kind: 'red', failureKind, reason };
  }
  const navigation = action as PairNavigationAction;
  if (
    ![
      'back_test',
      'back_implementation',
      'back_tasking',
      'retry_quality',
    ].includes(navigation)
  ) {
    throw new Error(
      'Usage: /evidence-next accept-red <reason> | reject-red <kind> <reason> | back-test|back-implementation|back-tasking|retry-quality <reason>.',
    );
  }
  const reason = rest.join(' ').trim();
  if (!reason) throw new Error(`${rawAction} requires a reason.`);
  return { kind: 'navigate', action: navigation, reason };
}

export async function promptPairDecision(
  ctx: ExtensionCommandContext,
): Promise<PairDecisionInput | undefined> {
  const session = readState(ctx.cwd).pair_session;
  if (!session) throw new Error('No Pair session is active.');
  if (!ctx.hasUI) {
    throw new Error(
      'Pair navigation requires interactive mode or explicit command arguments.',
    );
  }
  if (
    session.checkpoint === 'red_observed' &&
    session.red_observation?.accepted !== true
  ) {
    const choice = await ctx.ui.select('判断实际 Red 的失败性质', [
      '接受：预期业务行为尚未实现',
      '拒绝：编译失败',
      '拒绝：依赖失败',
      '拒绝：配置失败',
      '拒绝：网络失败',
      '拒绝：Fixture 损坏',
      '拒绝：其他非行为失败',
    ]);
    if (!choice) return undefined;
    const kinds: Record<string, RedFailureKind> = {
      '接受：预期业务行为尚未实现': 'behavior',
      '拒绝：编译失败': 'compile',
      '拒绝：依赖失败': 'dependency',
      '拒绝：配置失败': 'configuration',
      '拒绝：网络失败': 'network',
      '拒绝：Fixture 损坏': 'fixture',
      '拒绝：其他非行为失败': 'other',
    };
    const failureKind = kinds[choice];
    const reason = (await ctx.ui.input('请说明判断依据'))?.trim();
    return failureKind && reason
      ? { kind: 'red', failureKind, reason }
      : undefined;
  }
  const options = [
    '返回当前 Test Driver',
    '返回当前 Production Driver',
    '返回 Tasking Desk Check',
    ...(session.checkpoint === 'quality_gate_failed'
      ? ['重试当前 Quality Gate']
      : []),
  ];
  const choice = await ctx.ui.select(
    `Pair checkpoint: ${session.checkpoint}`,
    options,
  );
  if (!choice) return undefined;
  const actions: Record<string, PairNavigationAction> = {
    返回当前TestDriver: 'back_test',
    返回当前ProductionDriver: 'back_implementation',
    返回TaskingDeskCheck: 'back_tasking',
    重试当前QualityGate: 'retry_quality',
  };
  const action = actions[choice.replaceAll(' ', '')];
  const reason = (await ctx.ui.input(`请说明“${choice}”的理由`))?.trim();
  return action && reason ? { kind: 'navigate', action, reason } : undefined;
}

export type ShowcaseDecisionInput =
  | {
      kind: 'observation';
      observation: string;
      valueFeedback: string;
      evidenceRefs: string[];
    }
  | {
      kind: 'evaluation';
      quadrant: ShowcaseRiskQuadrant;
      activity: ShowcaseEvaluationActivity;
      outcome: ShowcaseEvaluationOutcome;
      finding: string;
      evidenceRefs: string[];
    }
  | {
      kind: 'risk';
      quadrant: ShowcaseRiskQuadrant;
      disposition: ShowcaseRiskDisposition;
      activities: ShowcaseEvaluationActivity[];
      reason: string;
    }
  | {
      kind: 'decision';
      action: ShowcaseDecisionAction;
      target?: FeedbackTarget;
      reason: string;
    };

const SHOWCASE_TARGETS: Record<string, FeedbackTarget> = {
  problem: 'problem',
  business: 'business_knowledge',
  business_knowledge: 'business_knowledge',
  scenario: 'scenario',
  model: 'model',
  modeling_method: 'modeling_method',
  architecture: 'architecture',
  process: 'test_process',
  test_process: 'test_process',
  test_strategy: 'test_strategy',
  test: 'test',
  code: 'implementation',
  implementation: 'implementation',
  refactor: 'refactor',
  value: 'value_validation',
  value_validation: 'value_validation',
  showcase_setup: 'showcase_setup',
};

export function parseShowcaseDecision(
  args: string,
): ShowcaseDecisionInput | undefined {
  const [rawAction, ...rest] = args.trim().split(/\s+/);
  if (!rawAction) return undefined;
  const action = rawAction.toLowerCase().replaceAll('_', '-');
  if (action === 'observe') {
    const evidenceRef = rest.shift();
    const [observation, valueFeedback, ...extra] = rest
      .join(' ')
      .split(/\s+::\s+/);
    if (
      !evidenceRef ||
      !observation?.trim() ||
      !valueFeedback?.trim() ||
      extra.length > 0
    ) {
      throw new Error(
        'Usage: /evidence-next observe <evidence-ref> <observation> :: <value-feedback>.',
      );
    }
    return {
      kind: 'observation',
      observation: observation.trim(),
      valueFeedback: valueFeedback.trim(),
      evidenceRefs: [evidenceRef],
    };
  }
  if (action === 'evaluate') {
    const rawScope = rest.shift() ?? '';
    const [rawQuadrant, scopedActivity] = rawScope.split('/');
    const rawActivity = scopedActivity || rest.shift();
    const rawOutcome = rest.shift();
    const evidenceRef = rest.shift();
    const finding = rest.join(' ').trim();
    const quadrant = rawQuadrant.toUpperCase() as ShowcaseRiskQuadrant;
    const activity = rawActivity as ShowcaseEvaluationActivity;
    const outcome = rawOutcome as ShowcaseEvaluationOutcome;
    if (
      !['Q3', 'Q4'].includes(quadrant) ||
      !showcaseActivitiesForQuadrant(quadrant).includes(activity) ||
      !['passed', 'concern'].includes(outcome) ||
      !evidenceRef ||
      !finding
    ) {
      throw new Error(
        'Usage: /evidence-next evaluate <q3|q4>/<activity> <passed|concern> <evidence-ref> <finding>.',
      );
    }
    return {
      kind: 'evaluation',
      quadrant,
      activity,
      outcome,
      finding,
      evidenceRefs: [evidenceRef],
    };
  }
  if (action === 'risk') {
    const quadrant = rest.shift()?.toUpperCase() as
      | ShowcaseRiskQuadrant
      | undefined;
    const rawDisposition = rest.shift()?.toLowerCase().replaceAll('-', '_');
    if (
      !quadrant ||
      !['Q3', 'Q4'].includes(quadrant) ||
      !['not_required', 'required'].includes(rawDisposition ?? '')
    ) {
      throw new Error(
        'Usage: /evidence-next risk <q3|q4> <not-required|required> [activity,activity] <reason>.',
      );
    }
    const disposition = rawDisposition as ShowcaseRiskDisposition;
    const activities =
      disposition === 'required'
        ? (rest.shift()?.split(',').filter(Boolean) as
            | ShowcaseEvaluationActivity[]
            | undefined)
        : [];
    if (
      disposition === 'required' &&
      (!activities?.length ||
        activities.some(
          (item) => !showcaseActivitiesForQuadrant(quadrant).includes(item),
        ))
    ) {
      throw new Error(
        `Showcase ${quadrant} activities must use: ${showcaseActivitiesForQuadrant(quadrant).join(', ')}.`,
      );
    }
    const reason = rest.join(' ').trim();
    if (!reason)
      throw new Error(`${quadrant} risk decision requires a reason.`);
    return {
      kind: 'risk',
      quadrant,
      disposition,
      activities: activities ?? [],
      reason,
    };
  }
  if (!['accept', 'revise', 'reject'].includes(action)) {
    throw new Error(
      'Usage: /evidence-next observe ... | risk ... | evaluate ... | accept <reason> | revise <target> <reason> | reject <reason>.',
    );
  }
  const decisionAction = action as ShowcaseDecisionAction;
  const target =
    decisionAction === 'revise'
      ? SHOWCASE_TARGETS[rest.shift()?.toLowerCase() ?? '']
      : undefined;
  if (decisionAction === 'revise' && !target) {
    throw new Error(
      `Showcase revise target must use: ${Object.keys(SHOWCASE_TARGETS).join(', ')}.`,
    );
  }
  const reason = rest.join(' ').trim();
  if (!reason) throw new Error(`Showcase ${action} requires a reason.`);
  return {
    kind: 'decision',
    action: decisionAction,
    ...(target ? { target } : {}),
    reason,
  };
}

export async function promptShowcaseDecision(
  ctx: ExtensionCommandContext,
): Promise<ShowcaseDecisionInput | undefined> {
  const state = readState(ctx.cwd);
  if (state.loop !== 'showcase') {
    throw new Error('No Showcase is awaiting a decision.');
  }
  if (!ctx.hasUI) {
    throw new Error(
      'Showcase decisions require interactive mode or explicit command arguments.',
    );
  }
  if (
    !(state.showcase_q2_observations?.length ?? 0) ||
    state.showcase_q2_observations?.some(({ exit_code }) => exit_code !== 0)
  ) {
    throw new Error(
      'Run and pass the selected Showcase Q2 observation before human product decisions.',
    );
  }
  if (!(state.showcase_product_observations?.length ?? 0)) {
    const evidenceRef = (
      await ctx.ui.input('输入实际产品演示的证据引用（路径或 URL）')
    )?.trim();
    const observation = (
      await ctx.ui.input('记录亲自观察到的产品行为')
    )?.trim();
    const valueFeedback = (
      await ctx.ui.input('记录该行为带来的业务价值反馈')
    )?.trim();
    return evidenceRef && observation && valueFeedback
      ? {
          kind: 'observation',
          observation,
          valueFeedback,
          evidenceRefs: [evidenceRef],
        }
      : undefined;
  }
  const missing = missingShowcaseRisks(state);
  if (missing.length > 0) {
    const quadrant = (await ctx.ui.select('选择风险象限', missing)) as
      | ShowcaseRiskQuadrant
      | undefined;
    if (!quadrant) return undefined;
    const choice = await ctx.ui.select(`${quadrant} 风险决定`, [
      '无需额外评价活动',
      '需要评价活动',
    ]);
    if (!choice) return undefined;
    const disposition: ShowcaseRiskDisposition =
      choice === '需要评价活动' ? 'required' : 'not_required';
    const activityInput =
      disposition === 'required'
        ? (
            await ctx.ui.input(
              `输入逗号分隔活动：${showcaseActivitiesForQuadrant(quadrant).join(', ')}`,
            )
          )?.trim()
        : '';
    const activities = activityInput
      ? (activityInput
          .split(',')
          .map((item) => item.trim()) as ShowcaseEvaluationActivity[])
      : [];
    if (
      activities.some(
        (item) => !showcaseActivitiesForQuadrant(quadrant).includes(item),
      )
    ) {
      throw new Error('Showcase contains an unsupported evaluation activity.');
    }
    const reason = (await ctx.ui.input(`请说明 ${quadrant} 决定理由`))?.trim();
    return reason
      ? { kind: 'risk', quadrant, disposition, activities, reason }
      : undefined;
  }
  const evaluationScopes = [
    ...new Set([
      ...missingShowcaseEvaluations(state),
      ...concerningShowcaseEvaluations(state),
    ]),
  ];
  if (evaluationScopes.length > 0) {
    const scope = await ctx.ui.select(
      '选择待执行或需复核的 Q3/Q4 评价活动',
      evaluationScopes,
    );
    if (!scope) return undefined;
    const [quadrant, activity] = scope.split('/') as [
      ShowcaseRiskQuadrant,
      ShowcaseEvaluationActivity,
    ];
    const outcome = (await ctx.ui.select('记录评价结果', [
      'passed',
      'concern',
    ])) as ShowcaseEvaluationOutcome | undefined;
    const evidenceRef = (
      await ctx.ui.input('输入评价活动的证据引用（路径或 URL）')
    )?.trim();
    const finding = (await ctx.ui.input('记录可复现的评价发现'))?.trim();
    return outcome && evidenceRef && finding
      ? {
          kind: 'evaluation',
          quadrant,
          activity,
          outcome,
          finding,
          evidenceRefs: [evidenceRef],
        }
      : undefined;
  }
  const selected = await ctx.ui.select('Showcase 人工决定', [
    '接受并进入 Respond',
    '修改并路由反馈',
    '拒绝并停止本轮',
  ]);
  if (!selected) return undefined;
  const action: ShowcaseDecisionAction = selected.startsWith('接受')
    ? 'accept'
    : selected.startsWith('修改')
      ? 'revise'
      : 'reject';
  let target: FeedbackTarget | undefined;
  if (action === 'revise') {
    const label = await ctx.ui.select('反馈属于哪个知识活动', [
      'problem',
      'business',
      'scenario',
      'model',
      'modeling_method',
      'architecture',
      'process',
      'test',
      'code',
      'refactor',
      'showcase_setup',
    ]);
    target = label ? SHOWCASE_TARGETS[label] : undefined;
    if (!target) return undefined;
  }
  const reason = (await ctx.ui.input(`请说明“${selected}”的理由`))?.trim();
  return reason
    ? {
        kind: 'decision',
        action,
        ...(target ? { target } : {}),
        reason,
      }
    : undefined;
}

interface RespondDecisionInput {
  action: 'approve' | 'revise';
  reason: string;
}

export function parseRespondDecision(
  args: string,
): RespondDecisionInput | undefined {
  const [rawAction, ...reasonParts] = args.trim().split(/\s+/);
  if (!rawAction) return undefined;
  const action = rawAction.toLowerCase() as RespondDecisionInput['action'];
  if (!['approve', 'revise'].includes(action)) {
    throw new Error('Usage: /evidence-next <approve|revise> <reason>.');
  }
  const reason = reasonParts.join(' ').trim();
  if (!reason) throw new Error(`Respond ${action} requires a reason.`);
  return { action, reason };
}

export async function promptRespondDecision(
  ctx: ExtensionCommandContext,
): Promise<RespondDecisionInput | undefined> {
  const state = readState(ctx.cwd);
  if (
    state.loop !== 'respond' ||
    state.respond_stage !== 'decision' ||
    !state.respond_candidate
  ) {
    throw new Error('No Respond candidate awaits a human decision.');
  }
  if (!ctx.hasUI) {
    throw new Error(
      'Respond decision requires interactive mode or explicit arguments.',
    );
  }
  const selected = await ctx.ui.select(
    `${state.respond_candidate.promotions.length} knowledge decision(s) · next Probe: ${state.respond_candidate.next_probe.question}`,
    ['批准知识响应并结束本轮', '要求修订知识响应'],
  );
  if (!selected) return undefined;
  const action = selected.startsWith('批准') ? 'approve' : 'revise';
  const reason = (await ctx.ui.input(`请说明“${selected}”的理由`))?.trim();
  return reason ? { action, reason } : undefined;
}

export async function promptModelingProfileDecision(
  ctx: ExtensionCommandContext,
): Promise<ModelingProfileDecision | undefined> {
  const proposal = readState(ctx.cwd).modeling_profile_proposal;
  if (!proposal) throw new Error('No modeling Profile is awaiting review.');
  if (!ctx.hasUI) {
    throw new Error(
      'Modeling Profile confirmation requires interactive mode or explicit command arguments.',
    );
  }
  const canConfirm = proposal.model_change_required !== 'unknown';
  const choice = await ctx.ui.select(
    `建模建议：${proposal.subject}/${proposal.method} · change=${proposal.model_change_required}`,
    [...(canConfirm ? ['确认 AI 建议'] : []), '覆盖 AI 建议'],
  );
  if (!choice) return undefined;
  if (choice === '确认 AI 建议') return {};
  const subject = (await ctx.ui.select('选择建模对象', MODELING_SUBJECTS)) as
    | ModelingSubject
    | undefined;
  const method = (await ctx.ui.select('选择建模方法', MODELING_METHODS)) as
    | ModelingMethod
    | undefined;
  const required = await ctx.ui.select('权威模型是否需要变化', [
    '需要变化',
    '无需变化',
  ]);
  const reason = (await ctx.ui.input('请说明覆盖建议的理由'))?.trim();
  if (!subject || !method || !required || !reason) return undefined;
  return {
    subject,
    method,
    modelChangeRequired: required === '需要变化',
    reason,
  };
}
