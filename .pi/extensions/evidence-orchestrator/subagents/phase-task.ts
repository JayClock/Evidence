import { allClarificationStoryOutcomeProposals } from '../requirements/clarifications';
import { confirmedSpecificationStoryIds } from '../requirements/specifications';
import { artifactRelativePath } from '../workflow/iteration-paths';
import { isV5Workflow } from '../workflow/loop-catalog';
import {
  PHASE_META,
  phaseSpecificInstructions,
} from '../workflow/phase-catalog';
import { readState } from '../workflow/state-store';
import {
  buildPairDriverTask,
  pairDeterministicAction,
  pairDriverMode,
  pairNextInstruction,
} from '../testing/pairing';
import type { Phase } from '../workflow/types';

export function buildPhaseTask(
  cwd: string,
  requestedPhase?: string,
  extra = '',
): string {
  const state = readState(cwd);
  const phase = (requestedPhase || state.phase) as Phase;
  if (phase === 'complete') {
    return 'Evidence Orchestrator 本轮迭代已完成。读取本轮 07-learning/next-iteration.md，将确认后的反馈更新到 GitHub Issue，再通过 /evidence-new 选择 Issue 并创建新快照；不要直接扩写旧工件或手工修改 requirements.md 投影。';
  }
  if (isV5Workflow(state) && state.loop === 'kickoff') {
    const requirements = artifactRelativePath(
      state,
      'artifacts/00-user-input/requirements.md',
    );
    return `执行 Evidence Orchestrator v5 Kickoff 候选准备。

读取：
- ${requirements}
- docs/product/personas.md
- docs/product/business-context.md
- docs/product/user-journeys.md
- docs/product/story-map.md

任务：
1. 从 Issue 中识别一个用户或业务问题，不要把 API、数据库、框架、测试或实现任务伪装成价值。
2. 提出一个角色、一个可协商目标和一个价值，只形成一张候选 Story，不分配 US-xxx，不生成 P0/P1 Backlog。
3. 判断团队此刻更适合 clear、complicated 或 complex 的认知行为；这不是给需求永久分类。
4. 使用 Issue 投影以及产品文档的路径/标题作为 sourceRefs，不复制完整稳定知识。
5. 如果 Issue 实际包含多个独立问题，不得替人选择或批量建卡；停止并明确要求人类先选择或拆分。
6. 信息足够时只调用 evidence_orchestrator_propose_kickoff，并立即停止。不得直接写 problem-statement、Story Card 或 delta，不得调用 evidence_orchestrator_complete_phase。

额外用户指令：
${extra || '（无）'}
`;
  }
  if (
    isV5Workflow(state) &&
    state.loop === 'understand' &&
    state.understand_stage === 'tqa'
  ) {
    const storyId = state.active_clarification_story?.story_id;
    if (!storyId) {
      throw new Error('v5 Understand TQA requires one active Story.');
    }
    return `执行 Evidence Orchestrator v5 Understand TQA：${storyId}。

读取：
- ${artifactRelativePath(state, 'artifacts/01-requirements/problem-statement.md')}
- ${artifactRelativePath(state, `artifacts/01-requirements/stories/${storyId}.md`)}
- ${artifactRelativePath(state, `artifacts/01-requirements/clarifications/${storyId}.json`)}（存在时）
- ${artifactRelativePath(state, 'artifacts/01-requirements/product-context-delta.md')}（存在时）
- docs/product/business-context.md
- docs/product/user-journeys.md

任务：
1. 只处理 ${storyId}，不得选择或切换其他 Story。
2. 如果仍有高价值业务不确定性，调用 evidence_orchestrator_ask_question 提出一个非技术问题，然后立即停止等待领域专家回答。
3. 如果现有业务信息已足够，调用 evidence_orchestrator_propose_scenarios 提出一到五个具体 Given/When/Then 草案；包含关键业务数据和可观察结果，不包含实现步骤，然后立即停止。
4. 不再调用 evidence_orchestrator_propose_story_outcome，不生成批量 Specify，不写 requirements-validation.md，也不得调用 evidence_orchestrator_complete_phase。
5. Story 的拆分、延期以及最终 Scenario 选择均由人类通过 /evidence-scenario 决定。

额外用户指令：
${extra || '（无）'}
`;
  }
  if (
    isV5Workflow(state) &&
    state.loop === 'understand' &&
    state.understand_stage === 'modeling'
  ) {
    const scenario = state.confirmed_scenario;
    if (!scenario)
      throw new Error('v5 modeling requires a confirmed Scenario.');
    if (state.modeling_stage === 'profile') {
      return `执行 Evidence Orchestrator v5 建模方法选择：${scenario.story_id} / ${scenario.scenario_id}。

先读取：
- ${scenario.artifact_path}
- .evidence/model.json
- .evidence/entities/
- .evidence/associations/

任务：
1. 判断本场景处理的是 business、domain 还是 tool；这是建模对象，不是技术 runtime。
2. 选择 none、object、event、four_color、eight_x_flow 或 algorithmic。eight_x_flow 只适用于业务系统；工具允许 none。
3. 先尝试用现有模型解释场景，再判断 modelChangeRequired 为 true、false 或 unknown。
4. 只调用 evidence_orchestrator_propose_modeling_profile 并停止，等待人类通过 /evidence-modeling-profile 确认或覆盖。
5. 此时不得编辑 .evidence，不得创建模型补丁，不得调用阶段完成工具。

额外用户指令：
${extra || '（无）'}
`;
    }
    if (state.modeling_stage === 'expansion') {
      return `执行 Evidence Orchestrator v5 模型展开：${scenario.story_id} / ${scenario.scenario_id}。

人类已确认建模 Profile：
${JSON.stringify(state.modeling_profile, null, 2)}

读取：
- ${scenario.artifact_path}
- .evidence/model.json
- .evidence/entities/
- .evidence/associations/

任务：
1. 必须先使用现有 .evidence 模型展开 Given/When/Then、关键业务数据、不变量和时间线。${state.modeling_profile?.subject === 'business' && state.modeling_profile.method === 'eight_x_flow' ? ' 当前 Profile 为 business/eight_x_flow，先读取 .pi/skills/evidence-8x-flow/SKILL.md；仅此 Profile 启用 8X 规则。' : ' 当前 Profile 不是 business/eight_x_flow，不得套用 8X 规则。'}
2. model_change_required=false 时，operations 必须为空，不得制造 model delta。
3. model_change_required=true 时，只在概念缺失、关系错置、生命周期或方法特有不变量失败时提出结构化 add/update/remove operation。路径限定为 .evidence/entities/<id>.yaml 或 .evidence/associations/<id>.yaml；update/remove 必须提供当前文件 sha256。
4. 只调用 evidence_orchestrator_record_model_analysis。该工具记录展开和候选补丁；不得直接 edit/write .evidence，也不得输出 shell patch。
5. 调用后立即停止，等待独立 Model Challenger；不得自行验证或完成阶段。

额外用户指令：
${extra || '（无）'}
`;
    }
    if (state.modeling_stage === 'candidate_ready') {
      const projection = state.model_projection;
      if (!projection) {
        throw new Error(
          'Model Challenger requires generated model projections.',
        );
      }
      return `执行 Evidence Orchestrator v5 独立 Model Challenge：${scenario.story_id} / ${scenario.scenario_id}。

只读输入：
- ${projection.mermaid_path}
- ${projection.glossary_path}
- ${projection.context_path}

任务：
1. 你是独立 Challenger，不是生成候选补丁的 Builder。只能读取生成视图和场景，不得修改 .evidence、候选补丁、场景或任何代码。${state.modeling_profile?.subject === 'business' && state.modeling_profile.method === 'eight_x_flow' ? ' 当前 Profile 为 business/eight_x_flow，读取 .pi/skills/evidence-8x-flow/SKILL.md 并检查方法特有规则。' : ' 当前 Profile 不启用 8X，不得用合同/履约规则误判模型。'}
2. 将当前确认 Scenario 与 context 中标记为 regression/holdout 的历史场景分开检查。
3. 检查概念缺失、关系错置、生命周期/时间线、不变量及建模方法是否能解释这些场景。
4. 确定性回归预检结果：${projection.regression_failures.length ? projection.regression_failures.join('；') : '通过'}。方法特有预检结果：${projection.method_failures.length ? projection.method_failures.join('；') : '通过'}。
5. 只调用 evidence_orchestrator_record_model_challenge，选择 pass、scenario_gap、model_gap 或 method_gap 并给出具体业务理由，然后停止。
6. 不得直接修模型；失败会自动路由到 TQA、Model Builder 或 Modeling Profile。

额外用户指令：
${extra || '（无）'}
`;
    }
    throw new Error(
      `v5 modeling stage ${state.modeling_stage ?? 'unset'} cannot run a model task.`,
    );
  }
  if (isV5Workflow(state) && state.loop === 'tasking') {
    const scenario = state.confirmed_scenario;
    if (!scenario || !state.model_expansion_path) {
      throw new Error(
        'v5 Tasking requires a confirmed Scenario and model expansion.',
      );
    }
    const gap = state.tasking_gap;
    return `执行 Evidence Orchestrator v5 Tasking：${scenario.story_id} / ${scenario.scenario_id}。

读取：
- ${scenario.artifact_path}
- ${state.model_expansion_path}
- ${state.model_projection?.context_path ?? '.evidence/model.json'}
- docs/architecture/context-map.md
- docs/architecture/module-structure.md
- docs/architecture/tech-stack.md
- docs/architecture/test-strategy.md
- docs/architecture/test-doubles.md
- contracts/api.yaml
- engineering/evidence-orchestrator/runtime-contexts.json
- engineering/evidence-orchestrator/test-processes/
- engineering/evidence-orchestrator/definition-of-done.md
- ${artifactRelativePath(state, 'artifacts/04-planning/test-list.md')}（存在时，包含人类修改）
- ${artifactRelativePath(state, 'artifacts/04-planning/task-list.md')}（存在时）

${gap ? `当前知识缺口：${gap.kind} · ${gap.reason}\n先核对并修正对应的稳定架构或项目级 v2 工序；不得猜选 process，也不得借机重新设计无关架构。` : '复用稳定架构和项目级 v2 测试工序；只有确有架构或工序知识缺失时才修改统一知识。'}

任务：
1. 先用自然语言列出确认 Scenario、原样业务数据和 Q2 验收意图，再为每个 Q2 配置可定位失败的 Q1 支撑测试。不得从非目标反推测试，不得增加 Scenario 之外的结果或数据。
2. 将 Workspace、Logical Model、Diagram Projection、Model Proposal 等稳定功能上下文与 runtime、API/ORM/UI/Shell 技术边界分开。一个服务端场景只能选择 Rust 或 Nest。
3. 用完整能力和技术边界唯一匹配 v2 process；零匹配或多匹配必须由工具路由知识缺口，绝不自行挑选。
4. 覆盖 process 的全部有序步骤，明确真实边界、被替换边界和替身；使用可安全物化的聚焦测试标识。
5. 生成按依赖排序的实现任务；每项任务必须追踪至少一个 TEST-xxx，且不得把代码侦察、Scrum 仪式、Sprint Backlog 或无 Scenario 支撑的功能列为交付任务。
6. 只调用 evidence_orchestrator_propose_tasking。工具会生成 test-list.md、task-list.md 和候选机器计划；调用后立即停止，等待人类 /evidence-desk-check。
7. 不得写测试代码或生产代码，不得生成 sprint-plan.md、sprint-1-backlog.md、backlog-delta.md，也不得调用 evidence_orchestrator_complete_phase。

额外用户指令：
${extra || '（无）'}
`;
  }
  if (isV5Workflow(state) && state.loop === 'pair') {
    if (
      state.tasking_stage !== 'approved' ||
      !state.approved_test_plan_path ||
      !state.active_work_item ||
      !state.pair_session
    ) {
      throw new Error('v5 Pair requires an approved Tasking test plan.');
    }
    const mode = pairDriverMode(state);
    if (mode) return buildPairDriverTask(cwd, state, mode);
    const action = pairDeterministicAction(cwd, state);
    if (action) {
      return `执行 Evidence Orchestrator v5 Pair 的一个确定性 checkpoint：${action}。只运行当前锁定的 focused command 或下一条最终 quality gate，记录真实结果后立即停止；不得启动 Driver、修改代码或连续推进第二个 checkpoint。`;
    }
    return `Evidence Orchestrator v5 Pair 暂停于 ${state.pair_session.checkpoint}。下一选择：${pairNextInstruction(state)}。不得自动继续或调用旧 Coder。`;
  }
  if (isV5Workflow(state) && state.loop === 'showcase') {
    const workItem = state.active_work_item;
    if (!workItem || state.showcase_stage !== 'reviewing') {
      throw new Error(
        'v5 Showcase Reviewer requires passed Q2, explicit Q3/Q4 decisions, and reviewing stage.',
      );
    }
    const base = `artifacts/05-code/${workItem.story_id}/${workItem.scenario_id}`;
    return `执行 Evidence Orchestrator v5 独立只读 Showcase Review：${workItem.story_id} / ${workItem.scenario_id}。

读取：
- ${state.confirmed_scenario?.artifact_path ?? 'missing-scenario.md'}
- ${state.model_expansion_path ?? 'missing-model-expansion.json'}
- ${state.model_projection?.context_path ?? '.evidence/model.json'}
- ${state.approved_test_plan_path ?? 'missing-test-plan.json'}
- ${artifactRelativePath(state, `${base}.manifest.json`)}
- ${artifactRelativePath(state, `${base}.summary.md`)}
- engineering/evidence-orchestrator/definition-of-done.md

Q3/Q4 风险决定：
${JSON.stringify(state.showcase_risk_decisions, null, 2)}

任务：
1. 只读验证确认 Scenario 的 Given/When/Then 是否由 Showcase Q2 的实际结果支持；命令全绿不能替代用户价值判断。
2. 核对模型候选、测试、生产实现和 manifest 是否共享同一 Story/Scenario 与 Git baseline。
3. 明确分离 observed facts、product/domain feedback、technical quality feedback、unresolved assumptions；没有内容的反馈类别使用空数组，不得把假设写成事实。
4. Q3/Q4 为 required 时，检查声明的评价活动是否仍是未解决假设或已有可复核事实；不要求无风险场景执行所有象限。
5. 只调用 evidence_orchestrator_record_showcase_review 一次并立即停止。不得 write/edit 文件，不得修改代码、测试、模型、计划、状态或执行证据，不得调用阶段完成/失败工具，也不得替人 accept、revise 或 reject。

额外用户指令：
${extra || '（无）'}
`;
  }
  const meta = PHASE_META[phase];
  if (!meta) throw new Error(`Unknown Evidence Orchestrator phase: ${phase}.`);
  const activeWorkItem = state.active_work_item
    ? `${state.active_work_item.story_id} / ${state.active_work_item.scenario_id}`
    : '未选择';
  const requirementSource = state.requirement_source
    ? `${state.requirement_source.repository}#${state.requirement_source.issue_number} (${state.requirement_source.url})`
    : 'legacy local snapshot';
  const activeClarificationStory =
    state.active_clarification_story?.story_id ?? '未选择';
  const clarificationOutcomeProposals =
    allClarificationStoryOutcomeProposals(state);
  const proposedClarificationOutcome = clarificationOutcomeProposals.length
    ? clarificationOutcomeProposals
        .map(({ story_id, outcome }) => `${story_id}=${outcome}（待人类确认）`)
        .join(', ')
    : '无';
  const clarificationOutcomes = state.clarification_story_outcomes?.length
    ? state.clarification_story_outcomes
        .map(({ story_id, outcome }) => `${story_id}=${outcome}`)
        .join(', ')
    : '无';
  const resolvePath = (path: string) => artifactRelativePath(state, path);
  const instructions = phaseSpecificInstructions(phase).replaceAll(
    'artifacts/',
    `artifacts/iterations/${state.iteration_id}/`,
  );
  const clarificationExecution =
    phase !== 'clarify'
      ? ''
      : state.proposed_clarification_story_outcome
        ? `\n- ${activeClarificationStory} 的 AI 结论建议正在等待领域专家通过 /evidence-story-complete 决定。不得继续提问、修改建议、释放故事或完成 clarify 阶段。`
        : state.active_clarification_story
          ? `\n- 当前运行只处理当前选中的故事 ${activeClarificationStory}；只读取或修改它的故事卡和澄清记录，不得处理其他故事。若仍有业务不确定性，调用 evidence_orchestrator_ask_question 后停止；若已足够清晰、需要拆分或应暂缓，只调用 evidence_orchestrator_propose_story_outcome 提出结论建议后停止。AI 不得完成或释放 Story；只有领域专家通过 /evidence-story-complete 才能写入最终结论。`
          : state.clarification_story_outcomes?.length
            ? `\n- 当前没有活动故事，且已记录人工确认的故事结论。只检查是否所有故事均已有结论；若是，完成 clarify 阶段；不得自行选择故事。`
            : `\n- 当前没有活动故事且 stories/ 为空，这只允许作为旧迭代兼容路径：依据已有 frame 工件补建候选 US-xxx.md 后停止，等待人类选择；不得提问、选择故事或完成 clarify 阶段。新迭代的故事卡必须由 frame 生成。`;
  const specificationStoryIds = confirmedSpecificationStoryIds(state);
  const specificationExecution =
    phase !== 'specify'
      ? ''
      : specificationStoryIds.length > 0
        ? `\n- Specify 的完整批处理范围：${specificationStoryIds.join(', ')}。必须逐一读取并规格化全部 Story，为每个 Story 至少生成一个 US-xxx-SC-xxx.md；不得只处理最后确认的 Story 或任意子集。`
        : `\n- 当前没有最终结论为 clarified 的 Story，Specify 没有合法处理范围。不得生成虚假示例或完成阶段；应报告确定性检查失败。`;

  return `执行 Evidence Orchestrator 阶段：${phase} — ${meta.title}。

需求权威来源：${requirementSource}
当前编码工作项：${activeWorkItem}
当前澄清故事：${activeClarificationStory}
待人工决定的故事建议：${proposedClarificationOutcome}
已完成故事澄清：${clarificationOutcomes}

执行约束：
1. 读取并尊重输入文件，不得编造已有工件。已有 artifacts 是审计历史；00-user-input/requirements.md 是 GitHub Issue 的自动生成投影，不得手工编辑。
2. 统一知识源包括 docs/knowledge-governance.md、docs/product/、.evidence/、docs/architecture/、contracts/ 和 engineering/evidence-orchestrator/。Iteration 只保存切片、delta、决策和执行证据；delta 必须引用基线而不是复制它，且不得用“无变化”内容重复稳定知识。
3. .evidence/ 是权威领域模型；domain_model 阶段按场景演进它，artifacts/02-domain-model/ 只保存本轮证据。
4. 输出仅写入指定路径。本轮工件只写入 artifacts/iterations/${state.iteration_id}/，不得覆盖其他 iteration。
5. 用户故事使用 artifacts/01-requirements/stories/US-xxx.md；验收示例使用 artifacts/01-requirements/examples/US-xxx-SC-xxx.md。
6. Coding 必须修改所属 apps/* 或 libs/* 的真实测试与实现，不得创建根级 src/、tests/，也不得用 Markdown 伪代码代替代码；同时产出场景 Markdown 与机器可读 JSON 证据。
7. Clarify 必须先由人类选择一张活动故事卡。只处理该故事；使用 evidence_orchestrator_ask_question 一次记录一个高价值、非技术问题并立即停止。只有用户明确回答后才能调用 evidence_orchestrator_answer_question。AI 只能调用 evidence_orchestrator_propose_story_outcome 提出故事结论建议并停止；只有领域专家通过 /evidence-story-complete 才能确认、覆盖或拒绝建议，或直接决定结论并最终释放 Story。
8. Check 失败时调用 evidence_orchestrator_report_phase_failure，记录具体失败结果后在同一阶段修正。
9. 完成后调用 evidence_orchestrator_complete_phase，phase 必须为 "${phase}"。

输入文件/目录：
${meta.inputs.map((path) => `- ${resolvePath(path)}`).join('\n')}

必须产出：
${meta.outputs.map((path) => `- ${resolvePath(path)}`).join('\n')}

阶段要求：
${instructions}${clarificationExecution}${specificationExecution}

额外用户指令：
${extra || '（无）'}
`;
}
