import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from '@earendil-works/pi-coding-agent';
import {
  confirmClarificationStoryOutcome,
  continueClarificationStory,
  selectClarificationStory,
  unresolvedClarificationStoryIds,
} from '../requirements/clarifications';
import { confirmModelingProfile } from '../evidence/modeling';
import { decideKickoff } from '../requirements/kickoff';
import { decideUnderstanding } from '../requirements/scenarios';
import { decideTasking } from '../testing/tasking';
import {
  navigatePair,
  pairNextInstruction,
  reviewPairRed,
  type PairNavigationAction,
} from '../testing/pairing';
import { answerGate } from '../workflow/gates';
import {
  checkIssueSourceDriftAsync,
  startIterationFromIssueAsync,
  syncIssueSourceAsync,
} from '../requirements/github-issue';
import { PHASE_ORDER } from '../workflow/phase-catalog';
import { readState } from '../workflow/state-store';
import type {
  ClarificationStoryOutcome,
  ClarificationStoryOutcomeProposal,
  DeskCheckAction,
  KickoffDecisionAction,
  ModelingMethod,
  ModelingSubject,
  Phase,
  RedFailureKind,
  UnderstandingDecisionAction,
} from '../workflow/types';
import { PHASE_RESULT_MESSAGE_TYPE, STATUS_KEY, statusLabel } from './identity';
import {
  isCompletedIteration,
  PhaseRunBlockedError,
  preparePhaseRun,
  type PreparedPhaseRun,
} from './phase-dispatch';
import {
  executePreparedPhaseRun,
  type PhaseExecutionDetails,
} from './phase-execution';
import { createGitHubCliRunner } from './github-cli';
import { selectOrCreateGitHubIssue } from './issue-picker';
import { runWithLoader } from './loading';
import { runWithPhaseProgress } from './phase-progress';
import { statusMarkdown } from './status';
import {
  listSelectableClarificationStories,
  selectClarificationStoryInteractively,
} from './story-picker';

async function waitForIdle(ctx: ExtensionCommandContext): Promise<void> {
  if (!ctx.isIdle()) await ctx.waitForIdle();
}

type StoryDecision =
  | {
      kind: 'complete';
      outcome: ClarificationStoryOutcome;
      summary: string;
    }
  | { kind: 'continue'; reason: string };

const STORY_OUTCOMES: ClarificationStoryOutcome[] = [
  'clarified',
  'needs_split',
  'deferred',
];

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

function parseKickoffDecision(
  args: string,
): { action: KickoffDecisionAction; reason: string } | undefined {
  const [rawAction, ...reasonParts] = args.trim().split(/\s+/);
  if (!rawAction) return undefined;
  const action = KICKOFF_ACTIONS[rawAction.toLowerCase()];
  if (!action) {
    throw new Error(
      'Usage: /evidence-kickoff [confirm | revise | split | defer | stop] <business reason>.',
    );
  }
  const reason = reasonParts.join(' ').trim();
  if (!reason) {
    throw new Error(`Kickoff ${rawAction} requires a business reason.`);
  }
  return { action, reason };
}

async function promptKickoffDecision(
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
  const reason = (await ctx.ui.input(`请说明 ${selected} 的业务理由`))?.trim();
  return reason ? { action, reason } : undefined;
}

interface ScenarioDecision {
  action: UnderstandingDecisionAction;
  reason: string;
  draftId?: string;
}

function parseScenarioDecision(args: string): ScenarioDecision | undefined {
  const [rawAction, ...rest] = args.trim().split(/\s+/);
  if (!rawAction) return undefined;
  const action = SCENARIO_ACTIONS[rawAction.toLowerCase()];
  if (!action) {
    throw new Error(
      'Usage: /evidence-scenario confirm <DRAFT-xxx> <reason> | continue <reason> | split <reason> | defer <reason>.',
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

async function promptScenarioDecision(
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
  const reason = (await ctx.ui.input(`请说明“${selected}”的业务理由`))?.trim();
  return reason
    ? { action, reason, ...(draftId ? { draftId } : {}) }
    : undefined;
}

interface ModelingProfileDecision {
  reason: string;
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

function parseModelingProfileDecision(
  args: string,
): ModelingProfileDecision | undefined {
  const [rawAction, ...rest] = args.trim().split(/\s+/);
  if (!rawAction) return undefined;
  if (rawAction === 'confirm') {
    const reason = rest.join(' ').trim();
    if (!reason) throw new Error('Profile confirmation requires a reason.');
    return { reason };
  }
  if (rawAction !== 'set') {
    throw new Error(
      'Usage: /evidence-modeling-profile confirm <reason> | set <business|domain|tool> <method> <true|false> <reason>.',
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

interface DeskCheckDecisionInput {
  action: DeskCheckAction;
  reason: string;
}

function parseDeskCheckDecision(
  args: string,
): DeskCheckDecisionInput | undefined {
  const [rawAction, ...reasonParts] = args.trim().split(/\s+/);
  if (!rawAction) return undefined;
  const action = DESK_CHECK_ACTIONS[rawAction.toLowerCase()];
  if (!action) {
    throw new Error(
      'Usage: /evidence-desk-check <approve|revise|architecture_gap|process_gap|scenario_gap> <reason>.',
    );
  }
  const reason = reasonParts.join(' ').trim();
  if (!reason) throw new Error(`Desk Check ${rawAction} requires a reason.`);
  return { action, reason };
}

async function promptDeskCheckDecision(
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

function parsePairDecision(args: string): PairDecisionInput | undefined {
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
      'Usage: /evidence-pair accept-red <reason> | reject-red <kind> <reason> | back-test|back-implementation|back-tasking|retry-quality <reason>.',
    );
  }
  const reason = rest.join(' ').trim();
  if (!reason) throw new Error(`${rawAction} requires a reason.`);
  return { kind: 'navigate', action: navigation, reason };
}

async function promptPairDecision(
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

async function promptModelingProfileDecision(
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
  if (choice === '确认 AI 建议') {
    const reason = (await ctx.ui.input('请说明确认该建模方法的理由'))?.trim();
    return reason ? { reason } : undefined;
  }
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

function parseStoryDecision(
  args: string,
  proposal?: ClarificationStoryOutcomeProposal,
): StoryDecision | undefined {
  const [rawAction, ...summaryParts] = args.trim().split(/\s+/);
  if (!rawAction) return undefined;
  const action = rawAction.toLowerCase();
  const summary = summaryParts.join(' ').trim();
  if (action === 'confirm') {
    if (!proposal) {
      throw new Error(
        'Confirm requires an AI proposal; use /evidence-story-complete <outcome> <business reason> for a direct human decision.',
      );
    }
    return {
      kind: 'complete',
      outcome: proposal.outcome,
      summary: proposal.summary,
    };
  }
  if (action === 'continue') {
    if (!proposal) {
      throw new Error(
        'Continue requires an AI proposal to reject; keep clarifying by answering the pending question instead.',
      );
    }
    if (!summary) {
      throw new Error(
        'Continue requires a reason: /evidence-story-complete continue <remaining business uncertainty>.',
      );
    }
    return { kind: 'continue', reason: summary };
  }
  if (STORY_OUTCOMES.includes(action as ClarificationStoryOutcome)) {
    if (!summary) {
      throw new Error(
        `Completing the Story requires a reason: /evidence-story-complete ${action} <business reason>.`,
      );
    }
    return {
      kind: 'complete',
      outcome: action as ClarificationStoryOutcome,
      summary,
    };
  }
  throw new Error(
    'Usage: /evidence-story-complete [confirm | continue <reason> | clarified <reason> | needs_split <reason> | deferred <reason>].',
  );
}

async function promptStoryDecision(
  ctx: ExtensionCommandContext,
  storyId: string,
  proposal?: ClarificationStoryOutcomeProposal,
): Promise<StoryDecision | undefined> {
  if (!ctx.hasUI) {
    throw new Error(
      'Story completion requires an interactive mode or an explicit command argument.',
    );
  }
  if (!proposal) {
    const outcomeOptions = STORY_OUTCOMES.map(
      (outcome) => `直接标记为 ${outcome}`,
    );
    const selected = await ctx.ui.select(
      `决定 ${storyId} 的最终澄清结论`,
      outcomeOptions,
    );
    const outcome = STORY_OUTCOMES.find(
      (candidate) => selected === `直接标记为 ${candidate}`,
    );
    if (!outcome) return undefined;
    const summary = (
      await ctx.ui.input(`请说明将 ${storyId} 标记为 ${outcome} 的理由`)
    )?.trim();
    return summary ? { kind: 'complete', outcome, summary } : undefined;
  }
  const confirmOption = `确认 AI 建议：${proposal.outcome} · ${proposal.summary}`;
  const continueOption = '继续澄清（拒绝本次建议）';
  const outcomeOptions = STORY_OUTCOMES.filter(
    (outcome) => outcome !== proposal.outcome,
  ).map((outcome) => `改为 ${outcome}`);
  const selected = await ctx.ui.select(
    `决定 ${proposal.story_id} 的最终澄清结论`,
    [confirmOption, continueOption, ...outcomeOptions],
  );
  if (!selected) return undefined;
  if (selected === confirmOption) {
    return {
      kind: 'complete',
      outcome: proposal.outcome,
      summary: proposal.summary,
    };
  }
  if (selected === continueOption) {
    const reason = (
      await ctx.ui.input('请说明仍需澄清的业务不确定性', '必须明确说明')
    )?.trim();
    return reason ? { kind: 'continue', reason } : undefined;
  }
  const outcome = STORY_OUTCOMES.find(
    (candidate) => selected === `改为 ${candidate}`,
  );
  if (!outcome) return undefined;
  const summary = (
    await ctx.ui.input(`请说明将 ${proposal.story_id} 标记为 ${outcome} 的理由`)
  )?.trim();
  return summary ? { kind: 'complete', outcome, summary } : undefined;
}

async function runPreparedPhaseFromCommand(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  preparation: PreparedPhaseRun,
  invocation: string,
): Promise<PhaseExecutionDetails | undefined> {
  const details = await runWithPhaseProgress(
    ctx,
    `Running Evidence ${preparation.phase} phase…`,
    (signal, onUpdate) =>
      executePreparedPhaseRun(ctx, preparation, {
        invocation,
        signal,
        onUpdate,
      }),
  );
  if (!details) {
    ctx.ui.notify(
      `Evidence ${preparation.phase} phase execution cancelled.`,
      'info',
    );
    return undefined;
  }
  pi.sendMessage({
    customType: PHASE_RESULT_MESSAGE_TYPE,
    content: details.output,
    display: true,
    details,
  });
  if (details.exitCode !== 0) {
    ctx.ui.notify(
      `Evidence ${details.phase} phase failed with exit ${details.exitCode}.`,
      'error',
    );
  }
  return details;
}

function parseArgs(args: string): {
  phase?: string;
  dryRun: boolean;
  storyId?: string;
  scenarioId?: string;
  rest: string;
} {
  const parts = args.split(/\s+/).filter(Boolean);
  const parsed = { dryRun: false, rest: '' } as {
    phase?: string;
    dryRun: boolean;
    storyId?: string;
    scenarioId?: string;
    rest: string;
  };
  const rest: string[] = [];
  for (const part of parts) {
    if (part === '--dry-run') parsed.dryRun = true;
    else if (part.startsWith('--phase='))
      parsed.phase = part.slice('--phase='.length);
    else if (part.startsWith('--story='))
      parsed.storyId = part.slice('--story='.length);
    else if (part.startsWith('--scenario='))
      parsed.scenarioId = part.slice('--scenario='.length);
    else if (PHASE_ORDER.includes(part as Phase)) parsed.phase = part;
    else rest.push(part);
  }
  parsed.rest = rest.join(' ');
  return parsed;
}

export function registerCommands(pi: ExtensionAPI): void {
  pi.registerCommand('evidence-status', {
    description:
      'Show Evidence Orchestrator phase, gate, artifacts, and code status',
    handler: async (_args, ctx) =>
      ctx.ui.notify(statusMarkdown(ctx.cwd), 'info'),
  });

  pi.registerCommand('evidence-new', {
    description: 'Select or create a GitHub Issue and start a new iteration',
    handler: async (_args, ctx) => {
      try {
        await waitForIdle(ctx);
        const issueNumber = await selectOrCreateGitHubIssue(
          pi,
          ctx,
          (message, operation) =>
            runWithLoader(ctx, message, (signal) => operation(signal)),
        );
        if (!issueNumber) {
          ctx.ui.notify('New iteration cancelled.', 'info');
          return;
        }
        const state = await runWithLoader(
          ctx,
          `正在冻结 GitHub Issue #${issueNumber} 并创建迭代…`,
          (signal) =>
            startIterationFromIssueAsync(
              ctx.cwd,
              { issueNumber },
              createGitHubCliRunner(pi),
              signal,
            ),
        );
        if (!state) {
          ctx.ui.notify('New iteration cancelled.', 'info');
          return;
        }
        ctx.ui.setStatus(STATUS_KEY, statusLabel(state));
        ctx.ui.notify(
          `Evidence Orchestrator started ${state.iteration_id} from ${state.requirement_source?.repository}#${state.requirement_source?.issue_number}. The Issue is frozen; run /evidence-run to prepare one Kickoff candidate, then /evidence-kickoff for the human decision.`,
          'info',
        );
      } catch (error) {
        ctx.ui.notify(
          error instanceof Error ? error.message : String(error),
          'error',
        );
      }
    },
  });

  pi.registerCommand('evidence-kickoff', {
    description:
      'Human-only decision for the pending Kickoff candidate: confirm, revise, split, defer, or stop',
    handler: async (args, ctx) => {
      try {
        await waitForIdle(ctx);
        const decision =
          parseKickoffDecision(args) ?? (await promptKickoffDecision(ctx));
        if (!decision) {
          ctx.ui.notify(
            'Kickoff decision cancelled; the candidate is unchanged.',
            'info',
          );
          return;
        }
        const state = decideKickoff(ctx.cwd, decision.action, decision.reason);
        ctx.ui.setStatus(STATUS_KEY, statusLabel(state));
        if (decision.action === 'confirmed') {
          ctx.ui.notify(
            `Human confirmed ${state.active_clarification_story?.story_id}; Kickoff is complete and Understand is ready.`,
            'info',
          );
        } else if (decision.action === 'revise') {
          ctx.ui.notify(
            'Human requested a revised Kickoff candidate. Run /evidence-run with the feedback before continuing.',
            'info',
          );
        } else {
          ctx.ui.notify(
            `Human chose ${decision.action}; this iteration is halted with the decision preserved.`,
            'info',
          );
        }
      } catch (error) {
        ctx.ui.notify(
          error instanceof Error ? error.message : String(error),
          'error',
        );
      }
    },
  });

  pi.registerCommand('evidence-scenario', {
    description:
      'Human-only Scenario decision: confirm one draft, continue TQA, split, or defer',
    handler: async (args, ctx) => {
      try {
        await waitForIdle(ctx);
        const decision =
          parseScenarioDecision(args) ?? (await promptScenarioDecision(ctx));
        if (!decision) {
          ctx.ui.notify(
            'Scenario decision cancelled; Understand is unchanged.',
            'info',
          );
          return;
        }
        const state = decideUnderstanding(ctx.cwd, decision);
        ctx.ui.setStatus(STATUS_KEY, statusLabel(state));
        if (decision.action === 'confirmed') {
          ctx.ui.notify(
            `Human confirmed ${state.confirmed_scenario?.story_id} / ${state.confirmed_scenario?.scenario_id}; model validation is next.`,
            'info',
          );
        } else if (decision.action === 'continue') {
          ctx.ui.notify(
            'Human requested more business understanding; TQA is ready to resume.',
            'info',
          );
        } else {
          ctx.ui.notify(
            `Human chose ${decision.action}; the single-Story iteration is halted.`,
            'info',
          );
        }
      } catch (error) {
        ctx.ui.notify(
          error instanceof Error ? error.message : String(error),
          'error',
        );
      }
    },
  });

  pi.registerCommand('evidence-modeling-profile', {
    description:
      'Human-only modeling Profile confirmation or override for the confirmed Scenario',
    handler: async (args, ctx) => {
      try {
        await waitForIdle(ctx);
        const decision =
          parseModelingProfileDecision(args) ??
          (await promptModelingProfileDecision(ctx));
        if (!decision) {
          ctx.ui.notify(
            'Modeling Profile decision cancelled; the proposal is unchanged.',
            'info',
          );
          return;
        }
        const state = confirmModelingProfile(ctx.cwd, decision);
        ctx.ui.setStatus(STATUS_KEY, statusLabel(state));
        ctx.ui.notify(
          `Human confirmed modeling Profile ${state.modeling_profile?.subject}/${state.modeling_profile?.method} with model_change_required=${state.modeling_profile?.model_change_required}. Run /evidence-run to expand the Scenario through this model.`,
          'info',
        );
      } catch (error) {
        ctx.ui.notify(
          error instanceof Error ? error.message : String(error),
          'error',
        );
      }
    },
  });

  pi.registerCommand('evidence-desk-check', {
    description:
      'Human-only Tasking decision: approve, revise, architecture_gap, process_gap, or scenario_gap',
    handler: async (args, ctx) => {
      try {
        await waitForIdle(ctx);
        const decision =
          parseDeskCheckDecision(args) ?? (await promptDeskCheckDecision(ctx));
        if (!decision) {
          ctx.ui.notify(
            'Desk Check cancelled; the Tasking draft is unchanged.',
            'info',
          );
          return;
        }
        const state = decideTasking(ctx.cwd, decision.action, decision.reason);
        ctx.ui.setStatus(STATUS_KEY, statusLabel(state));
        if (decision.action === 'approve') {
          ctx.ui.notify(
            `Human approved ${state.approved_test_plan_path}; Pair is ready for ${state.active_work_item?.story_id} / ${state.active_work_item?.scenario_id}.`,
            'info',
          );
        } else if (decision.action === 'scenario_gap') {
          ctx.ui.notify(
            'Desk Check routed the Scenario gap to Understand TQA.',
            'info',
          );
        } else {
          ctx.ui.notify(
            `Desk Check recorded ${decision.action}; run /evidence-run to revise Tasking knowledge and regenerate the plan.`,
            'info',
          );
        }
      } catch (error) {
        ctx.ui.notify(
          error instanceof Error ? error.message : String(error),
          'error',
        );
      }
    },
  });

  pi.registerCommand('evidence-pair', {
    description:
      'Human Navigator decision for Red acceptance or a return to test, implementation, Tasking, or quality-gate retry',
    handler: async (args, ctx) => {
      try {
        await waitForIdle(ctx);
        const decision =
          parsePairDecision(args) ?? (await promptPairDecision(ctx));
        if (!decision) {
          ctx.ui.notify('Pair decision cancelled; state is unchanged.', 'info');
          return;
        }
        const state =
          decision.kind === 'red'
            ? reviewPairRed(ctx.cwd, decision.failureKind, decision.reason)
            : navigatePair(ctx.cwd, decision.action, decision.reason);
        ctx.ui.setStatus(STATUS_KEY, statusLabel(state));
        ctx.ui.notify(
          `Pair decision recorded. ${pairNextInstruction(state)}.`,
          'info',
        );
      } catch (error) {
        ctx.ui.notify(
          error instanceof Error ? error.message : String(error),
          'error',
        );
      }
    },
  });

  pi.registerCommand('evidence-issue-sync', {
    description:
      'Refresh the active GitHub Issue snapshot while the iteration is in frame',
    handler: async (_args, ctx) => {
      try {
        const state = await runWithLoader(
          ctx,
          '正在刷新 GitHub Issue 快照…',
          (signal) =>
            syncIssueSourceAsync(ctx.cwd, createGitHubCliRunner(pi), signal),
        );
        if (!state) {
          ctx.ui.notify('Issue refresh cancelled.', 'info');
          return;
        }
        ctx.ui.notify(
          `Issue snapshot refreshed: ${state.requirement_source?.repository}#${state.requirement_source?.issue_number}.`,
          'info',
        );
      } catch (error) {
        ctx.ui.notify(
          error instanceof Error ? error.message : String(error),
          'error',
        );
      }
    },
  });

  pi.registerCommand('evidence-issue-status', {
    description:
      'Check whether the live GitHub Issue differs from its snapshot',
    handler: async (_args, ctx) => {
      try {
        const drift = await runWithLoader(
          ctx,
          '正在检查 GitHub Issue 是否变化…',
          (signal) =>
            checkIssueSourceDriftAsync(
              ctx.cwd,
              createGitHubCliRunner(pi),
              signal,
            ),
        );
        if (!drift) {
          ctx.ui.notify('Issue drift check cancelled.', 'info');
          return;
        }
        ctx.ui.notify(
          drift.changed
            ? `Issue changed after snapshot: ${drift.snapshot_hash} → ${drift.remote_hash}. Refresh in frame or start a new iteration.`
            : `Issue snapshot is current: ${drift.snapshot_hash}.`,
          drift.changed ? 'warning' : 'info',
        );
      } catch (error) {
        ctx.ui.notify(
          error instanceof Error ? error.message : String(error),
          'error',
        );
      }
    },
  });

  pi.registerCommand('evidence-gate', {
    description: 'Answer the pending gate: /evidence-gate [decision text]',
    handler: async (args, ctx) => {
      const state = readState(ctx.cwd);
      if (!state.pending_gate) return ctx.ui.notify('No pending gate.', 'info');
      try {
        answerGate(
          ctx.cwd,
          state.pending_gate,
          args.trim() || '通过，进入下一阶段',
        );
        ctx.ui.notify(`Gate answered: ${state.pending_gate}`, 'info');
      } catch (error) {
        ctx.ui.notify(
          error instanceof Error ? error.message : String(error),
          'error',
        );
      }
    },
  });

  pi.registerCommand('evidence-story', {
    description:
      'Select, resume, or switch to one US-xxx story and immediately run isolated clarification',
    handler: async (args, ctx) => {
      try {
        await waitForIdle(ctx);
        let storyId = args.trim().toUpperCase();
        if (!storyId) {
          storyId = (await selectClarificationStoryInteractively(ctx)) ?? '';
          if (!storyId) {
            ctx.ui.notify('Story selection cancelled.', 'info');
            return;
          }
        }
        const state = selectClarificationStory(ctx.cwd, storyId);
        const preparation = preparePhaseRun(ctx.cwd);
        if (isCompletedIteration(preparation)) {
          ctx.ui.notify(preparation.task, 'info');
          return;
        }
        ctx.ui.notify(
          `Selected clarification story ${state.active_clarification_story?.story_id}; running clarify now.`,
          'info',
        );
        await runPreparedPhaseFromCommand(
          pi,
          ctx,
          preparation,
          `/evidence-story ${storyId}`,
        );
      } catch (error) {
        ctx.ui.notify(
          error instanceof Error ? error.message : String(error),
          error instanceof PhaseRunBlockedError ? 'info' : 'error',
        );
      }
    },
  });

  pi.registerCommand('evidence-story-complete', {
    description:
      'Human-only decision for the active Story: complete directly, confirm, override, or continue',
    handler: async (args, ctx) => {
      try {
        await waitForIdle(ctx);
        const current = readState(ctx.cwd);
        if (current.workflow_version === 5) {
          ctx.ui.notify(
            'v5 Story understanding is decided through /evidence-scenario, not /evidence-story-complete.',
            'info',
          );
          return;
        }
        const activeStoryId = current.active_clarification_story?.story_id;
        if (!activeStoryId) {
          ctx.ui.notify('No clarification Story is active.', 'info');
          return;
        }
        const proposal = current.proposed_clarification_story_outcome;
        const decision =
          parseStoryDecision(args, proposal) ??
          (await promptStoryDecision(ctx, activeStoryId, proposal));
        if (!decision) {
          ctx.ui.notify(
            'Story decision cancelled; the clarification state is unchanged.',
            'info',
          );
          return;
        }
        if (decision.kind === 'complete') {
          const state = confirmClarificationStoryOutcome(
            ctx.cwd,
            decision.outcome,
            decision.summary,
          );
          const remaining = unresolvedClarificationStoryIds(ctx.cwd, state);
          ctx.ui.notify(
            `Human confirmed ${activeStoryId}=${decision.outcome}. Remaining stories: ${remaining.join(', ') || 'none'}.`,
            'info',
          );
          return;
        }

        if (!proposal) {
          throw new Error(
            'Cannot continue: there is no AI Story outcome proposal to reject.',
          );
        }
        continueClarificationStory(ctx.cwd);
        const preparation = preparePhaseRun(ctx.cwd, {
          instructions: `领域专家拒绝了 AI 的 ${proposal.outcome} 建议并要求继续澄清：${decision.reason}`,
        });
        if (isCompletedIteration(preparation)) {
          ctx.ui.notify(preparation.task, 'info');
          return;
        }
        ctx.ui.notify(
          `Human requested more clarification for ${proposal.story_id}; resuming clarify now.`,
          'info',
        );
        await runPreparedPhaseFromCommand(
          pi,
          ctx,
          preparation,
          `/evidence-story-complete continue ${decision.reason}`,
        );
      } catch (error) {
        ctx.ui.notify(
          error instanceof Error ? error.message : String(error),
          error instanceof PhaseRunBlockedError ? 'info' : 'error',
        );
      }
    },
  });

  pi.registerCommand('evidence-run', {
    description:
      'Run the current activity; v5 Pair advances at most one Driver or command checkpoint per invocation',
    handler: async (args, ctx) => {
      const parsed = parseArgs(args);
      try {
        await waitForIdle(ctx);
        const current = readState(ctx.cwd);
        if (
          current.phase === 'clarify' &&
          !current.active_clarification_story &&
          !current.pending_gate &&
          !current.halted &&
          !parsed.dryRun &&
          !parsed.storyId &&
          listSelectableClarificationStories(ctx.cwd).length > 0
        ) {
          const selectedStory =
            await selectClarificationStoryInteractively(ctx);
          if (!selectedStory) {
            ctx.ui.notify('Story selection cancelled.', 'info');
            return;
          }
          selectClarificationStory(ctx.cwd, selectedStory);
        }
        const preparation = preparePhaseRun(ctx.cwd, {
          requestedPhase: parsed.phase,
          instructions: parsed.rest,
          storyId: parsed.storyId,
          scenarioId: parsed.scenarioId,
        });
        if (parsed.dryRun || isCompletedIteration(preparation)) {
          ctx.ui.notify(preparation.task, 'info');
          return;
        }

        await runPreparedPhaseFromCommand(
          pi,
          ctx,
          preparation,
          `/evidence-run ${args}`.trim(),
        );
      } catch (error) {
        ctx.ui.notify(
          error instanceof Error ? error.message : String(error),
          error instanceof PhaseRunBlockedError ? 'info' : 'error',
        );
      }
    },
  });
}
