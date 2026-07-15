import { artifactRelativePath } from '../iteration/artifact-layout';
import { readState } from '../iteration/state-repository';
import {
  buildPairDriverTask,
  pairDeterministicAction,
  pairDriverMode,
  pairNextInstruction,
} from '../testing/pairing';

/** Build one activity task; methods remain in progressively loaded Skills. */
export function buildActivityTask(cwd: string, extra = ''): string {
  const state = readState(cwd);
  if (state.loop === 'complete') {
    return 'Evidence Orchestrator 本轮已完成。读取 07-learning/next-iteration.md；由人类更新 GitHub Issue 后用 /evidence-new 创建新的冻结快照，不扩写旧 iteration。';
  }
  if (state.loop === 'kickoff') {
    const requirements = artifactRelativePath(
      state,
      'artifacts/00-user-input/requirements.md',
    );
    return `执行 Evidence Orchestrator v5 Kickoff 候选准备。

上下文：
- ${requirements}
- docs/product/personas.md
- docs/product/business-context.md
- docs/product/user-journeys.md
- docs/product/story-map.md

任务：从冻结 Issue 提出一个问题、一个角色、一个可协商目标、一个价值和当前认知行为。只调用 evidence_orchestrator_propose_kickoff 一次后停止；不分配 US-xxx、不批量建卡、不写权威产品知识。

额外用户指令：
${extra || '（无）'}
`;
  }
  if (state.loop === 'understand' && state.understand_stage === 'tqa') {
    const storyId = state.active_clarification_story?.story_id;
    if (!storyId) throw new Error('Understand TQA requires one active Story.');
    return `执行 Evidence Orchestrator v5 Understand TQA：${storyId}。

方法：加载并遵守 .pi/skills/evidence-story-tqa/SKILL.md。
上下文：
- ${artifactRelativePath(state, 'artifacts/01-requirements/problem-statement.md')}
- ${artifactRelativePath(state, `artifacts/01-requirements/stories/${storyId}.md`)}
- ${artifactRelativePath(state, `artifacts/01-requirements/clarifications/${storyId}.json`)}（存在时）
- docs/product/business-context.md
- docs/product/user-journeys.md

任务：只处理 ${storyId}。下一步只能调用 evidence_orchestrator_ask_question 或 evidence_orchestrator_propose_scenarios 一次并停止；人类通过 /evidence-scenario 决定确认、继续、拆分或延期。

额外用户指令：
${extra || '（无）'}
`;
  }
  if (state.loop === 'understand' && state.understand_stage === 'modeling') {
    const scenario = state.confirmed_scenario;
    if (!scenario) throw new Error('Modeling requires a confirmed Scenario.');
    if (state.modeling_stage === 'profile') {
      return `执行 Evidence Orchestrator v5 建模 Profile：${scenario.story_id} / ${scenario.scenario_id}。

方法：加载并遵守 .pi/skills/evidence-modeling-router/SKILL.md。
上下文：${scenario.artifact_path}、.evidence/model.json、.evidence/entities/、.evidence/associations/。
任务：提出 subject、method 与 modelChangeRequired，只调用 evidence_orchestrator_propose_modeling_profile 一次后停止，等待人类 /evidence-modeling-profile。不得编辑 .evidence。

额外用户指令：
${extra || '（无）'}
`;
    }
    if (state.modeling_stage === 'expansion') {
      return `执行 Evidence Orchestrator v5 模型展开：${scenario.story_id} / ${scenario.scenario_id}。

方法：加载 .pi/skills/evidence-model-expansion/SKILL.md。${state.modeling_profile?.subject === 'business' && state.modeling_profile.method === 'eight_x_flow' ? '本 Profile 另加载 .pi/skills/evidence-8x-flow/SKILL.md。' : '本 Profile 不加载 8X Skill。'}
人类确认 Profile：${JSON.stringify(state.modeling_profile)}
上下文：${scenario.artifact_path}、.evidence/model.json、.evidence/entities/、.evidence/associations/。
任务：只调用 evidence_orchestrator_record_model_analysis 一次后停止。不得直接 edit/write .evidence、自我挑战或推进下一动作。

额外用户指令：
${extra || '（无）'}
`;
    }
    if (state.modeling_stage === 'candidate_ready') {
      const projection = state.model_projection;
      if (!projection)
        throw new Error('Model Challenger requires projections.');
      return `执行 Evidence Orchestrator v5 独立 Model Challenge：${scenario.story_id} / ${scenario.scenario_id}。

方法：加载 .pi/skills/evidence-model-expansion/SKILL.md 的 Challenger 部分。${state.modeling_profile?.subject === 'business' && state.modeling_profile.method === 'eight_x_flow' ? '本 Profile 另加载 .pi/skills/evidence-8x-flow/SKILL.md。' : '本 Profile 不加载 8X Skill。'}
只读输入：${projection.mermaid_path}、${projection.glossary_path}、${projection.context_path}。
预检：regression=${projection.regression_failures.length ? projection.regression_failures.join('；') : '通过'}；method=${projection.method_failures.length ? projection.method_failures.join('；') : '通过'}。
任务：只调用 evidence_orchestrator_record_model_challenge 一次并停止。不得修改 .evidence、候选、Scenario 或代码。

额外用户指令：
${extra || '（无）'}
`;
    }
    throw new Error(
      `Modeling stage ${state.modeling_stage ?? 'unset'} cannot run an agent task.`,
    );
  }
  if (state.loop === 'tasking') {
    const scenario = state.confirmed_scenario;
    if (!scenario || !state.model_expansion_path) {
      throw new Error('Tasking requires a Scenario and model expansion.');
    }
    const gap = state.tasking_gap;
    return `执行 Evidence Orchestrator v5 Tasking：${scenario.story_id} / ${scenario.scenario_id}。

方法：加载并遵守 .pi/skills/evidence-test-process/SKILL.md。
上下文：
- ${scenario.artifact_path}
- ${state.model_expansion_path}
- ${state.model_projection?.context_path ?? '.evidence/model.json'}
- docs/architecture/
- contracts/api.yaml
- engineering/evidence-orchestrator/runtime-contexts.json
- engineering/evidence-orchestrator/test-processes/
- engineering/evidence-orchestrator/definition-of-done.md
${gap ? `当前知识缺口：${gap.kind} · ${gap.reason}` : ''}

任务：只为确认 Scenario 生成一次 Q2/Q1 test-list、唯一 v2 process 计划和依赖有序 task-list。只调用 evidence_orchestrator_propose_tasking 一次后停止，等待人类 /evidence-desk-check；不得写代码或创建 Sprint 工件。

额外用户指令：
${extra || '（无）'}
`;
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
    const mode = pairDriverMode(state);
    if (mode) return buildPairDriverTask(cwd, state, mode);
    const action = pairDeterministicAction(cwd, state);
    if (action) {
      return `执行 Evidence Orchestrator v5 Pair 的一个确定性 checkpoint：${action}。加载 .pi/skills/evidence-pairing/SKILL.md；只运行锁定命令并记录真实结果后停止。`;
    }
    return `Evidence Orchestrator v5 Pair 暂停于 ${state.pair_session.checkpoint}。下一选择：${pairNextInstruction(state)}。不得自动继续。`;
  }
  if (state.loop === 'showcase') {
    const workItem = state.active_work_item;
    if (!workItem || state.showcase_stage !== 'reviewing') {
      throw new Error(
        'Showcase Reviewer requires passed Q2, explicit Q3/Q4 decisions, and reviewing stage.',
      );
    }
    const base = `artifacts/05-code/${workItem.story_id}/${workItem.scenario_id}`;
    return `执行 Evidence Orchestrator v5 独立只读 Showcase Review：${workItem.story_id} / ${workItem.scenario_id}。

上下文：${state.confirmed_scenario?.artifact_path}、${state.model_expansion_path}、${state.approved_test_plan_path}、${artifactRelativePath(state, `${base}.manifest.json`)}、${artifactRelativePath(state, `${base}.summary.md`)}、Q3/Q4=${JSON.stringify(state.showcase_risk_decisions)}。
任务：区分 observed facts、product/domain feedback、technical quality feedback 与 unresolved assumptions；只调用 evidence_orchestrator_record_showcase_review 一次后停止。不得修改任何文件或替人决定。

额外用户指令：
${extra || '（无）'}
`;
  }
  if (state.loop === 'respond') {
    const workItem = state.active_work_item;
    const review = state.showcase_reviews?.at(-1);
    if (
      !workItem ||
      state.showcase_stage !== 'accepted' ||
      state.respond_stage !== 'drafting' ||
      !review
    ) {
      throw new Error('Respond requires an accepted Showcase.');
    }
    return `执行 Evidence Orchestrator v5 Respond：${workItem.story_id} / ${workItem.scenario_id}。

只读上下文：确认 Scenario、模型展开、execution manifest、${review.artifact_path}、Showcase 人工决定、docs/knowledge-governance.md、Working Knowledge catalog。
任务：只对实际使用且验证的知识提出 promotions（允许带理由的空列表）和一个 next Probe；只调用 evidence_orchestrator_propose_response 一次后停止，等待人类 /evidence-respond。

额外用户指令：
${extra || '（无）'}
`;
  }
  throw new Error(`Unsupported workflow activity: ${state.loop}.`);
}
