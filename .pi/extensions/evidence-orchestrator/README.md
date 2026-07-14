# Evidence Orchestrator 扩展维护指南

该目录只保存确定性的反馈循环、Pi 适配和证据检查代码。角色方法位于 `.pi/agents/`，工程原则位于 `engineering/evidence-orchestrator/`。

## v2 反馈循环

```text
idle → kickoff → discover → model → design → build → showcase → learn → complete
```

- 一个 iteration 只有 `01-kickoff/story.md` 中的一张 Story。
- Discover 合并旧的 clarify/specify/validate；TQA 一次只有一个待答 Question，示例承担 Confirmation。
- Model 通过场景展开与反例检查演进 `.evidence/`，在 walkthrough Gate 接受领域专家反馈。
- Design 合并旧的 architecture/planning，只选择一个最小 Scenario。
- Build 以测试工序执行 Red/Green/Refactor，并把命令事实追加到 `*.execution.jsonl`。
- Showcase 展示可运行增量并由领域专家判断价值。
- Learn 将反馈提升为权威知识或一个后续 Issue。

只有 Kickoff、Model、Showcase 设置常规人工 Gate。旧 phase、并行 Story 状态、Story picker、Story outcome proposal 和旧 artifact layout 均不兼容。

## 目录职责

```text
evidence-orchestrator/
├── index.ts             # Pi 扩展组合根与状态栏生命周期
├── runtime/             # 命令、工具、状态与前台进度
├── subagents/           # 隔离 Pi 子进程与动态阶段任务
├── workflow/            # v2 状态、阶段、路径和 Gate
├── requirements/        # Issue 快照、单 Story Card、TQA 与示例检查
├── evidence/            # 工件、模型、代码与知识检查
├── testing/             # 测试工序目录和追加式执行事实
├── validation/          # CI 验证入口
└── tests/               # 跨模块集成测试
```

### Runtime

- `commands.ts` 注册 `/evidence-new`、`/evidence-run`、`/evidence-status`、Issue 和 Gate 命令。
- `tools.ts` 暴露同一状态机的模型工具；没有独立 Story 选择或 Story 结论工具。
- `phase-dispatch.ts` 在启动子 agent 前统一检查 idle/complete、Issue、Gate、TQA 和输入。
- `phase-execution.ts` 统一状态栏、运行元数据、流式进度和 Discover 问题呈现。
- `status.ts` 只报告唯一 Story、唯一 Build Scenario 和唯一待答 TQA。

### Requirements

- `github-issue.ts` 将 Issue 冻结到 `00-input/`；只有 Kickoff 可显式刷新。
- `story-cards.ts` 校验固定的 `01-kickoff/story.md`，从结构上消除多 Story WIP。
- `clarifications.ts` 保存 Thought/Question/Answer；Answer 只能由父会话记录领域专家原话。
- `examples.ts` 要求示例属于唯一 Story，且包含 Given/When/Then。

### Evidence 与 Testing

- `.evidence/` 是长期领域模型；`03-model/` 只保存 snapshot、delta、expansion 和 walkthrough。
- `04-design/scenario-context-map.json` 必须只有一个 Scenario，且每个 runtime 只有一个候选工序。
- 目录工序在 Build 选择后快照到 `04-design/selected-test-processes/`。
- 执行事实写入 `05-build/<US>/<SC>.execution.jsonl`；不得以叙述报告替代。

## Artifact layout

```text
00-input/       frozen Issue and projection
01-kickoff/     kickoff.md, story.md
02-discovery/   TQA, discovery.md, examples/
03-model/       snapshot, delta, expansions/, walkthrough.md
04-design/      delivery-plan.md, scenario-context-map.json, selected processes
05-build/       scenario machine evidence and execution JSONL
06-showcase/    runnable demonstration and domain feedback
07-learn/       Probe/Sense/Respond, knowledge promotion, next Issue
```

目录按需创建；不得预建空阶段树或用“无变化”Markdown 填满输出。

## 依赖方向

```text
index/runtime → subagents → workflow → requirements/evidence/testing
validation → workflow/requirements/evidence/testing
```

底层模块不得反向依赖 `runtime/`。阶段 Agent 只能通过注册的 `evidence_orchestrator_*` 工具推进状态。

## 验证

```sh
pnpm orchestrator:test
pnpm orchestrator:validate
pnpm exec prettier --check '.pi/extensions/evidence-orchestrator/**/*.{ts,md}'
```
