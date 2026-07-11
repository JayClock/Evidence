import type { GateMode, MetaState, Phase, PhaseMeta } from './types';

export const PHASE_ORDER: Phase[] = [
  'requirements',
  'domain_model',
  'architecture',
  'planning',
  'coding',
  'review',
  'complete',
];

export const DEFAULT_STATE: MetaState = {
  phase: 'requirements',
  round: 0,
  pending_gate: null,
  failures: 0,
  max_rounds: 5,
  artifacts: [],
  gate_config: {
    requirements: 'review',
    domain_model: 'review',
    architecture: 'review',
    planning: 'auto',
    coding: 'auto',
    review: 'review',
  } satisfies Record<string, GateMode>,
  pi: {
    enabled: true,
    version: 3,
  },
};

export const PHASE_META: Record<Exclude<Phase, 'complete'>, PhaseMeta> = {
  requirements: {
    title: '需求分析 — Design Thinking',
    skill: 'design-thinking',
    inputs: ['artifacts/00-user-input/requirements.md'],
    outputs: [
      'artifacts/01-requirements/personas.md',
      'artifacts/01-requirements/problem-statement.md',
      'artifacts/01-requirements/story-map.md',
    ],
    gateId: 'GATE-001-requirements',
    gateTitle: '需求审核',
  },
  domain_model: {
    title: '领域建模 — DDD Strategic Design',
    skill: 'ddd',
    inputs: [
      'artifacts/01-requirements/personas.md',
      'artifacts/01-requirements/problem-statement.md',
      'artifacts/01-requirements/story-map.md',
    ],
    outputs: [
      'artifacts/02-domain-model/ubiquitous-language.md',
      'artifacts/02-domain-model/bounded-contexts.md',
      'artifacts/02-domain-model/entities-and-value-objects.md',
      'artifacts/02-domain-model/aggregates.md',
      'artifacts/02-domain-model/domain-events.md',
    ],
    gateId: 'GATE-002-domain-model',
    gateTitle: '领域模型评审',
  },
  architecture: {
    title: '架构设计 — DDD Tactical Design + Agile Architecture',
    skill: 'ddd',
    inputs: [
      'artifacts/02-domain-model/ubiquitous-language.md',
      'artifacts/02-domain-model/bounded-contexts.md',
      'artifacts/02-domain-model/entities-and-value-objects.md',
      'artifacts/02-domain-model/aggregates.md',
      'artifacts/02-domain-model/domain-events.md',
    ],
    outputs: [
      'artifacts/03-architecture/context-map.md',
      'artifacts/03-architecture/architecture-style.md',
      'artifacts/03-architecture/tech-stack.md',
      'artifacts/03-architecture/module-structure.md',
      'artifacts/03-architecture/api-contracts.md',
      'artifacts/03-architecture/data-model.md',
    ],
    gateId: 'GATE-003-architecture',
    gateTitle: '架构评审',
  },
  planning: {
    title: '迭代计划 — Scrum Planning',
    skill: 'scrum',
    inputs: [
      'artifacts/01-requirements/story-map.md',
      'artifacts/03-architecture/module-structure.md',
      'artifacts/03-architecture/api-contracts.md',
    ],
    outputs: [
      'artifacts/04-planning/product-backlog.md',
      'artifacts/04-planning/sprint-plan.md',
      'artifacts/04-planning/sprint-1-backlog.md',
      'artifacts/04-planning/definition-of-done.md',
    ],
    gateId: 'GATE-004-planning',
    gateTitle: '迭代计划确认',
  },
  coding: {
    title: '编码与测试 — TDD',
    skill: 'tdd',
    inputs: [
      'artifacts/04-planning/sprint-1-backlog.md',
      'artifacts/04-planning/definition-of-done.md',
      'artifacts/03-architecture/api-contracts.md',
      'artifacts/03-architecture/module-structure.md',
    ],
    outputs: ['apps/', 'libs/', 'artifacts/05-code/'],
    gateId: 'GATE-005-code-review',
    gateTitle: '代码审查',
  },
  review: {
    title: '持续改进 — Review + Quality Gate',
    skill: 'evidence-workflow-methodology',
    inputs: [
      'apps/',
      'libs/',
      'artifacts/05-code/',
      'artifacts/04-planning/definition-of-done.md',
      'artifacts/03-architecture/module-structure.md',
    ],
    outputs: ['artifacts/06-reviews/'],
    gateId: 'GATE-006-final-review',
    gateTitle: '最终评审',
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
    case 'requirements':
      return `- 输出 personas、problem statement、story map。\n- 每个用户故事必须有 US-xxx ID、角色、价值、验收标准和优先级。`;
    case 'domain_model':
      return `- 输出统一语言、限界上下文、实体/值对象、聚合、领域事件。\n- 表格列名保持稳定，必要时加入 Mermaid 图。`;
    case 'architecture':
      return `- 输出上下文映射、架构风格、技术栈、模块结构、API 契约、数据模型。\n- API 契约要能指导后续真实代码实现。`;
    case 'planning':
      return `- 输出 Product Backlog、Sprint Plan、Sprint 1 Backlog、Definition of Done。\n- Sprint 1 Backlog 必须包含可执行开发任务和清晰验收标准。`;
    case 'coding':
      return `- 从 Sprint 1 Backlog 选择下一个未实现故事，并先判断所属 Nx/Cargo 项目。\n- Red：在目标项目现有测试位置先写失败测试，不得创建根级 src/ 或 tests/。\n- Green：在 apps/<project>/ 或 libs/<project>/ 中写最小真实实现。\n- Refactor：改善结构并保持测试语义。\n- Web/Nest 增量运行对应 Nx test、lint、typecheck；Rust/Tauri 增量运行 cargo test、clippy、fmt。\n- 将故事 ID、改动路径、Red/Green/Refactor 证据和命令结果写入 artifacts/05-code/。`;
    case 'review':
      return `- 审查 artifacts、apps、libs、测试与 DoD 的一致性。\n- 输出 artifacts/06-reviews/review-round<round>.md。\n- 根据改动表面执行对应 Nx/Cargo 质量门禁，并记录实际命令与结果。\n- 评审报告必须使用中文撰写；代码、命令、路径、API 字段名和专有名词可以保留英文。\n- 明确列出 Critical / Major / Minor 问题和总体结论。`;
  }
}
