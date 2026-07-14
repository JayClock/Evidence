# Evidence Orchestrator 扩展维护指南

该目录只保存确定性的工作流执行代码。阶段角色及方法论位于仓库根目录的 `.pi/agents/`。

## 目录结构

```text
evidence-orchestrator/
├── index.ts                 # Pi 扩展组合根与状态栏生命周期
├── runtime/                 # 面向 Pi 的命令、工具和状态输出
├── subagents/               # 阶段任务构建与独立 pi 子进程执行
├── workflow/                # 阶段目录、状态机、迭代路径和 Gate
├── requirements/            # GitHub Issue 输入与 TQA 澄清
├── evidence/                # 工件索引、模型/代码证据和知识验证
├── testing/                 # 测试工序目录与执行证据记录
├── validation/              # CI 工作流验证入口
├── tests/                   # 跨模块集成测试与测试辅助代码
└── vitest.config.ts         # 工作流测试发现配置
```

## 模块职责

### `runtime/`

- `identity.ts`：集中声明扩展 ID、状态栏 key、状态前缀和消息类型。
- `commands.ts`：注册 `/evidence-*` 命令并执行交互式前置检查；命令通过共享阶段执行器直接启动隔离 subagent，不再构造合成用户消息触发额外模型轮次。`/evidence-new` 成功创建迭代后立即执行一次前台 Frame。
- `github-cli.ts`：将 Pi 的异步、可取消进程执行适配为 GitHub Issue runner。
- `loading.ts`：为外部操作提供可取消的 `BorderedLoader`；非 TUI 模式退化为临时状态栏。
- `phase-progress.ts`：为命令直接启动的阶段提供可取消前台面板，以主题 `toolPendingBg` 渲染 subagent 工具调用和最新输出；非 TUI 模式退化为状态栏与 widget。
- `phase-execution.ts`：统一命令与模型工具的阶段执行、状态栏生命周期、运行元数据和进度事件。
- `story-picker.ts`：像 Issue 选择器一样，从未完成的 `US-xxx.md` 中显示标题并由人手动选择。
- `tools.ts`：注册 `evidence_orchestrator_*` 模型工具。
- `status.ts`：生成当前工作流状态报告。

### `subagents/`

- `phase-runner.ts`：读取 `.pi/agents/*.md` 并启动隔离的 pi 子进程；通过 `--mode json` 收集 `message_end` 和 `tool_result_end`，把子 agent 的完整活动快照流式交给调用方。
- `phase-task.ts`：根据活动迭代和阶段生成动态任务。

`runtime/phase-subagent-renderer.ts` 采用 Pi 官方 subagent 示例的双通道模式：

- 工具 `content` 只返回子 agent 的最终回答，因此父 agent 获得可执行的紧凑上下文；
- 工具 `details` 保留子 agent 消息、工具调用、模型和 stderr，TUI 在执行中显示最近活动，使用 `Ctrl+O` 可展开完整委派任务与输出；非零退出码保留诊断并标记为工具错误；
- 子进程优先复用运行父 agent 的 Pi 可执行文件，避免 PATH 指向不同 Pi 版本。

### `workflow/`

- `types.ts`：工作流共享类型。
- `phase-catalog.ts`：阶段顺序、输入输出及阶段要求。
- `state-store.ts`：`evidence-state.json` 的读写与工作项选择。
- `iteration-paths.ts`：迭代 ID 和工件路径解析。
- `gates.ts`：Gate 决策、阶段完成检查和 PDCA 失败处理。

### `requirements/`

- `github-issue.ts`：GitHub Issue 快照、投影、漂移检查与同步；异步入口在持久化前检查取消信号。
- `clarifications.ts`：故事卡发现与选择、单故事 TQA、AI 结论建议、人工确认和澄清历史。

GitHub Issue 列表、创建、快照、同步和漂移检查均显示具体的 Loading 文案。用户取消时不写入新状态，也不触发后续 Frame；模型工具入口则通过 `onUpdate` 流式报告相同操作。

Clarify 是阶段内的故事级子流程：

1. Frame 根据问题、旅程切片和故事地图增量生成候选 `US-xxx.md` 故事卡；Clarify 不再承担常规故事生成。
2. 进入 Clarify 后，人类通过 `/evidence-story` 或 `evidence_orchestrator_select_story` 打开前台选择器，查看故事标题并手动选择一张卡；也可显式执行 `/evidence-story US-xxx`。人类可随时切换到任一未完成 Story；切换会暂停当前 Story 的待答问题或待确认建议，并恢复目标 Story 先前暂停的状态。选择成功后会在同一次命令或工具调用中直接执行前台 clarify，无须再次执行 `/evidence-run`。
3. 子 agent 的问题显示在当前对话中。领域专家直接回复，父 agent 在内部调用 `evidence_orchestrator_answer_question`；答案落盘后会立即重新运行当前故事的 clarify，继续提出下一问或形成结论建议。
4. AI 通过 `evidence_orchestrator_propose_story_outcome` 只能提出 `clarified`、`needs_split` 或 `deferred` 建议。建议写入状态后 Story 仍保持活动；当前 Story 不能继续运行或完成 clarify，但人类可以切换到其他 Story，建议会被暂停并在切回时恢复。
5. 领域专家执行 `/evidence-story-complete` 打开选择器，可确认 AI 建议、覆盖为其他结论，或说明原因后继续澄清；也可显式执行 `/evidence-story-complete confirm`、`/evidence-story-complete <outcome> <理由>` 或 `/evidence-story-complete continue <原因>`。
6. 只有人工决定会写入最终结论、记录 `decided_by=human` 与确认时间并释放 Story。每个故事结论后重新等待人类选择；所有故事都有人工确认的结论后才能完成 clarify。

已进入 Clarify 且缺少故事卡的旧迭代保留一次兼容路径：子 agent 可依据既有 Frame 工件补建故事卡，随后立即停止等待人工选择。

### `evidence/`

- `artifact-index.ts`：工件目录和真实代码文件扫描。
- `model-and-code.ts`：领域模型展开与场景编码证据验证。
- `knowledge.ts`：统一知识、场景上下文和知识提升验证。

### `testing/`

- `process-catalog.ts`：测试工序 Schema、目录读取和唯一匹配。
- `execution-recorder.ts`：执行声明命令并写入防篡改观测证据。

### `validation/`

- `workflow-validator.ts`：`pnpm orchestrator:validate` 的确定性 CI 入口。

## 依赖方向

```text
index/runtime
  → subagents
  → workflow
  → requirements/evidence/testing

validation
  → workflow/requirements/evidence/testing
```

底层模块不得反向依赖 `runtime/`。`.pi/agents/` 不得导入此目录代码，只能通过已注册的 `evidence_orchestrator_*` 工具交互。

## 命名规则

- 文件名表达业务职责，不使用含义宽泛的 `utils.ts`、`helpers.ts`。
- 单元测试与源文件同目录，使用 `<source>.spec.ts`。
- 跨模块测试放入 `tests/`，使用 `*.integration.spec.ts`。
- 新增工作流状态字段先修改 `workflow/types.ts`，再修改 `workflow/state-store.ts`。
- 新增阶段规则统一修改 `workflow/phase-catalog.ts`，不要分散到命令或工具中。

## 验证

```sh
pnpm orchestrator:test
pnpm orchestrator:validate
pnpm exec prettier --check '.pi/extensions/evidence-orchestrator/**/*.{ts,md}'
```
