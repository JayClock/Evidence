import { singleStoryId } from '../requirements/story-cards';
import {
  artifactRelativePath,
  activeIterationId,
} from '../workflow/iteration-paths';
import {
  PHASE_META,
  phaseSpecificInstructions,
} from '../workflow/phase-catalog';
import { readState } from '../workflow/state-store';
import type { ActivePhase } from '../workflow/types';

export function buildPhaseTask(
  cwd: string,
  requestedPhase?: string,
  extra = '',
): string {
  const state = readState(cwd);
  if (state.phase === 'idle') {
    return 'Evidence Orchestrator 当前没有 iteration。请由用户明确选择 GitHub Issue，再通过 /evidence-new 创建冻结快照。';
  }
  if (state.phase === 'complete') {
    return 'Evidence Orchestrator 本轮已完成。读取 07-learn/next-issue.md，将确认后的下一问题更新到 GitHub Issue，再通过 /evidence-new 创建新 iteration；不要继续修改旧证据。';
  }
  const phase = (requestedPhase || state.phase) as ActivePhase;
  const meta = PHASE_META[phase];
  if (!meta) throw new Error(`Unknown Evidence Orchestrator phase: ${phase}.`);
  const iterationId = activeIterationId(state);
  const requirementSource = state.requirement_source
    ? `${state.requirement_source.repository}#${state.requirement_source.issue_number} (${state.requirement_source.url})`
    : 'missing';
  let storyId = 'Kickoff 尚未创建';
  if (phase !== 'kickoff') storyId = singleStoryId(cwd, state);
  const activeWorkItem = state.active_work_item
    ? `${state.active_work_item.story_id} / ${state.active_work_item.scenario_id}`
    : '未选择';
  const resolvePath = (path: string) => artifactRelativePath(state, path);
  const instructions = phaseSpecificInstructions(phase).replaceAll(
    'artifacts/',
    `artifacts/iterations/${iterationId}/`,
  );

  return `执行 Evidence Orchestrator 阶段：${phase} — ${meta.title}。

需求权威来源：${requirementSource}
本轮唯一 Story：${storyId}
当前 Build 工作项：${activeWorkItem}

执行约束：
1. 先读取 engineering/evidence-orchestrator/knowledge-process-principles.md 与 delivery-journey.md。目标是缩短知识反馈循环，不是填满阶段模板。
2. 00-input/requirements.md 是 GitHub Issue 的只读投影，不得手工编辑。本轮工件只写入 artifacts/iterations/${iterationId}/，不得覆盖其他 iteration。
3. docs/product/、.evidence/、docs/architecture/、contracts/、源码与测试是各类稳定知识的权威来源；iteration 只保存当前 Story 的 delta、决策、检查和执行事实，不复制基线。
4. 整个 iteration 只有一张 Story；Build 只有一个 active Scenario。发现额外工作时写回后续 Issue，不创建并行 Story 状态、Sprint backlog 或暂停队列。
5. .evidence/ 是权威领域模型；03-model/ 只保存快照、delta、场景展开和检查证据。
6. Build 必须修改所属 apps/* 或 libs/* 的真实测试与实现，不得用 Markdown 或伪代码代替代码。命令事实只追加到 *.execution.jsonl，报告引用日志而不手填结果。
7. Discover 使用 TQA：先记录 Thought，再通过 evidence_orchestrator_ask_question 一次提出一个非技术 Question 并停止；只有用户明确回答后才能调用 evidence_orchestrator_answer_question。
8. 确定性 Check 失败时调用 evidence_orchestrator_report_phase_failure，保存具体失败结果并在同一阶段修正。
9. 完成全部输出与 Check 后调用 evidence_orchestrator_complete_phase，phase 必须为 "${phase}"。

输入文件/目录：
${meta.inputs.map((path) => `- ${resolvePath(path)}`).join('\n')}

必须产出：
${meta.outputs.map((path) => `- ${resolvePath(path)}`).join('\n')}

阶段要求：
${instructions}

额外用户指令：
${extra || '（无）'}
`;
}
