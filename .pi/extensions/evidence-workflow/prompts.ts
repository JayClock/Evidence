import { formatPhaseModel, phaseModelConfig } from './config';
import { artifactRelativePath } from './iteration';
import { PHASE_META, phaseSpecificInstructions } from './phases';
import { readState } from './state';
import type { Phase } from './types';

export function buildPhasePrompt(
  cwd: string,
  requestedPhase?: string,
  extra = '',
): string {
  const state = readState(cwd);
  const phase = (requestedPhase || state.phase) as Phase;
  if (phase === 'complete') {
    return 'Evidence Workflow 本轮迭代已完成。读取本轮 07-learning/next-iteration.md，将确认后的反馈更新到 GitHub Issue，再通过 /evidence-reset --issue=<number> 创建新快照；不要直接扩写旧工件或手工修改 requirements.md 投影。';
  }
  const meta = PHASE_META[phase];
  if (!meta) throw new Error(`Unknown Evidence Workflow phase: ${phase}.`);
  const configuredModel = phaseModelConfig(cwd, phase);
  const activeWorkItem = state.active_work_item
    ? `${state.active_work_item.story_id} / ${state.active_work_item.scenario_id}`
    : '未选择';
  const requirementSource = state.requirement_source
    ? `${state.requirement_source.repository}#${state.requirement_source.issue_number} (${state.requirement_source.url})`
    : 'legacy local snapshot';
  const resolvePath = (path: string) => artifactRelativePath(state, path);
  const instructions = phaseSpecificInstructions(phase).replaceAll(
    'artifacts/',
    `artifacts/iterations/${state.iteration_id}/`,
  );
  return `你正在执行 Evidence Workflow 阶段：${phase} — ${meta.title}。

阶段模型：${formatPhaseModel(configuredModel)}
需求权威来源：${requirementSource}
当前编码工作项：${activeWorkItem}

必须遵守：
1. 使用项目内 Skill：${meta.skill}；必要时读取 .pi/skills/${meta.skill}/SKILL.md。
2. 读取并尊重输入文件，不要凭空编造已有工件；已有 artifacts 是审计历史，除非本阶段需要修正，否则不要整体重写。00-user-input/requirements.md 是 GitHub Issue 的自动生成投影，不得手工编辑；需求变化必须更新 Issue，并在 frame 显式同步或开启新迭代。
3. 统一知识源包括 docs/product/、.evidence/、docs/architecture/、contracts/ 和 engineering/evidence-workflow/。先读取并复用；只有阶段明确要求且经反馈确认时才更新。Iteration 只保存切片、delta、决策和执行证据，不得复制完整知识。
4. .evidence/ 是权威领域模型；domain_model 阶段按场景演进它，artifacts/02-domain-model/ 只保存快照、增量、展开、战术设计和验证证据。
5. 将输出写入指定工件路径；如果目录不存在，创建目录。
6. 用户故事以单独文件管理：artifacts/01-requirements/stories/US-xxx.md；验收示例以 artifacts/01-requirements/examples/US-xxx-SC-xxx.md 管理。
7. 代码阶段必须在所属 apps/* 或 libs/* 项目中创建或修改真实实现与测试，不能创建根级 src/、tests/，也不能只写 Markdown 伪代码。完成时同时提供场景 Markdown 与机器可读 JSON 证据。
8. 本轮工件只写入 artifacts/iterations/${state.iteration_id}/；不要覆盖其他 iteration。稳定知识提升必须修改对应统一知识源，并保留 iteration delta 作为原因证据。
9. clarify 阶段使用 evidence_workflow_ask_question 一次只记录一个高价值、非技术问题；调用后立刻停止，等待用户明确回答。只有用户明确回答后才可调用 evidence_workflow_answer_question，绝不自行编造答案。pending clarification 会阻止进入下一阶段。
10. Check 失败时调用 evidence_workflow_report_phase_failure，记录具体失败结果后在同一阶段修正；达到重试上限会创建 emergency Gate。
11. 完成后调用 evidence_workflow_complete_phase 工具，phase 必须传入 "${phase}"，summary 简述本阶段完成内容。

输入文件/目录：
${meta.inputs.map((p) => `- ${resolvePath(p)}`).join('\n')}

必须产出：
${meta.outputs.map((p) => `- ${resolvePath(p)}`).join('\n')}

阶段要求：
${instructions}

额外用户指令：
${extra || '（无）'}
`;
}
