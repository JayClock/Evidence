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
    skill: 'design-thinking',
    inputs: ['artifacts/00-user-input/requirements.md'],
    outputs: [
      'artifacts/01-requirements/personas.md',
      'artifacts/01-requirements/problem-statement.md',
      'artifacts/01-requirements/business-context.md',
      'artifacts/01-requirements/user-journeys.md',
      'artifacts/01-requirements/story-map.md',
    ],
    gateId: 'GATE-101-frame',
    gateTitle: '问题框定审核',
  },
  clarify: {
    title: '需求澄清 — TQA',
    skill: 'design-thinking',
    inputs: [
      'artifacts/01-requirements/business-context.md',
      'artifacts/01-requirements/user-journeys.md',
      'artifacts/01-requirements/story-map.md',
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
    skill: 'design-thinking',
    inputs: [
      'artifacts/01-requirements/stories/',
      'artifacts/01-requirements/clarifications/',
      'artifacts/01-requirements/user-journeys.md',
    ],
    outputs: ['artifacts/01-requirements/examples/'],
    gateId: 'GATE-103-specify',
    gateTitle: '验收示例审核',
  },
  validate: {
    title: '需求验证 — Story and Example Review',
    skill: 'design-thinking',
    inputs: [
      'artifacts/01-requirements/stories/',
      'artifacts/01-requirements/examples/',
      'artifacts/01-requirements/business-context.md',
    ],
    outputs: ['artifacts/01-requirements/requirements-validation.md'],
    gateId: 'GATE-104-validate',
    gateTitle: '需求验证审核',
  },
  domain_model: {
    title: '领域建模与模型展开 — DDD',
    skill: 'ddd',
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
    skill: 'ddd',
    inputs: [
      '.evidence/model.json',
      '.evidence/entities/',
      '.evidence/associations/',
      'artifacts/02-domain-model/model-snapshot.json',
      'artifacts/02-domain-model/model-delta.json',
      'artifacts/02-domain-model/model-expansions/',
      'artifacts/02-domain-model/tactical-design.md',
      'artifacts/02-domain-model/validation-report.md',
    ],
    outputs: [
      'artifacts/03-architecture/context-map.md',
      'artifacts/03-architecture/architecture-style.md',
      'artifacts/03-architecture/tech-stack.md',
      'artifacts/03-architecture/module-structure.md',
      'artifacts/03-architecture/api-contracts.md',
      'artifacts/03-architecture/data-model.md',
      'artifacts/03-architecture/functional-contexts.md',
      'artifacts/03-architecture/test-strategy.md',
      'artifacts/03-architecture/test-doubles.md',
      'artifacts/03-architecture/test-processes/',
    ],
    gateId: 'GATE-106-architecture',
    gateTitle: '架构与测试策略评审',
  },
  planning: {
    title: '垂直切片计划 — Scrum Planning',
    skill: 'scrum',
    inputs: [
      'artifacts/01-requirements/stories/',
      'artifacts/01-requirements/examples/',
      'artifacts/03-architecture/functional-contexts.md',
      'artifacts/03-architecture/test-strategy.md',
      'artifacts/03-architecture/test-processes/',
    ],
    outputs: [
      'artifacts/04-planning/product-backlog.md',
      'artifacts/04-planning/sprint-plan.md',
      'artifacts/04-planning/sprint-1-backlog.md',
      'artifacts/04-planning/definition-of-done.md',
    ],
    gateId: 'GATE-107-planning',
    gateTitle: '垂直切片计划确认',
  },
  coding: {
    title: '单场景编码与测试 — TDD',
    skill: 'tdd',
    inputs: [
      'artifacts/01-requirements/stories/',
      'artifacts/01-requirements/examples/',
      'artifacts/02-domain-model/model-expansions/',
      'artifacts/03-architecture/test-strategy.md',
      'artifacts/03-architecture/test-processes/',
      'artifacts/04-planning/sprint-1-backlog.md',
      'artifacts/04-planning/definition-of-done.md',
    ],
    outputs: ['apps/', 'libs/', 'artifacts/05-code/'],
    gateId: 'GATE-108-code-review',
    gateTitle: '代码审查',
  },
  review: {
    title: '产品与质量评审 — Quality Gate',
    skill: 'evidence-workflow-methodology',
    inputs: [
      'apps/',
      'libs/',
      'artifacts/05-code/',
      'artifacts/01-requirements/examples/',
      'artifacts/03-architecture/test-strategy.md',
      'artifacts/04-planning/definition-of-done.md',
    ],
    outputs: ['artifacts/06-reviews/'],
    gateId: 'GATE-109-review',
    gateTitle: '产品与质量评审',
  },
  learn: {
    title: '学习与下一轮迭代 — Probe Sense Respond',
    skill: 'evidence-workflow-methodology',
    inputs: [
      'artifacts/06-reviews/',
      'artifacts/01-requirements/stories/',
      '.evidence/model.json',
      'artifacts/02-domain-model/model-delta.json',
      'artifacts/02-domain-model/validation-report.md',
    ],
    outputs: [
      'artifacts/07-learning/iteration-summary.md',
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
      return `- 先定义角色、价值、业务边界和用户旅程；角色 + 价值描述问题，避免把 API、HAL、数据库或测试框架伪装成用户价值。\n- 输出业务上下文和故事地图；故事地图只列候选故事，不得替代后续逐故事澄清。`;
    case 'clarify':
      return `- 为每个候选 P0/P1 故事建立 artifacts/01-requirements/stories/US-xxx.md。\n- 使用 TQA（Thought-Question-Answer）一次只提出一个高价值业务问题；通过 requirements clarification 工具记录问题和回答。\n- 将已回答问题、仍未决问题及其对故事/上下文的影响写入 artifacts/01-requirements/clarifications/。不得询问技术设计问题。`;
    case 'specify':
      return `- 对每个准备进入建模的故事，在 artifacts/01-requirements/examples/ 写 SC-xxx 示例。\n- 每个示例必须是具体的 Given/When/Then，包含可观察结果、关键业务数据和边界/失败场景；不要写实现步骤。`;
    case 'validate':
      return `- 审核故事是否仍以角色和价值定义问题，验收示例是否覆盖关键正反场景。\n- 输出 requirements-validation.md，逐项标注 Ready、需澄清或需拆分；只有 Ready 故事可作为领域模型的验证集。`;
    case 'domain_model':
      return `- .evidence/ 是当前项目长期演进的权威领域模型，同时是本阶段输入和输出。先读取现有模型并尝试展开 Ready 场景；只有发现概念缺失、关系错置或生命周期错误时才修改模型。\n- .evidence/model.json 必须声明 version=1、project_name 和 purpose；实体与关联使用稳定 frontmatter id，关联的 source/target 必须引用现有实体。\n- artifacts/02-domain-model/ 只记录本轮证据：model-snapshot.json（Git baseline、model_root、完整 included_paths）、model-delta.json（与 Git 实际变化一致的 added/changed/removed 和原因）、tactical-design.md、validation-report.md。不得再维护一套与 .evidence 重复的领域模型。\n- 对每个 Ready 场景生成 model-expansions/US-xxx-SC-xxx.json（version=1），以 model_refs.entities/associations 引用 .evidence 稳定 ID，并记录 Given、When、Then、不变量和时间线。`;
    case 'architecture':
      return `- 输出上下文映射、架构风格、技术栈、模块结构、API 契约和数据模型。\n- 新增 functional-contexts.md：场景到功能上下文的映射；test-strategy.md：Q2 验收测试如何被 Q1 组件/领域测试支撑；test-doubles.md：real/fake/stub/spy/mock 的选择。\n- 在 test-processes/ 为每类实现路径写可复用测试工序，按测试先行顺序拆分任务。`;
    case 'planning':
      return `- 以垂直切片规划，不把“检查现有代码”当作交付任务。\n- 每一个已计划场景都必须追踪：SC-xxx → Q2 验收测试 → 功能上下文 → Q1 测试 → 测试替身 → 实现任务。\n- Sprint 1 Backlog 只选择可在一个场景内完成和验证的最小切片。`;
    case 'coding':
      return `- 每次 coding 只能实现当前 active work item 指定的一个 US-xxx / SC-xxx；未选择时先调用 evidence_workflow_select_work_item，不能修改业务代码。选择工作项会记录 Git baseline，若 apps/ 或 libs/ 已有未提交变更必须先处理。\n- 严格按对应 test process 执行 Red：先写该场景测试并运行确认预期行为失败；Green：最小真实实现；Refactor：保持全部相关测试通过。\n- 除 Markdown 外，在 artifacts/05-code/<US-xxx>/<SC-xxx>.json 写 version=1 机器证据：work_item（含 git_baseline）、scenario→Q2/Q1 tests→functional contexts 追踪、changed_code_paths、以及 Red（非零且 expected_failure=true）/Green（0）/Refactor（0）的命令和 exit_code。Git 变更必须包含至少一个测试文件和一个生产代码文件。`;
    case 'review':
      return `- 对照具体 SC-xxx 的验收示例、模型展开、测试策略、测试工序和 DoD 审查代码。\n- 输出 artifacts/06-reviews/review-round<round>.md，明确 Critical / Major / Minor、实际命令结果及是否验证了用户价值。`;
    case 'learn':
      return `- 将本轮 Probe/Sense/Respond 的产品反馈、领域知识修正、质量观察和未完成风险写入 iteration-summary.md。\n- 在 next-iteration.md 形成下一轮可执行问题框定输入；不要把 complete 当作产品开发终点。`;
  }
}
