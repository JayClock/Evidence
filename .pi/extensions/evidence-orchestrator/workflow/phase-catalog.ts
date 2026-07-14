import type {
  ActivePhase,
  GateMode,
  Phase,
  PhaseMeta,
  WorkflowState,
} from './types';

export const PHASE_ORDER: Phase[] = [
  'idle',
  'kickoff',
  'discover',
  'model',
  'design',
  'build',
  'showcase',
  'learn',
  'complete',
];

const GATE_CONFIG: Record<ActivePhase, GateMode> = {
  kickoff: 'review',
  discover: 'auto',
  model: 'review',
  design: 'auto',
  build: 'auto',
  showcase: 'review',
  learn: 'auto',
};

/** State used after a GitHub Issue has been frozen for a new iteration. */
export const DEFAULT_STATE: WorkflowState = {
  version: 2,
  iteration_id: 'ITER-0001',
  phase: 'kickoff',
  round: 0,
  pending_gate: null,
  failures: 0,
  max_rounds: 5,
  artifacts: [],
  gate_config: { ...GATE_CONFIG },
  pi: {
    enabled: true,
    version: 6,
  },
};

/** State used when the checkout has no active or completed v2 iteration. */
export const IDLE_STATE: WorkflowState = {
  ...DEFAULT_STATE,
  iteration_id: null,
  phase: 'idle',
};

export const PHASE_META: Record<ActivePhase, PhaseMeta> = {
  kickoff: {
    title: '单 Story Kickoff',
    inputs: [
      'artifacts/00-input/requirements.md',
      'docs/knowledge-governance.md',
      'docs/product/personas.md',
      'docs/product/business-context.md',
      'docs/product/user-journeys.md',
      'docs/product/story-map.md',
      'engineering/evidence-orchestrator/delivery-journey.md',
      'engineering/evidence-orchestrator/knowledge-process-principles.md',
    ],
    outputs: [
      'artifacts/01-kickoff/kickoff.md',
      'artifacts/01-kickoff/story.md',
    ],
    gateId: 'GATE-101-kickoff',
    gateTitle: 'Kickoff 价值确认',
  },
  discover: {
    title: 'TQA 与具体示例',
    inputs: [
      'artifacts/01-kickoff/kickoff.md',
      'artifacts/01-kickoff/story.md',
      'docs/product/business-context.md',
      'docs/product/user-journeys.md',
    ],
    outputs: [
      'artifacts/02-discovery/discovery.md',
      'artifacts/02-discovery/examples/',
    ],
    gateId: 'GATE-102-discover',
    gateTitle: '业务理解检查',
  },
  model: {
    title: '模型展开与检查循环',
    inputs: [
      'artifacts/01-kickoff/story.md',
      'artifacts/02-discovery/discovery.md',
      'artifacts/02-discovery/examples/',
      '.evidence/model.json',
      '.evidence/entities/',
      '.evidence/associations/',
    ],
    outputs: [
      'artifacts/03-model/model-snapshot.json',
      'artifacts/03-model/model-delta.json',
      'artifacts/03-model/expansions/',
      'artifacts/03-model/walkthrough.md',
    ],
    gateId: 'GATE-103-model',
    gateTitle: '模型 Walkthrough / Desk Check',
  },
  design: {
    title: '单场景交付设计',
    inputs: [
      'artifacts/01-kickoff/story.md',
      'artifacts/02-discovery/examples/',
      'artifacts/03-model/expansions/',
      'docs/architecture/context-map.md',
      'docs/architecture/architecture-style.md',
      'docs/architecture/tech-stack.md',
      'docs/architecture/module-structure.md',
      'docs/architecture/test-strategy.md',
      'docs/architecture/test-doubles.md',
      'contracts/api.yaml',
      'engineering/evidence-orchestrator/runtime-contexts.json',
      'engineering/evidence-orchestrator/test-processes/',
      'engineering/evidence-orchestrator/definition-of-done.md',
    ],
    outputs: [
      'artifacts/04-design/delivery-plan.md',
      'artifacts/04-design/scenario-context-map.json',
    ],
    gateId: 'GATE-104-design',
    gateTitle: '单场景交付设计检查',
  },
  build: {
    title: '单场景 TDD',
    inputs: [
      'artifacts/01-kickoff/story.md',
      'artifacts/02-discovery/examples/',
      'artifacts/03-model/expansions/',
      'artifacts/04-design/delivery-plan.md',
      'artifacts/04-design/scenario-context-map.json',
      'docs/architecture/test-strategy.md',
      'engineering/evidence-orchestrator/test-processes/',
      'engineering/evidence-orchestrator/definition-of-done.md',
    ],
    outputs: ['apps/', 'libs/', 'artifacts/05-build/'],
    gateId: 'GATE-105-build',
    gateTitle: 'TDD 执行检查',
  },
  showcase: {
    title: '可运行增量 Showcase',
    inputs: [
      'artifacts/01-kickoff/story.md',
      'artifacts/02-discovery/examples/',
      'artifacts/03-model/walkthrough.md',
      'artifacts/05-build/',
      'apps/',
      'libs/',
      'engineering/evidence-orchestrator/definition-of-done.md',
    ],
    outputs: ['artifacts/06-showcase/showcase.md'],
    gateId: 'GATE-106-showcase',
    gateTitle: 'Showcase 价值反馈',
  },
  learn: {
    title: 'Probe / Sense / Respond',
    inputs: [
      'artifacts/01-kickoff/kickoff.md',
      'artifacts/02-discovery/discovery.md',
      'artifacts/03-model/model-delta.json',
      'artifacts/04-design/delivery-plan.md',
      'artifacts/06-showcase/showcase.md',
    ],
    outputs: [
      'artifacts/07-learn/iteration-summary.md',
      'artifacts/07-learn/knowledge-promotion.json',
      'artifacts/07-learn/next-issue.md',
    ],
    gateId: 'GATE-107-learn',
    gateTitle: '学习闭环检查',
  },
};

export function nextPhase(phase: ActivePhase): Exclude<Phase, 'idle'> {
  const index = PHASE_ORDER.indexOf(phase);
  const next = PHASE_ORDER[index + 1];
  if (!next || next === 'idle') return 'complete';
  return next;
}

export function phaseSpecificInstructions(phase: ActivePhase): string {
  switch (phase) {
    case 'kickoff':
      return `- 从冻结 Issue 中只选择一个现在值得解决的问题，不生成候选 Story 队列。若 Issue 太大，在 kickoff.md 记录留在 GitHub backlog 的其余范围。\n- story.md 必须且只能定义一张带稳定 US-xxx ID 的 Card：角色、问题/目标、价值、成功信号；不要预写问题、验收示例、实现方案或优先级表。\n- kickoff.md 记录本轮问题、价值假设、受影响产品旅程、边界和非目标，并引用产品基线而非复制它。\n- 完成后由人类 Gate 判断这个问题现在是否值得进入 Discover。`;
    case 'discover':
      return `- 只处理 01-kickoff/story.md 中的一张 Story。根据已有答案选择当前最高价值的业务未知，先形成 Thought，再调用 evidence_orchestrator_ask_question 提出一个非技术 Question，并立即停止。Answer 只能来自领域专家。\n- 没有高价值未知后，写 discovery.md，总结已确认规则、术语、关键数据、仍有风险及答案来源；不要把推测写成事实。\n- 在 examples/ 写至少一个具体 US-xxx-SC-xxx.md，使用 Given/When/Then 和可观察结果。只为已确认范围内的必要失败或边界行为增加场景；非目标不生成反向示例。\n- Discover 合并澄清、示例规格化和就绪检查，不再创建独立验证报告或 Story 结论状态。`;
    case 'model':
      return `- 先尝试用当前 .evidence 模型展开每个示例的 Given、When、Then、关系、不变量和时间线；只有解释失败时才修改权威模型。\n- model-snapshot.json 与 model-delta.json 必须基于同一 Git baseline；delta 与真实 .evidence Git 变化一致。\n- 每个示例在 expansions/ 生成一个 US-xxx-SC-xxx.json，并只引用存在的稳定模型 ID。\n- walkthrough.md 面向领域专家说明模型如何解释例子、仍需关注的反例和本轮最小模型变化；不要用战术设计文档复制模型。`;
    case 'design':
      return `- 从已展开示例中只选择一个最小可验收场景；其他场景返回后续 Issue，不建立并行 Sprint backlog。\n- delivery-plan.md 只记录该场景的价值切片、实现边界、架构/API/data 增量（确有变化时）、风险和完成条件。\n- scenario-context-map.json 把唯一场景映射到 owning runtimes、完整 functional contexts、Q2/Q1 测试意图、测试替身和唯一候选工序。\n- 不复制完整架构、契约、测试策略、工序或 DoD，也不生成“无变化”占位 delta。`;
    case 'build':
      return `- 只能实现 active work item 指定的一张 Story 和一个 Scenario；未选择时先调用 evidence_orchestrator_select_work_item。\n- 修改代码前，为每个 owning runtime 调用 evidence_orchestrator_select_test_process，以完整 functional contexts 唯一选择测试工序；零个或多个匹配都返回 Design 修正。\n- 对每个工序执行有语义的 Red → 最小 Green → 保持 Green 的 Refactor。Red 必须由聚焦测试中的预期业务断言失败造成；依赖、编译、配置或环境错误不算 Red。\n- 所有命令通过 evidence_orchestrator_run_test_step 执行并追加到 05-build/<US>/<SC>.execution.jsonl；同时提交真实测试、生产代码和机器场景证据。`;
    case 'showcase':
      return `- 对领域专家展示实际可运行的唯一场景，而不是只展示测试报告或代码 diff。\n- showcase.md 连接 Story 成功信号、Given/When/Then、模型解释、运行方式、观察结果、已知限制和待反馈问题；命令事实引用 execution.jsonl，不手填退出码。\n- 独立检查实现是否越过场景边界、模型是否仍能解释行为、质量门禁是否真实通过。Critical/Major 问题必须在进入 Learn 前解决或由人明确停止。\n- 完成后由人类 Gate 判断可运行增量是否解决了 Kickoff 问题。`;
    case 'learn':
      return `- iteration-summary.md 使用 Probe/Sense/Respond 记录本轮观察、解释和下一动作；不要只复述阶段完成情况。\n- knowledge-promotion.json 逐项记录候选知识的 promoted/deferred/rejected 及理由；promoted 必须指向真实权威目标。没有候选变化时允许空 promotions，但不得创建虚假变化。\n- next-issue.md 形成一个后续问题或明确说明停止；GitHub Issue 仍是下一轮权威来源。\n- iteration 只保留 delta、决策和执行证据，稳定知识提升到 docs/product/、.evidence/、docs/architecture/、contracts/ 或 engineering/evidence-orchestrator/。`;
  }
}
