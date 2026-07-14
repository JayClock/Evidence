# Iteration evidence

该目录只保存不可变的单轮输入、delta、决策和执行事实；稳定知识必须提升到对应权威来源。

## Bootstrap archives

- `ITER-0000`：在 Issue 快照、统一知识和当前反馈循环建立之前生成的 bootstrap 交付记录。
- `ITER-0001`：只含种子需求投影的 bootstrap 占位 iteration。

两者均为**归档参考**，不是当前 Orchestrator 流程正确性或产品完成状态的证据。不得用新模板回填、修正或继续执行这些目录。

新的 iteration 由显式 GitHub Issue 创建，并使用创建时生效的工作流与 Schema。`evidence-state.json` 中的 complete bootstrap 状态仅用于表示当前没有进行中的旧 iteration；后续破坏性工作流版本不会为这些归档提供兼容读取路径。
