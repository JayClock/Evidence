---
name: evidence-workflow-tdd
description: '使用测试驱动开发（TDD）将 Evidence Workflow 用户故事转化为真实代码增量。适用于将生成的 TDD 工件落实为实际 src/ 和测试文件，或改进编码阶段。'
---

# Evidence Workflow 测试驱动开发（TDD）

在编码阶段，或用户要求将生成的实现 Markdown 转化为可运行代码时，使用本技能。

## 工作流程

1. 编辑代码前，通过 `evidence_workflow_select_work_item` 选择唯一的 `US-xxx / SC-xxx`，再通过 `evidence_workflow_select_test_process` 以 runtime 与功能上下文唯一选择 JSON 测试工序。前者记录 Git 基线；若 `apps/` 或 `libs/` 已有未提交改动，不得继续。
2. 阅读选定场景的具体验收示例、模型展开、测试策略、测试工序和完成定义（DoD）。
3. 根据场景和架构工件，确定所属的 Evidence 项目。
4. **红（Red）**：在所属 `apps/*` 或 `libs/*` 项目中创建或更新就近测试；运行测试，记录预期行为失败及非零退出码。
5. **绿（Green）**：在该项目中完成最小生产代码改动；重新运行聚焦测试，并记录零退出码。
6. **重构（Refactor）**：在不改变外部行为的前提下改善命名和结构；重新运行适用质量门禁，并记录零退出码。
7. 在 `artifacts/05-code/<US-xxx>/<SC-xxx>.md` 记录叙述性证据，并在同名 `.json` 中记录机器证据：Git 基线、所选工序、每个 Q1/Q2 步骤的测试替身、测试路径、实际改动路径和 Red/Green/Refactor 命令退出码，以及工序质量门禁。

## 重要规则

用户要求实现时，不得停留在 Markdown 伪代码；必须编写真实文件并在可能时运行测试。一个场景必须在 `apps/` 或 `libs/` 下同时变更至少一个测试文件和一个生产代码文件；JSON 证据必须与所选 Git 基线之后的实际改动完全一致。不得创建通用根级 `src/` 或 `tests/` 目录：React 和共享 UI 位于 `apps/web` 或 `libs/web/*`，Rust 位于 `apps/server` 或 `libs/server/*`，Nest 位于 `apps/server-nest` 或 `libs/server-nest/*`，仅桌面端代码位于 `apps/desktop/src-tauri`。
