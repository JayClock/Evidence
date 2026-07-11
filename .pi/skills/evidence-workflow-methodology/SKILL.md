---
name: evidence-workflow-methodology
description: '运行 Evidence 的反馈驱动工作流：TQA 需求澄清、模型展开、测试工序架构、场景级 TDD 与迭代学习。'
---

# Evidence Workflow 方法论 Skill

当用户要求运行、检查、改进或扩展 Evidence Workflow 时使用本 skill。

## 工作流程

1. 读取 `evidence-state.json`，识别当前阶段、活动工作项、轮次和待处理 gate。
2. 新迭代使用 `artifacts/00-user-input/requirements.md` 作为种子输入；后续迭代使用 `artifacts/07-learning/next-iteration.md` 作为反馈输入。
3. 保留 `artifacts/*` 作为可审计的事实来源。不能因为开始新阶段就覆盖上一轮的证据。
4. 按阶段应用 skill：
   - `frame`、`clarify`、`specify`、`validate`：`.pi/skills/design-thinking/SKILL.md`
   - `domain_model`、`architecture`：`.pi/skills/ddd/SKILL.md`
   - `planning`：`.pi/skills/scrum/SKILL.md`
   - `coding`：`.pi/skills/tdd/SKILL.md`
   - `review`、`learn`：严格对照示例、模型展开、测试策略、DoD 和产品反馈进行评审
5. 用户故事是上下文边界。先用 TQA 澄清，再用具体示例规格化，随后验证它的领域模型展开，最后才计划实现。
6. 每个已计划场景必须具备追踪链：`SC-xxx → Q2 验收测试 → 功能上下文 → Q1 支撑测试 → 测试替身 → 测试工序`。
7. 编码一次只实现一个选定的 `US-xxx / SC-xxx`。代码编辑前使用 `evidence_workflow_select_work_item` 或 `/evidence-run --story=US-xxx --scenario=SC-xxx`。
8. `learn` 阶段记录 Probe/Sense/Respond 反馈并产出下一轮输入。`complete` 是一次迭代的边界，不是产品开发终点。
9. 如果 gate 待处理，读取 `artifacts/gates/<gate>.md`；在 `<!-- 在此填写 -->` 被具体答案替换前不得继续。

## Pi 命令

```bash
/evidence-status
/evidence-run
/evidence-run --dry-run
/evidence-run --story=US-001 --scenario=SC-001
/evidence-reset
/evidence-gate 通过，进入下一阶段
```

## 完成定义

- 状态已更新到 `evidence-state.json`。
- 生成的工件为 Markdown、可单独追踪且适合提交。
- Gate 保持人类可读的 Markdown 格式。
- CI 可以非交互方式运行 workflow。
- 编码完成必须包含场景级 TDD 证据，不能只提供宽泛叙述。
