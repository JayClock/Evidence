---
name: evidence-workflow-methodology
description: '运行 Evidence 的反馈驱动工作流：TQA 需求澄清、模型展开、测试工序架构、场景级 TDD 与迭代学习。'
---

# Evidence Workflow 方法论技能

当用户要求运行、检查、改进或扩展 Evidence Workflow 时使用本技能。

## 工作流程

1. 读取 `evidence-state.json`，识别当前阶段、活动工作项、轮次和待处理 gate。
2. 新迭代以 GitHub Issue 为需求权威来源，通过 `/evidence-reset --issue=<number>` 冻结 `artifacts/iterations/<iteration_id>/00-user-input/issue.json`，并生成只读 `requirements.md` 投影。后续迭代应将同一目录下 `07-learning/next-iteration.md` 的反馈更新到 Issue 后再创建新快照；不得手工维护投影。
3. 保留 `artifacts/iterations/<iteration_id>/` 作为该轮可审计的事实来源。不能因为开始新阶段或新迭代就覆盖任何历史证据。阶段提示词中出现的 `artifacts/...` 逻辑路径必须解析到活动 `iteration_id` 目录。
4. `.evidence/` 是当前项目长期演进的权威领域模型，也是 `domain_model` 阶段的输入和输出。`artifacts/02-domain-model/` 只保存本轮模型快照、模型增量、场景展开、战术设计和验证报告，不得维护另一套重复模型。
5. 按阶段应用技能：
   - `frame`、`clarify`、`specify`、`validate`：`.pi/skills/design-thinking/SKILL.md`
   - `domain_model`、`architecture`：`.pi/skills/ddd/SKILL.md`
   - `planning`：`.pi/skills/scrum/SKILL.md`
   - `coding`：`.pi/skills/tdd/SKILL.md`
   - `review`、`learn`：严格对照示例、模型展开、测试策略、DoD 和产品反馈进行评审
6. 用户故事是上下文边界。先用 TQA 澄清，再用具体示例规格化，随后验证它的领域模型展开，最后才计划实现。TQA 每次只能通过 `evidence_workflow_ask_question` 提出一个问题；必须等待用户明确回答并调用 `evidence_workflow_answer_question`，不能由 Agent 自问自答。
7. 每个已计划场景必须具备追踪链：`SC-xxx → Q2 验收测试 → 功能上下文 → Q1 支撑测试 → 测试替身 → 测试工序`。
8. 编码一次只实现一个选定的 `US-xxx / SC-xxx`。代码编辑前使用 `evidence_workflow_select_work_item` 或 `/evidence-run --story=US-xxx --scenario=SC-xxx`；该操作会记录 Git baseline，开始前不能已有未提交的 `apps/` 或 `libs/` 改动。
9. 每个模型展开使用 `US-xxx-SC-xxx.json`，通过 `model_refs` 引用 `.evidence` 中的稳定实体/关联 ID；`model-snapshot.json` 和 `model-delta.json` 必须让本轮模型变更可审计。每个编码场景同时维护 Markdown 说明和 JSON 执行证据，记录 Git baseline、场景到 Q2/Q1 的追踪、实际改动路径，以及 Red（非零）/Green（零）/Refactor（零）的命令退出码。
10. `learn` 阶段记录 Probe/Sense/Respond 反馈并产出下一轮输入。`complete` 是一次迭代的边界，不是产品开发终点。
11. 如果 gate 待处理，读取 `artifacts/iterations/<iteration_id>/gates/<gate>.md`；只接受 `approve/通过`、`revise/驳回` 或 `reject/终止` 的明确决策。approve 继续、revise 回到被审阶段、reject 停止本轮。

## Pi 命令

```bash
/evidence-status
/evidence-reset --issue=123
/evidence-issue-status
/evidence-issue-sync
/evidence-run
/evidence-run --dry-run
/evidence-run --story=US-001 --scenario=SC-001
/evidence-gate 通过，进入下一阶段
```

## 完成定义

- 状态已更新到 `evidence-state.json`，包含活动 `iteration_id`、轮次和失败反馈。
- 生成的工件位于活动迭代目录、可单独追踪且适合提交。
- Gate 保持人类可读的 Markdown 格式。
- CI 可以非交互方式运行 workflow。
- 编码完成必须包含场景级 TDD 证据、可核验 Git 改动和命令退出码，不能只提供宽泛叙述。
