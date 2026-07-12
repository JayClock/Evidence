---
name: scrum
description: 'Apply Scrum planning to product backlogs, sprint plans, sprint backlogs, estimates, dependencies, acceptance criteria, and Definition of Done. Use during Evidence Workflow planning.'
---

# Scrum Planning Skill

Use this skill in the `planning` phase.

## Inputs

- GitHub Issues/Projects：Product Backlog 权威来源
- `engineering/evidence-workflow/definition-of-done.md`：团队统一 DoD
- 本轮故事、示例和 `scenario-context-map.json`

## Outputs

- `artifacts/04-planning/sprint-plan.md`
- `artifacts/04-planning/sprint-1-backlog.md`
- `artifacts/04-planning/backlog-delta.md`

## Rules

- 不在 iteration 复制完整 Product Backlog 或 DoD。
- Backlog 变化写入 `backlog-delta.md`，确认后同步 GitHub。
- Sprint 1 只选择一个可实现的场景切片，并包含估算、验收标准、追踪链及 DoD Git 版本。
- 场景特有完成条件可以追加，但不能降低统一 DoD。
- 表格保持稳定以便自动审查。

## Embedded Methodology

# Agile / Scrum（敏捷开发）

## 概述

Scrum 是迭代式增量开发框架，强调在固定时间盒（Sprint）内交付可工作的软件增量，并根据反馈持续改进。

## 角色

- **Product Owner**：负责需求优先级，最大化交付价值
- **Scrum Master**：确保 Scrum 流程正常执行
- **开发团队**：自组织，跨职能

## 工件

### Product Backlog

- 按优先级排序的需求列表
- 每个条目包含：描述、估算、优先级、验收标准
- 持续精化（Backlog Refinement）

### Sprint Backlog

- 当前 Sprint 选中的 Backlog 条目 + 实现计划
- 开发团队自行管理

### Increment（增量）

- 每个 Sprint 结束时交付的**可工作**的产品增量
- 必须满足 DoD（Definition of Done）

### DoD（Definition of Done）

- 每个条目必须满足的最低质量标准
- 例如：代码已审查、测试通过、文档已更新

## 事件

### Sprint Planning

- 确定 Sprint 目标和选中的 Backlog
- 团队估算工作量

### Daily Standup

- 同步进度，识别阻塞
- 15 分钟，三个问题：昨天做了什么、今天要做什么、有什么阻碍

### Sprint Review

- 向利益相关者演示增量
- 收集反馈，调整 Backlog

### Sprint Retrospective

- 检视流程，识别改进点
- 输出具体的改进行动

## 在元工程中的应用

元工程自动化了以下 Scrum 流程：

1. **Backlog 生成**：LLM 将需求拆分为用户故事并估算
2. **Sprint 计划**：按优先级和依赖关系分配到 Sprint
3. **增量交付**：每个 TDD 循环产出一个可运行的 Increment
4. **自动检视**：质量门禁替代人工 Review（但仍可由人类 Gate 审核）
