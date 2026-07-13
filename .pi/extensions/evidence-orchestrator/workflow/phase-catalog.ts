import type { GateMode, Phase, PhaseMeta, WorkflowState } from './types';

export const PHASE_ORDER: Phase[] = [
  'frame',
  'clarify',
  'specify',
  'validate',
  'domain_model',
  'architecture',
  'planning',
  'coding',
  'review',
  'learn',
  'complete',
];

export const DEFAULT_STATE: WorkflowState = {
  iteration_id: 'ITER-0001',
  phase: 'frame',
  round: 0,
  pending_gate: null,
  failures: 0,
  max_rounds: 5,
  artifacts: [],
  gate_config: {
    frame: 'auto',
    clarify: 'auto',
    specify: 'auto',
    validate: 'review',
    domain_model: 'review',
    architecture: 'review',
    planning: 'auto',
    coding: 'auto',
    review: 'review',
    learn: 'auto',
  } satisfies Record<string, GateMode>,
  pi: {
    enabled: true,
    version: 4,
  },
};

export const PHASE_META: Record<Exclude<Phase, 'complete'>, PhaseMeta> = {
  frame: {
    title: '问题框定 — Design Thinking',
    inputs: [
      'artifacts/00-user-input/requirements.md',
      'docs/knowledge-governance.md',
      'docs/product/personas.md',
      'docs/product/business-context.md',
      'docs/product/user-journeys.md',
      'docs/product/story-map.md',
    ],
    outputs: [
      'artifacts/01-requirements/problem-statement.md',
      'artifacts/01-requirements/product-context-delta.md',
      'artifacts/01-requirements/journey-slice.md',
      'artifacts/01-requirements/story-map-delta.md',
    ],
    gateId: 'GATE-101-frame',
    gateTitle: '问题框定审核',
  },
  clarify: {
    title: '需求澄清 — TQA',
    inputs: [
      'docs/product/business-context.md',
      'docs/product/user-journeys.md',
      'docs/product/story-map.md',
      'artifacts/01-requirements/problem-statement.md',
      'artifacts/01-requirements/product-context-delta.md',
      'artifacts/01-requirements/journey-slice.md',
      'artifacts/01-requirements/story-map-delta.md',
    ],
    outputs: [
      'artifacts/01-requirements/stories/',
      'artifacts/01-requirements/clarifications/',
    ],
    gateId: 'GATE-102-clarify',
    gateTitle: '需求澄清审核',
  },
  specify: {
    title: '示例规格化 — Specification by Example',
    inputs: [
      'artifacts/01-requirements/stories/',
      'artifacts/01-requirements/clarifications/',
      'docs/product/user-journeys.md',
      'artifacts/01-requirements/journey-slice.md',
    ],
    outputs: ['artifacts/01-requirements/examples/'],
    gateId: 'GATE-103-specify',
    gateTitle: '验收示例审核',
  },
  validate: {
    title: '需求验证 — Story and Example Review',
    inputs: [
      'artifacts/01-requirements/stories/',
      'artifacts/01-requirements/examples/',
      'docs/product/business-context.md',
      'artifacts/01-requirements/product-context-delta.md',
    ],
    outputs: ['artifacts/01-requirements/requirements-validation.md'],
    gateId: 'GATE-104-validate',
    gateTitle: '需求验证审核',
  },
  domain_model: {
    title: '领域建模与模型展开 — DDD',
    inputs: [
      'artifacts/01-requirements/stories/',
      'artifacts/01-requirements/examples/',
      'artifacts/01-requirements/requirements-validation.md',
      '.evidence/entities/',
      '.evidence/associations/',
    ],
    outputs: [
      '.evidence/model.json',
      '.evidence/entities/',
      '.evidence/associations/',
      'artifacts/02-domain-model/model-snapshot.json',
      'artifacts/02-domain-model/model-delta.json',
      'artifacts/02-domain-model/model-expansions/',
      'artifacts/02-domain-model/tactical-design.md',
      'artifacts/02-domain-model/validation-report.md',
    ],
    gateId: 'GATE-105-domain-model',
    gateTitle: '领域模型评审',
  },
  architecture: {
    title: '架构与测试策略 — DDD Tactical Design',
    inputs: [
      '.evidence/model.json',
      '.evidence/entities/',
      '.evidence/associations/',
      'artifacts/02-domain-model/model-snapshot.json',
      'artifacts/02-domain-model/model-delta.json',
      'artifacts/02-domain-model/model-expansions/',
      'artifacts/02-domain-model/tactical-design.md',
      'artifacts/02-domain-model/validation-report.md',
      'docs/architecture/context-map.md',
      'docs/architecture/architecture-style.md',
      'docs/architecture/tech-stack.md',
      'docs/architecture/module-structure.md',
      'docs/architecture/test-strategy.md',
      'docs/architecture/test-doubles.md',
      'contracts/api.yaml',
      'engineering/evidence-orchestrator/runtime-contexts.json',
      'engineering/evidence-orchestrator/test-processes/',
    ],
    outputs: [
      'artifacts/03-architecture/architecture-decisions.md',
      'artifacts/03-architecture/api-contract-delta.md',
      'artifacts/03-architecture/data-model-delta.md',
      'artifacts/03-architecture/scenario-context-map.json',
    ],
    gateId: 'GATE-106-architecture',
    gateTitle: '架构与测试策略评审',
  },
  planning: {
    title: '垂直切片计划 — Scrum Planning',
    inputs: [
      'artifacts/01-requirements/stories/',
      'artifacts/01-requirements/examples/',
      'artifacts/03-architecture/scenario-context-map.json',
      'docs/architecture/test-strategy.md',
      'engineering/evidence-orchestrator/test-processes/',
      'engineering/evidence-orchestrator/definition-of-done.md',
    ],
    outputs: [
      'artifacts/04-planning/sprint-plan.md',
      'artifacts/04-planning/sprint-1-backlog.md',
      'artifacts/04-planning/backlog-delta.md',
    ],
    gateId: 'GATE-107-planning',
    gateTitle: '垂直切片计划确认',
  },
  coding: {
    title: '单场景编码与测试 — TDD',
    inputs: [
      'artifacts/01-requirements/stories/',
      'artifacts/01-requirements/examples/',
      'artifacts/02-domain-model/model-expansions/',
      'artifacts/03-architecture/scenario-context-map.json',
      'docs/architecture/test-strategy.md',
      'engineering/evidence-orchestrator/test-processes/',
      'artifacts/04-planning/sprint-1-backlog.md',
      'engineering/evidence-orchestrator/definition-of-done.md',
    ],
    outputs: ['apps/', 'libs/', 'artifacts/05-code/'],
    gateId: 'GATE-108-code-review',
    gateTitle: '代码审查',
  },
  review: {
    title: '产品与质量评审 — Quality Gate',
    inputs: [
      'apps/',
      'libs/',
      'artifacts/05-code/',
      'artifacts/01-requirements/examples/',
      'docs/architecture/test-strategy.md',
      'engineering/evidence-orchestrator/definition-of-done.md',
    ],
    outputs: ['artifacts/06-reviews/'],
    gateId: 'GATE-109-review',
    gateTitle: '产品与质量评审',
  },
  learn: {
    title: '学习与下一轮迭代 — Probe Sense Respond',
    inputs: [
      'artifacts/06-reviews/',
      'artifacts/01-requirements/stories/',
      'artifacts/01-requirements/product-context-delta.md',
      'artifacts/01-requirements/story-map-delta.md',
      '.evidence/model.json',
      'artifacts/02-domain-model/model-delta.json',
      'artifacts/02-domain-model/validation-report.md',
      'artifacts/03-architecture/architecture-decisions.md',
      'artifacts/03-architecture/api-contract-delta.md',
      'artifacts/03-architecture/data-model-delta.md',
      'artifacts/04-planning/backlog-delta.md',
    ],
    outputs: [
      'artifacts/07-learning/iteration-summary.md',
      'artifacts/07-learning/knowledge-promotion.json',
      'artifacts/07-learning/next-iteration.md',
    ],
    gateId: 'GATE-110-learning',
    gateTitle: '下一轮迭代确认',
  },
};

export function nextPhase(phase: Phase): Phase {
  const index = PHASE_ORDER.indexOf(phase);
  return PHASE_ORDER[Math.min(index + 1, PHASE_ORDER.length - 1)] ?? 'complete';
}

export function phaseSpecificInstructions(
  phase: Exclude<Phase, 'complete'>,
): string {
  switch (phase) {
    case 'frame':
      return `- 先读取 docs/knowledge-governance.md 与 docs/product/ 的产品级画像、业务上下文、核心旅程和故事地图；它们是统一基线。引用时写路径及相关标题、活动或步骤 ID，绝不复制基线表格、列表或正文。\n- 以角色 + 价值定义本轮问题，避免把 API、HAL、数据库或测试框架伪装成用户价值。problem-statement 是本轮共享上下文；其余 requirements 工件引用它，不重复角色、价值、范围或非目标。\n- product-context-delta 只记录候选新增、修正或删除的产品知识及其依据、影响和待验证事项；不得写“无变化”行。\n- journey-slice 只标识受影响的基线旅程步骤，并记录本轮改变的路径、可观察结果与边界；不得重述完整旅程。story-map-delta 只标识受影响活动和候选故事；不得重述完整活动主干或列出未变化活动。\n- 所有候选知识在 learn 审核并提升前都不是产品事实。`;
    case 'clarify':
      return `- 为每个候选 P0/P1 故事建立 artifacts/01-requirements/stories/US-xxx.md。\n- 使用 TQA（Thought-Question-Answer）一次只提出一个高价值、非技术业务问题。调用 evidence_orchestrator_ask_question 后必须停止，等待领域专家明确回答；不得自问自答或继续运行工作流。\n- 收到用户明确答案后，调用 evidence_orchestrator_answer_question。目标为 business_context 的答案追加到本轮 product-context-delta.md，不得直接修改 docs/product/business-context.md；story 更新对应故事；history 仅保留澄清历史。\n- 每个问答写入 artifacts/01-requirements/clarifications/ 的 Markdown 和 JSON；任何 pending clarification 都会阻止故事进入 Ready 或工作流进入下一阶段。`;
    case 'specify':
      return `- 对每个准备进入建模的故事，在 artifacts/01-requirements/examples/ 写 SC-xxx 示例。\n- 每个示例必须是具体的 Given/When/Then，包含可观察结果、关键业务数据和边界/失败场景；不要写实现步骤。`;
    case 'validate':
      return `- 审核故事是否仍以角色和价值定义问题，验收示例是否覆盖关键正反场景。\n- 输出 requirements-validation.md，逐项标注 Ready、需澄清或需拆分；只有 Ready 故事可作为领域模型的验证集。`;
    case 'domain_model':
      return `- .evidence/ 是当前项目长期演进的权威领域模型，同时是本阶段输入和输出。先读取现有模型并尝试展开 Ready 场景；只有发现概念缺失、关系错置或生命周期错误时才修改模型。\n- .evidence/model.json 必须声明 version=1、project_name 和 purpose；实体与关联使用稳定 frontmatter id，关联的 source/target 必须引用现有实体。\n- artifacts/02-domain-model/ 只记录本轮证据：model-snapshot.json（Git baseline、model_root、完整 included_paths）、model-delta.json（与 Git 实际变化一致的 added/changed/removed 和原因）、tactical-design.md、validation-report.md。不得再维护一套与 .evidence 重复的领域模型。\n- 对每个 Ready 场景生成 model-expansions/US-xxx-SC-xxx.json（version=1），以 model_refs.entities/associations 引用 .evidence 稳定 ID，并记录 Given、When、Then、不变量和时间线。`;
    case 'architecture':
      return `- 读取 docs/architecture/、contracts/api.yaml 和 engineering/evidence-orchestrator/，不得在 iteration 复制完整架构、技术栈、API、数据模型、测试策略或工序。\n- architecture-decisions.md 只记录本场景新增或偏离既有架构的决策；无变化也要明确记录。api-contract-delta.md 与 data-model-delta.md 只描述本轮增量及对应权威源码路径。\n- scenario-context-map.json（version=1）把每个 Ready 场景映射到 owning runtimes、完整 functional contexts、Q2/Q1 测试意图、测试替身和候选目录工序。\n- 目录未覆盖时才修改 engineering/evidence-orchestrator/test-processes/；具体工序由 coding 选择后快照到 selected-test-processes/。`;
    case 'planning':
      return `- 以垂直切片规划，不把“检查现有代码”当作交付任务。\n- GitHub Issues/Projects 是 Product Backlog 权威来源；iteration 仅输出 sprint-plan、sprint-1-backlog 和 backlog-delta，不复制完整 Product Backlog。\n- engineering/evidence-orchestrator/definition-of-done.md 是统一 DoD；本轮只引用其版本并在 sprint backlog 记录额外完成条件。\n- 每一个已计划场景必须追踪：SC-xxx → Q2 验收测试 → 功能上下文 → Q1 测试 → 测试替身 → 实现任务。Sprint 1 只选择一个可验证的最小场景切片。`;
    case 'coding':
      return `- 每次 coding 只能实现当前 active work item 指定的一个 US-xxx / SC-xxx；未选择时先调用 evidence_orchestrator_select_work_item，不能修改业务代码。选择工作项会记录 Git baseline，若 apps/ 或 libs/ 已有未提交变更必须先处理。\n- 选择场景后、修改代码前，必须为每个 owning runtime 调用 evidence_orchestrator_select_test_process，以 runtime 和完整 functional contexts 唯一匹配 JSON 工序；零个或多个匹配都必须回到架构修正，不能自行挑选。多个 runtime 的选择顺序构成该场景的 test_plan。\n- 严格按对应 test plan 的每一个 process/step 执行 Red：先写该场景测试并运行确认预期行为失败；Green：最小真实实现；Refactor：保持全部相关测试通过。Issue 驱动 iteration 必须使用 evidence_orchestrator_run_test_step 执行工序声明命令，不能手填退出码。\n- 除 Markdown 外，在 artifacts/05-code/<US-xxx>/<SC-xxx>.json 写 version=1 机器证据：work_item（含 git_baseline 与 test_plan）、SC→Q2→functional contexts→Q1→test double→每个 process step 的 tests/TDD、process quality_gates、changed_code_paths，以及总 Red（非零且 expected_failure=true）/Green（0）/Refactor（0）的命令和退出码。Git 变更必须包含至少一个测试文件和一个生产代码文件。`;
    case 'review':
      return `- 对照具体 SC-xxx 的验收示例、模型展开、测试策略、测试工序和 DoD 审查代码。\n- 输出 artifacts/06-reviews/review-round<round>.md，明确 Critical / Major / Minor、实际命令结果及是否验证了用户价值。`;
    case 'learn':
      return `- 将本轮 Probe/Sense/Respond 的产品反馈、领域知识修正、架构/工序观察和未完成风险写入 iteration-summary.md。\n- 审核 product-context-delta、story-map-delta、架构决策和 backlog-delta；被接受的稳定知识必须提升到 docs/product/、docs/architecture/、.evidence/ 或 engineering/evidence-orchestrator/，iteration 文件仍保持历史证据。\n- knowledge-promotion.json 使用 version=1 和非空 promotions；每项记录 source、decision（promoted/deferred/rejected）、reason，promoted 还必须记录存在的 canonical target。\n- 在 next-iteration.md 形成下一轮可执行问题框定输入；确认后更新 GitHub Issue，再创建新快照。不要手工修改 requirements.md 投影，也不要把 complete 当作产品开发终点。`;
  }
}
