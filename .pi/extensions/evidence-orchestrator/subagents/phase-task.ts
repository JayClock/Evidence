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

方法：加载并遵守 .pi/skills/evidence-story-tqa/SKILL.md，不在本任务中复制 TQA 方法。

上下文：
- ${artifactRelativePath(state, 'artifacts/01-requirements/problem-statement.md')}
- ${artifactRelativePath(state, `artifacts/01-requirements/stories/${storyId}.md`)}
- ${artifactRelativePath(state, `artifacts/01-requirements/clarifications/${storyId}.json`)}（存在时）
- docs/product/business-context.md
- docs/product/user-journeys.md

任务：只处理 ${storyId}。下一步只能调用 evidence_orchestrator_ask_question 或 evidence_orchestrator_propose_scenarios 一次并停止；人类通过 /evidence-scenario 决定确认、继续、拆分或延期。不写 requirements-validation.md，不调用阶段完成工具。

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
      return `执行 Evidence Orchestrator v5 建模 Profile：${scenario.story_id} / ${scenario.scenario_id}。

方法：加载并遵守 .pi/skills/evidence-modeling-router/SKILL.md。
上下文：${scenario.artifact_path}、.evidence/model.json、.evidence/entities/、.evidence/associations/。
任务：为这个 Scenario 提出 subject、method 与 modelChangeRequired，只调用 evidence_orchestrator_propose_modeling_profile 一次后停止，等待人类 /evidence-modeling-profile。不得编辑 .evidence 或推进下一动作。

额外用户指令：
${extra || '（无）'}
`;
    }
    if (state.modeling_stage === 'expansion') {
      return `执行 Evidence Orchestrator v5 模型展开：${scenario.story_id} / ${scenario.scenario_id}。

方法：加载并遵守 .pi/skills/evidence-model-expansion/SKILL.md。${state.modeling_profile?.subject === 'business' && state.modeling_profile.method === 'eight_x_flow' ? '本 Profile 另加载 .pi/skills/evidence-8x-flow/SKILL.md。' : '本 Profile 不加载 8X Skill。'}
人类确认 Profile：${JSON.stringify(state.modeling_profile)}
上下文：${scenario.artifact_path}、.evidence/model.json、.evidence/entities/、.evidence/associations/。
任务：记录一次现有/候选模型展开，只调用 evidence_orchestrator_record_model_analysis 后停止。不得直接 edit/write .evidence、修订 Scenario、自我挑战或推进下一动作。

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

方法：加载 .pi/skills/evidence-model-expansion/SKILL.md 的 Challenger 部分。${state.modeling_profile?.subject === 'business' && state.modeling_profile.method === 'eight_x_flow' ? '本 Profile 另加载 .pi/skills/evidence-8x-flow/SKILL.md。' : '本 Profile 不加载 8X Skill。'}
只读输入：${projection.mermaid_path}、${projection.glossary_path}、${projection.context_path}。
预检：regression=${projection.regression_failures.length ? projection.regression_failures.join('；') : '通过'}；method=${projection.method_failures.length ? projection.method_failures.join('；') : '通过'}。
任务：作为独立 Challenger，只调用 evidence_orchestrator_record_model_challenge 一次并停止。不得修改 .evidence、候选、Scenario 或代码，不得自行修复或推进下一动作。

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

方法：加载并遵守 .pi/skills/evidence-test-process/SKILL.md；本任务只提供上下文和输出边界。

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

任务：只为确认 Scenario 生成一次可追踪的 Q2/Q1 test-list、唯一 v2 process 计划和依赖有序 task-list；不得从非目标反推测试、混用 Rust/Nest、猜选 process 或写代码；不得生成 sprint-plan.md。只调用 evidence_orchestrator_propose_tasking 一次后停止，等待人类 /evidence-desk-check；不得调用 evidence_orchestrator_complete_phase。

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
      return `执行 Evidence Orchestrator v5 Pair 的一个确定性 checkpoint：${action}。加载 .pi/skills/evidence-pairing/SKILL.md 以解释当前 checkpoint；只运行锁定命令并记录真实结果后停止，不启动 Driver、修改代码或推进第二个 checkpoint。`;
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
  if (isV5Workflow(state) && state.loop === 'respond') {
    const workItem = state.active_work_item;
    const review = state.showcase_reviews?.at(-1);
    if (
      !workItem ||
      state.showcase_stage !== 'accepted' ||
      state.respond_stage !== 'drafting' ||
      !review
    ) {
      throw new Error(
        'v5 Respond requires an accepted Showcase and drafting stage.',
      );
    }
    const base = `artifacts/05-code/${workItem.story_id}/${workItem.scenario_id}`;
    return `执行 Evidence Orchestrator v5 Respond：${workItem.story_id} / ${workItem.scenario_id}。

只读输入：
- ${state.confirmed_scenario?.artifact_path ?? 'missing-scenario.md'}
- ${state.model_expansion_path ?? 'missing-model-expansion.json'}
- ${state.model_change_proposal?.artifact_path ?? 'no-model-change-proposal'}
- ${artifactRelativePath(state, `${base}.manifest.json`)}
- ${review.artifact_path}
- ${state.showcase_decisions?.at(-1)?.artifact_path ?? 'missing-showcase-decision.jsonl'}
- docs/knowledge-governance.md
- engineering/evidence-orchestrator/test-processes/
- .pi/skills/
- .pi/prompts/（存在时）

任务：
1. 只分析本轮实际使用、执行和 Showcase 接受的知识；目标文件存在本身不是验证。
2. 对每项候选给出 source、kind、promoted/deferred/rejected、reason 和 validationEvidence。promoted 必须引用确认 Scenario、人工 Showcase accept 与 execution manifest，并指向本轮相对同一 Git baseline 实际变化的 canonicalTarget。
3. 已应用模型变化只有与代码共同通过 Pair、Showcase 且覆盖全部 changed model paths 时才能 promoted；否则不得让未接受模型污染 .evidence。
4. 测试工序、Skill、Prompt/CoT 可以是 Working Knowledge；只有本 Scenario 实际使用并可由工序哈希、模型 Profile 或回归结果复核时才可 promoted。
5. 可以提交空 promotions，但必须提供具体 noPromotionReason。
6. nextProbe 必须包含一个待学习问题、whyNow、实际 evidenceRefs 和 firstAction，不得输出泛化待办。
7. 只调用 evidence_orchestrator_propose_response 一次并立即停止。不得修改权威知识、代码、Issue 或工件，不得完成阶段；人类通过 /evidence-respond 决定。

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
