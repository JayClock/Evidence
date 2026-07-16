import type { WorkflowState } from '../../iteration/state';
import { pairNextInstruction } from '../../loops/pair/pair-session';
import { showcaseNextInstruction } from '../../loops/showcase/showcase-session';

export const NEXT_STEP_WIDGET_KEY = 'evidence-orchestrator-next-step';

export function nextStepGuidance(
  cwd: string,
  state: WorkflowState | undefined,
): string {
  if (!state) {
    return '下一步：用 /evidence-inbox 收集来源并提取 Story 候选，再运行 /evidence-new [CAND-xxxx]。';
  }
  if (state.halted) {
    return `本轮已停止：${state.halted.reason}。运行 /evidence-status 查看保留的决策与证据。`;
  }
  if (state.loop === 'complete') {
    return '本轮已完成：把 Next Probe 收集进 Inbox、提取候选，再用 /evidence-new 创建下一轮。';
  }
  if (state.loop === 'kickoff') {
    return state.kickoff_candidate
      ? '下一步：运行 /evidence-kickoff，审核并确认、修改、拆分、延期或停止当前 Story 候选。'
      : '下一步：运行 /evidence-run，生成一张最小 Story 候选。';
  }
  if (state.loop === 'understand') {
    if (state.pending_clarification) {
      return `下一步：直接回答 ${state.pending_clarification.question_id}，无需运行命令。`;
    }
    if (state.understand_stage === 'scenario_review') {
      return '下一步：运行 /evidence-scenario，确认本 Story 的完整 Scenario Set，或继续 TQA、拆分、延期。';
    }
    if (state.modeling_stage === 'profile_review') {
      return '下一步：运行 /evidence-modeling-profile，确认或调整建模对象、建模方法及是否需要修改权威模型。';
    }
    if (state.modeling_stage === 'model_review') {
      return '下一步：运行 /evidence-model，审核模型投影与统一语言，或反馈模型、Scenario、建模方法问题。';
    }
    if (state.modeling_stage === 'candidate_ready') {
      return '下一步：运行 /evidence-run，启动独立模型挑战。';
    }
    if (state.understand_stage === 'modeling') {
      return '下一步：运行 /evidence-run，将全部确认 Scenario 联合展开到所选模型。';
    }
    return '下一步：运行 /evidence-run，继续单 Story TQA 或生成完整 Scenario Set。';
  }
  if (state.loop === 'tasking') {
    return state.tasking_stage === 'desk_check'
      ? '下一步：运行 /evidence-desk-check；批准 Story 计划或反馈架构、流程、Scenario Set 缺口。'
      : '下一步：运行 /evidence-run，生成或修订可审核的测试与实施计划。';
  }
  if (state.loop === 'pair') {
    return `下一步：${pairNextInstruction(state)}。每次只推进一个受观察的 Pair checkpoint。`;
  }
  if (state.loop === 'showcase') {
    return `下一步：${showcaseNextInstruction(cwd)}。按提示补齐产品观察、风险或验收决策。`;
  }
  if (state.loop === 'respond') {
    return state.respond_stage === 'decision'
      ? '下一步：运行 /evidence-respond，批准或要求修订知识提升与下一项 Probe。'
      : '下一步：运行 /evidence-run，形成待审核的知识提升与下一项 Probe。';
  }
  return '下一步：运行 /evidence-status 查看当前状态。';
}

export function nextStepWidget(
  cwd: string,
  state: WorkflowState | undefined,
): string[] {
  return [`Evidence · ${nextStepGuidance(cwd, state)}`];
}
