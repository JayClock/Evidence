import { allClarificationStoryOutcomeProposals } from '../requirements/clarifications';
import { confirmedSpecificationStoryIds } from '../requirements/specifications';
import { artifactRelativePath } from '../workflow/iteration-paths';
import {
  PHASE_META,
  phaseSpecificInstructions,
} from '../workflow/phase-catalog';
import { readState } from '../workflow/state-store';
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
