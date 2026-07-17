import { artifactRelativePath } from '../../../iteration/artifact-layout';
import {
  completedWorkItem,
  requireCompletedWorkItem,
  type WorkflowState,
} from '../../../iteration/state';
import { readState } from '../../../iteration/state-repository';
import {
  buildPairDriverTask,
  buildPairRedReviewTask,
  pairDeterministicAction,
  pairDriverMode,
  pairDriverWriteRoots,
  pairNextInstruction,
} from '../../../loops/pair/pair-session';

export const MAX_ACTIVITY_CAPSULE_BYTES = 16 * 1024;

export interface ActivityContextCapsule {
  identity: string[];
  decision: string[];
  authority: string[];
  inputs: string[];
  work_unit: string[];
  boundaries: string[];
  output: string[];
}

const ROLE_TOOLS: Record<string, readonly string[]> = {
  'requirements-analyst': [
    'read',
    'evidence_orchestrator_propose_kickoff',
    'evidence_orchestrator_ask_question',
    'evidence_orchestrator_propose_scenarios',
  ],
  'domain-modeler': [
    'read',
    'evidence_orchestrator_propose_modeling_profile',
    'evidence_orchestrator_record_model_analysis',
  ],
  'model-challenger': ['read', 'evidence_orchestrator_record_model_challenge'],
  architect: ['read', 'evidence_orchestrator_propose_tasking'],
  'test-driver': ['read', 'edit', 'write'],
  'production-driver': ['read', 'edit', 'write'],
  'red-reviewer': ['read'],
  'showcase-reviewer': ['read', 'evidence_orchestrator_record_showcase_review'],
  'respond-learner': ['read', 'evidence_orchestrator_propose_response'],
  'change-explainer': ['read'],
  'inbox-analyst': ['read', 'evidence_orchestrator_propose_inbox_stories'],
};

function unique(values: readonly (string | undefined)[]): string[] {
  return [
    ...new Set(values.filter((value): value is string => Boolean(value))),
  ];
}

function section(title: string, values: readonly string[]): string {
  return `## ${title}\n${values.length ? values.map((value) => `- ${value}`).join('\n') : '- none'}`;
}

/** Render one deterministic high-density capsule and reject, rather than truncate, overflow. */
export function renderActivityContextCapsule(
  capsule: ActivityContextCapsule,
): string {
  const rendered = [
    '# Evidence Activity Context Capsule v1',
    '',
    section('Identity', capsule.identity),
    '',
    section('Decision', capsule.decision),
    '',
    section('Authority', capsule.authority),
    '',
    section('Inputs', capsule.inputs),
    '',
    section('Work unit', capsule.work_unit),
    '',
    section('Boundaries', capsule.boundaries),
    '',
    section('Output', capsule.output),
  ].join('\n');
  const bytes = Buffer.byteLength(rendered, 'utf8');
  if (bytes > MAX_ACTIVITY_CAPSULE_BYTES) {
    throw new Error(
      `Evidence activity Context Capsule is ${bytes} UTF-8 bytes; maximum is ${MAX_ACTIVITY_CAPSULE_BYTES}. Split the activity or reference a disk artifact.`,
    );
  }
  return rendered;
}

export function taskWithContextCapsule(
  capsule: ActivityContextCapsule,
  instructions: string,
): string {
  return `${renderActivityContextCapsule(capsule)}\n\n# Activity Instructions\n${instructions.trim()}\n`;
}

export function activityAgentForState(
  state: WorkflowState,
): string | undefined {
  if (state.loop === 'kickoff') return 'requirements-analyst';
  if (state.loop === 'understand') {
    if (state.understand_stage === 'tqa') return 'requirements-analyst';
    if (
      state.modeling_stage === 'model_review' ||
      (state.modeling_stage === 'expansion' &&
        state.modeling_profile?.method === 'none')
    ) {
      return undefined;
    }
    return state.modeling_stage === 'candidate_ready'
      ? 'model-challenger'
      : 'domain-modeler';
  }
  if (state.loop === 'tasking') return 'architect';
  if (state.loop === 'pair') {
    if (
      state.pair_session?.checkpoint === 'red_observed' &&
      state.pair_session.red_observation?.accepted !== true
    ) {
      return 'red-reviewer';
    }
    const mode = pairDriverMode(state);
    return mode === 'test'
      ? 'test-driver'
      : mode
        ? 'production-driver'
        : undefined;
  }
  if (state.loop === 'showcase') return 'showcase-reviewer';
  if (state.loop === 'respond') return 'respond-learner';
  return undefined;
}

/** Logical inputs whose existence is checked before dispatch. */
export function activityRequiredInputs(state: WorkflowState): string[] {
  if (state.loop === 'kickoff') {
    const feedback = state.feedback_history?.at(-1);
    const revisionStoryId = [...(state.kickoff_decisions ?? [])]
      .reverse()
      .find(({ story_id }) => story_id)?.story_id;
    const storyRevisionInputs =
      feedback?.target === 'story' &&
      feedback.to_loop === 'kickoff' &&
      revisionStoryId
        ? [
            `artifacts/01-requirements/stories/${revisionStoryId}.md`,
            `artifacts/01-requirements/clarifications/${revisionStoryId}.json`,
          ]
        : [];
    const completed = completedWorkItem(state);
    const completedScopeInputs = completed
      ? [
          `artifacts/01-requirements/stories/${completed.story_id}.md`,
          ...completed.scenarios.map(({ artifact_path }) => artifact_path),
        ]
      : [];
    return [
      'artifacts/00-user-input/requirements.md',
      'docs/product/personas.md',
      'docs/product/business-context.md',
      'docs/product/user-journeys.md',
      'docs/product/story-map.md',
      ...completedScopeInputs,
      ...storyRevisionInputs,
    ];
  }
  if (state.loop === 'understand' && state.understand_stage === 'tqa') {
    return [
      'artifacts/00-user-input/requirements.md',
      'artifacts/01-requirements/problem-statement.md',
      `artifacts/01-requirements/stories/${state.active_clarification_story?.story_id ?? 'missing'}.md`,
      'docs/product/business-context.md',
      'docs/product/user-journeys.md',
      'docs/product/story-map.md',
    ];
  }
  if (state.loop === 'understand') {
    const noModelImpact =
      state.modeling_stage === 'expansion' &&
      state.modeling_profile?.method === 'none';
    return [
      ...(state.confirmed_scenarios?.map(
        ({ artifact_path }) => artifact_path,
      ) ?? ['artifacts/01-requirements/examples/missing.md']),
      ...(noModelImpact
        ? []
        : [
            '.evidence/model.json',
            '.evidence/entities/',
            '.evidence/associations/',
          ]),
      ...(state.modeling_stage === 'candidate_ready'
        ? [
            state.model_projection?.mermaid_path ?? 'missing-model.mmd',
            state.model_projection?.glossary_path ?? 'missing-glossary.md',
            state.model_projection?.context_path ?? 'missing-context.json',
          ]
        : []),
    ];
  }
  if (state.loop === 'tasking') {
    return [
      ...(state.confirmed_scenarios?.map(
        ({ artifact_path }) => artifact_path,
      ) ?? ['artifacts/01-requirements/examples/missing.md']),
      state.model_expansion_path ??
        'artifacts/02-domain-model/model-expansions/missing.json',
      (state.modeling_profile?.method === 'none'
        ? state.model_expansion_path
        : state.model_decisions?.at(-1)?.artifact_path) ??
        'artifacts/02-domain-model/model-decisions/missing.json',
      'docs/architecture/context-map.md',
      'docs/architecture/module-structure.md',
      'docs/architecture/tech-stack.md',
      'docs/architecture/test-strategy.md',
      'docs/architecture/test-doubles.md',
      'contracts/api.yaml',
      'engineering/evidence-orchestrator/runtime-contexts.json',
      'engineering/evidence-orchestrator/test-processes/',
      'engineering/evidence-orchestrator/definition-of-done.md',
    ];
  }
  if (state.loop === 'pair') {
    return [
      ...(state.confirmed_scenarios?.map(
        ({ artifact_path }) => artifact_path,
      ) ?? ['artifacts/01-requirements/examples/missing.md']),
      state.model_expansion_path ??
        'artifacts/02-domain-model/model-expansions/missing.json',
      (state.modeling_profile?.method === 'none'
        ? state.model_expansion_path
        : state.model_decisions?.at(-1)?.artifact_path) ??
        'artifacts/02-domain-model/model-decisions/missing.json',
      state.tasking_candidate?.test_list_path ??
        'artifacts/04-planning/test-list.md',
      state.tasking_candidate?.task_list_path ??
        'artifacts/04-planning/task-list.md',
      state.approved_test_plan_path ?? 'artifacts/04-planning/test-plan.json',
      ...(state.active_work_item?.test_plan.processes.map(({ path }) => path) ??
        []),
      'engineering/evidence-orchestrator/definition-of-done.md',
    ];
  }
  if (state.loop === 'showcase') {
    return [
      ...(state.confirmed_scenarios?.map(
        ({ artifact_path }) => artifact_path,
      ) ?? ['artifacts/01-requirements/examples/missing.md']),
      state.model_expansion_path ??
        'artifacts/02-domain-model/model-expansions/missing.json',
      state.approved_test_plan_path ?? 'artifacts/04-planning/test-plan.json',
      state.active_work_item
        ? `artifacts/05-code/${state.active_work_item.story_id}/manifest.json`
        : 'artifacts/05-code/missing/manifest.json',
      'engineering/evidence-orchestrator/definition-of-done.md',
    ];
  }
  if (state.loop === 'respond') {
    return [
      ...(state.confirmed_scenarios?.map(
        ({ artifact_path }) => artifact_path,
      ) ?? ['artifacts/01-requirements/examples/missing.md']),
      state.active_work_item
        ? `artifacts/05-code/${state.active_work_item.story_id}/manifest.json`
        : 'artifacts/05-code/missing/manifest.json',
      state.showcase_reviews?.at(-1)?.artifact_path ??
        'artifacts/06-review/missing-review.json',
      state.showcase_product_observations?.at(-1)?.artifact_path ??
        'artifacts/06-review/missing-product-observation.jsonl',
      ...(state.showcase_evaluation_observations?.length
        ? [
            state.showcase_evaluation_observations.at(-1)?.artifact_path ??
              'artifacts/06-review/missing-evaluation.jsonl',
          ]
        : []),
      'docs/knowledge-governance.md',
      'engineering/evidence-orchestrator/definition-of-done.md',
    ];
  }
  return [];
}

function exactInputPath(state: WorkflowState, path: string): string {
  return path.startsWith(`artifacts/iterations/${state.iteration_id}/`)
    ? path
    : artifactRelativePath(state, path);
}

function skillInputs(state: WorkflowState): string[] {
  if (state.loop === 'understand' && state.understand_stage === 'tqa') {
    return ['.pi/skills/evidence-story-tqa/SKILL.md'];
  }
  if (state.loop === 'understand' && state.modeling_stage === 'profile') {
    return ['.pi/skills/evidence-modeling-router/SKILL.md'];
  }
  if (
    state.loop === 'understand' &&
    ['expansion', 'candidate_ready'].includes(state.modeling_stage ?? '') &&
    state.modeling_profile?.method !== 'none'
  ) {
    return [
      '.pi/skills/evidence-model-expansion/SKILL.md',
      ...(state.modeling_profile?.subject === 'business' &&
      state.modeling_profile.method === 'eight_x_flow'
        ? ['.pi/skills/evidence-8x-flow/SKILL.md']
        : []),
    ];
  }
  if (state.loop === 'tasking') {
    return ['.pi/skills/evidence-test-process/SKILL.md'];
  }
  if (state.loop === 'pair') {
    return ['.pi/skills/evidence-pairing/SKILL.md'];
  }
  if (state.loop === 'showcase') {
    return [
      '.pi/skills/evidence-test-process/SKILL.md',
      '.pi/skills/evidence-pairing/SKILL.md',
    ];
  }
  if (state.loop === 'respond') {
    return ['engineering/evidence-orchestrator/working-knowledge-catalog.json'];
  }
  return [];
}

function capsuleInputs(state: WorkflowState): string[] {
  const tqaHistory =
    state.loop === 'understand' &&
    state.understand_stage === 'tqa' &&
    state.active_clarification_story
      ? [
          exactInputPath(
            state,
            `artifacts/01-requirements/clarifications/${state.active_clarification_story.story_id}.json`,
          ) + ' (read if present; canonical clarification history)',
        ]
      : [];
  const showcaseEvidence =
    state.loop === 'showcase' || state.loop === 'respond'
      ? [
          ...(state.showcase_product_observations ?? []).map(
            ({ artifact_path }) => exactInputPath(state, artifact_path),
          ),
          ...(state.showcase_evaluation_observations ?? []).map(
            ({ artifact_path }) => exactInputPath(state, artifact_path),
          ),
          ...(state.showcase_risk_decisions?.length
            ? [
                exactInputPath(
                  state,
                  'artifacts/06-review/showcase-risks.jsonl',
                ),
              ]
            : []),
          ...(state.showcase_decisions ?? []).map(({ artifact_path }) =>
            exactInputPath(state, artifact_path),
          ),
        ]
      : [];
  return unique([
    ...activityRequiredInputs(state).map((path) => exactInputPath(state, path)),
    ...skillInputs(state),
    ...tqaHistory,
    ...showcaseEvidence,
  ]);
}

function storyId(state: WorkflowState): string | undefined {
  return (
    state.active_work_item?.story_id ??
    state.active_clarification_story?.story_id ??
    state.confirmed_scenarios?.[0]?.story_id ??
    state.completed_work_items?.at(-1)?.story_id
  );
}

function stage(state: WorkflowState): string {
  if (state.loop === 'kickoff') {
    return state.kickoff_candidate ? 'candidate_review' : 'candidate_drafting';
  }
  if (state.loop === 'understand') {
    return state.modeling_stage ?? state.understand_stage ?? 'unset';
  }
  if (state.loop === 'tasking') return state.tasking_stage ?? 'unset';
  if (state.loop === 'pair') return state.pair_session?.checkpoint ?? 'unset';
  if (state.loop === 'showcase') return state.showcase_stage ?? 'unset';
  if (state.loop === 'respond') return state.respond_stage ?? 'unset';
  return 'complete';
}

function requestedOutcome(cwd: string, state: WorkflowState): string {
  if (state.loop === 'complete') return 'stop; the iteration is complete';
  if (state.loop === 'kickoff')
    return 'record one replacement Kickoff candidate';
  if (state.loop === 'understand' && state.understand_stage === 'tqa') {
    return 'record exactly one next TQA question or one complete Scenario Set';
  }
  if (state.loop === 'understand' && state.modeling_stage === 'profile') {
    return 'record one modeling Profile proposal';
  }
  if (state.loop === 'understand' && state.modeling_stage === 'expansion') {
    return state.modeling_profile?.method === 'none'
      ? 'deterministically record no canonical model impact'
      : 'record one joint model expansion for the complete Scenario Set';
  }
  if (
    state.loop === 'understand' &&
    state.modeling_stage === 'candidate_ready'
  ) {
    return 'record one independent model challenge';
  }
  if (state.loop === 'tasking') {
    return 'record one reviewable test/process/task proposal';
  }
  if (state.loop === 'pair') {
    const role = activityAgentForState(state);
    if (role === 'test-driver') return 'write one minimal behavior test';
    if (role === 'red-reviewer') return 'classify one observed Red';
    if (role === 'production-driver') {
      return pairDriverMode(state) === 'refactor'
        ? 'perform one bounded process-step Refactor or report no-op'
        : 'write one minimal Green implementation';
    }
    return `execute one locked deterministic Pair checkpoint: ${pairDeterministicAction(cwd, state) ?? state.pair_session?.checkpoint ?? 'none'}`;
  }
  if (state.loop === 'showcase') {
    return state.showcase_stage === 'reviewing'
      ? 'record one independent Story Showcase review'
      : 'execute the locked Showcase Q2 observation';
  }
  return 'record one knowledge response and one next Probe proposal';
}

function authorityFacts(state: WorkflowState): string[] {
  const intake = state.intake_snapshot;
  const modelDecision = state.model_decisions?.at(-1);
  const deskCheck = [...(state.desk_check_decisions ?? [])]
    .reverse()
    .find(({ action }) => action === 'approve');
  const showcaseDecision = state.showcase_decisions?.at(-1);
  return unique([
    intake
      ? `frozen_intake=${intake.candidate_id} content_sha256=${intake.content_sha256}`
      : undefined,
    ...(intake?.source_revisions.map(
      ({ inbox_id, revision_sha256, snapshot_sha256 }) =>
        `source_revision=${inbox_id} revision_sha256=${revision_sha256} snapshot_sha256=${snapshot_sha256}`,
    ) ?? []),
    state.confirmed_scenarios?.length
      ? `human_confirmed_scenarios=${state.confirmed_scenarios
          .map(({ scenario_id }) => scenario_id)
          .join(',')}`
      : undefined,
    state.modeling_profile
      ? `human_modeling_profile=${state.modeling_profile.subject}/${state.modeling_profile.method} model_change_required=${state.modeling_profile.model_change_required}`
      : undefined,
    modelDecision
      ? `human_model_decision=${modelDecision.artifact_path} projection_sha256=${modelDecision.projection_sha256} expansion_sha256=${modelDecision.model_expansion_sha256}`
      : undefined,
    state.tasking_candidate
      ? `tasking_candidate=${state.tasking_candidate.candidate_path} sha256=${state.tasking_candidate.candidate_sha256}`
      : undefined,
    deskCheck?.candidate_sha256
      ? `human_desk_check=${deskCheck.artifact_path} candidate_sha256=${deskCheck.candidate_sha256}`
      : undefined,
    state.approved_test_plan_path && state.approved_test_plan_sha256
      ? `approved_test_plan=${state.approved_test_plan_path} sha256=${state.approved_test_plan_sha256}`
      : undefined,
    state.active_work_item?.git_baseline
      ? `git_baseline=${state.active_work_item.git_baseline}`
      : undefined,
    state.pair_session?.coding_decision
      ? `human_coding_approval=${state.pair_session.coding_decision.artifact_path} manifest_sha256=${state.pair_session.coding_decision.execution_manifest_sha256}`
      : undefined,
    showcaseDecision
      ? `human_showcase_decision=${showcaseDecision.action} artifact=${showcaseDecision.artifact_path}${showcaseDecision.review_artifact_sha256 ? ` review_sha256=${showcaseDecision.review_artifact_sha256}` : ''}`
      : undefined,
    state.understanding_decisions?.at(-1)?.action === 'continue'
      ? `human_scenario_feedback=${state.understanding_decisions.at(-1)?.reason ?? 'continue TQA'}`
      : undefined,
  ]);
}

function workUnit(state: WorkflowState): string[] {
  const pair = state.pair_session;
  if (pair) {
    return [
      `task_id=${pair.task_id}`,
      `test_id=${pair.test_id}`,
      `process_id=${pair.process_id}`,
      `step_id=${pair.step_id}`,
    ];
  }
  return unique([
    storyId(state) ? `story_id=${storyId(state)}` : undefined,
    state.confirmed_scenarios?.length
      ? `scenario_ids=${state.confirmed_scenarios
          .map(({ scenario_id }) => scenario_id)
          .join(',')}`
      : undefined,
  ]);
}

function outputContract(state: WorkflowState): string[] {
  const role = activityAgentForState(state);
  if (role === 'test-driver') {
    return [
      'report only changed test paths, assertions, and expected behavior failure',
      'stop immediately after one minimal test edit',
    ];
  }
  if (role === 'production-driver') {
    return [
      'report only changed production paths and the bounded Green/Refactor result',
      'stop immediately after this checkpoint',
    ];
  }
  if (role === 'red-reviewer') {
    return [
      'exact schema: {"failureKind":"behavior|compile|dependency|configuration|network|fixture|other","reason":"..."}',
      'return one JSON line and stop',
    ];
  }
  const toolByRole: Record<string, string> = {
    'requirements-analyst':
      state.loop === 'kickoff'
        ? 'evidence_orchestrator_propose_kickoff'
        : 'evidence_orchestrator_ask_question or evidence_orchestrator_propose_scenarios',
    'domain-modeler':
      state.modeling_stage === 'profile'
        ? 'evidence_orchestrator_propose_modeling_profile'
        : 'evidence_orchestrator_record_model_analysis',
    'model-challenger': 'evidence_orchestrator_record_model_challenge',
    architect: 'evidence_orchestrator_propose_tasking',
    'showcase-reviewer': 'evidence_orchestrator_record_showcase_review',
    'respond-learner': 'evidence_orchestrator_propose_response',
  };
  return role
    ? [`call exactly once: ${toolByRole[role]}`, 'stop after the tool call']
    : ['controller performs only the named deterministic action and stops'];
}

export function buildActivityContextCapsule(
  cwd: string,
  state: WorkflowState,
  extra = '',
): ActivityContextCapsule {
  const role = activityAgentForState(state);
  const mode = state.loop === 'pair' ? pairDriverMode(state) : undefined;
  const writeRoots =
    role === 'test-driver' || role === 'production-driver'
      ? pairDriverWriteRoots(cwd, state, mode ?? 'implementation')
      : [];
  return {
    identity: unique([
      `iteration_id=${state.iteration_id}`,
      storyId(state) ? `story_id=${storyId(state)}` : undefined,
      state.confirmed_scenarios?.length
        ? `scenario_ids=${state.confirmed_scenarios
            .map(({ scenario_id }) => scenario_id)
            .join(',')}`
        : undefined,
    ]),
    decision: unique([
      `loop=${state.loop}`,
      `stage=${stage(state)}`,
      state.pair_session
        ? `checkpoint=${state.pair_session.checkpoint}`
        : undefined,
      `requested_outcome=${requestedOutcome(cwd, state)}`,
      extra.trim() ? `additional_instruction=${extra.trim()}` : undefined,
    ]),
    authority: authorityFacts(state),
    inputs: capsuleInputs(state),
    work_unit: workUnit(state),
    boundaries: [
      `role=${role ?? 'deterministic-controller'}`,
      `tools=${role ? (ROLE_TOOLS[role] ?? []).join(',') : 'none'}`,
      'read_roots=repository root plus exact Inputs; deny .git, env, credentials, secrets, PEM and key material',
      `write_mode=${mode ?? 'none'}`,
      `write_roots=${writeRoots.length ? writeRoots.join(',') : 'none'}`,
      'forbidden=unlisted tools, Bash, commits, human decisions, workflow advancement, protected path writes',
    ],
    output: outputContract(state),
  };
}

function activityInstructions(cwd: string, state: WorkflowState): string {
  if (state.loop === 'complete') {
    return '读取 07-learning/next-iteration.md；由人类把 Next Probe 收集进 Inbox 后创建新迭代。不得扩写已完成 iteration。';
  }
  if (state.loop === 'kickoff') {
    return '从冻结 Intake、稳定产品上下文及 Capsule 中的人工反馈提出一张替代 Kickoff 候选。保留一个问题、一个角色、一个可协商目标、一个价值和当前认知行为；不分配 US-xxx、不扩展 backlog、不写权威产品知识。';
  }
  if (state.loop === 'understand' && state.understand_stage === 'tqa') {
    return '读取并遵守 evidence-story-tqa Skill。只处理活动 Story；使用 clarification history 工件恢复事实。下一步只能记录一个高价值问题，或在无剩余高价值不确定性时记录完整 Scenario Set。人类通过 /evidence-scenario 决定边界。';
  }
  if (state.loop === 'understand' && state.understand_stage === 'modeling') {
    if (state.modeling_stage === 'profile') {
      return '读取并遵守 evidence-modeling-router Skill。基于完整 Scenario Set 提出 subject、method 与 modelChangeRequired；不得编辑 .evidence。';
    }
    if (state.modeling_stage === 'expansion') {
      if (state.modeling_profile?.method === 'none') {
        return '执行无模型影响确认：确定性记录全部 Scenario 不需要 canonical model 语义或变更，然后进入 Tasking。不得启动 Model Builder、Model Challenger 或修改 .evidence。';
      }
      return `读取并遵守 evidence-model-expansion Skill${state.modeling_profile?.subject === 'business' && state.modeling_profile.method === 'eight_x_flow' ? ' 与 evidence-8x-flow Skill' : ''}。逐一展开全部 Scenario 并检查跨场景一致性；model_change_required=false 只能提交 operations=[]，true 必须提交一组最小非空候选 operations。不得直接编辑 .evidence、自我挑战或推进下一动作。`;
    }
    if (state.modeling_stage === 'candidate_ready') {
      const projection = state.model_projection;
      if (!projection)
        throw new Error('Model Challenger requires projections.');
      return `读取 evidence-model-expansion Skill 的 Challenger 规则${state.modeling_profile?.subject === 'business' && state.modeling_profile.method === 'eight_x_flow' ? ' 与 evidence-8x-flow Skill' : ''}。独立验证全部当前 Scenario 与历史回归场景。预检 regression=${projection.regression_failures.length ? projection.regression_failures.join('；') : '通过'}；method=${projection.method_failures.length ? projection.method_failures.join('；') : '通过'}。不得修复候选或修改任何文件。`;
    }
    throw new Error(
      `Modeling stage ${state.modeling_stage ?? 'unset'} cannot run an agent task.`,
    );
  }
  if (state.loop === 'tasking') {
    if (!(state.confirmed_scenarios?.length && state.model_expansion_path)) {
      throw new Error('Tasking requires a Scenario Set and model expansion.');
    }
    const noModelImpact = state.modeling_profile?.method === 'none';
    const gap = state.tasking_gap;
    return `读取并遵守 evidence-test-process Skill。为完整 Scenario Set 生成一次 Q2/Q1 test-list、唯一 v3 process 计划和依赖有序 task-list。每个 Then 有 Q2 覆盖，共享 Q1 去重；每个 TEST 绑定安全 testFilter${noModelImpact ? ' 并保持空 modelRefs' : '、确认模型 id'}，模板要求时绑定真实 Nx projectId；runtime 完整列出允许修改的 projects。${gap ? `当前知识缺口：${gap.kind} · ${gap.reason}。` : ''}等待人类 /evidence-desk-check；不得写代码。`;
  }
  if (state.loop === 'pair') {
    if (
      state.tasking_stage !== 'approved' ||
      !state.approved_test_plan_path ||
      !state.active_work_item ||
      !state.pair_session
    ) {
      throw new Error('Pair requires an approved Tasking plan.');
    }
    if (
      state.pair_session.checkpoint === 'red_observed' &&
      state.pair_session.red_observation?.accepted !== true
    ) {
      return buildPairRedReviewTask(cwd, state);
    }
    const mode = pairDriverMode(state);
    if (mode) return buildPairDriverTask(cwd, state, mode);
    const action = pairDeterministicAction(cwd, state);
    if (action) {
      return `读取并遵守 evidence-pairing Skill；只执行锁定的 ${action} 命令并记录真实结果后停止。`;
    }
    return state.pair_session.checkpoint === 'quality_gates_passed'
      ? `自动编码与质量门禁已完成。等待人类 Story 级编码批准：${pairNextInstruction(state)}。`
      : `自动化位于 ${state.pair_session.checkpoint}：${pairNextInstruction(state)}。`;
  }
  if (state.loop === 'showcase') {
    if (!state.active_work_item || state.showcase_stage !== 'reviewing') {
      throw new Error(
        'Showcase Reviewer requires passed Q2, explicit Q3/Q4 decisions, and reviewing stage.',
      );
    }
    requireCompletedWorkItem(state);
    return '读取已完成 Story 的全部 Scenario、模型证据、批准计划、execution manifest、逐 Scenario 人工产品观察与 Q3/Q4 评价证据。区分 observed facts、product/domain feedback、technical quality feedback 与 unresolved assumptions；只记录一次独立 review，不修改文件或替人决定。';
  }
  if (state.loop === 'respond') {
    const review = state.showcase_reviews?.at(-1);
    if (
      !state.active_work_item ||
      state.showcase_stage !== 'accepted' ||
      state.respond_stage !== 'drafting' ||
      !review
    ) {
      throw new Error('Respond requires an accepted Showcase.');
    }
    requireCompletedWorkItem(state);
    return '比较确认 Scenario、建模证据、execution manifest、独立 review、人工产品观察、Q3/Q4 评价与 Showcase 决定。只对实际使用且验证的知识提出 promotions（允许带理由的空列表）和一个 next Probe；不得编辑 canonical knowledge 或完成迭代。';
  }
  throw new Error(`Unsupported workflow activity: ${state.loop}.`);
}

/** Build one activity task; long methods remain progressively loaded from exact Skill paths. */
export function buildActivityTask(cwd: string, extra = ''): string {
  const state = readState(cwd);
  return taskWithContextCapsule(
    buildActivityContextCapsule(cwd, state, extra),
    activityInstructions(cwd, state),
  );
}
