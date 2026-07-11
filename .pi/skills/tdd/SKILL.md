---
name: tdd
description: '在 apps/ 与 libs/ 中以真实测试先行开发，每次只实现一个 Evidence 用户故事验收场景。'
---

# 测试驱动开发（TDD）实现 Skill

在 `coding` 阶段使用本 skill。

## 工作流程

1. 确认 workflow 已通过 `evidence_workflow_select_work_item` 选择唯一的 `US-xxx / SC-xxx` 活动工作项，并记录 Git 基线。未选择前不得修改业务代码；`apps/` 或 `libs/` 已有未提交改动时不得开始。
2. 阅读该故事、Given/When/Then 示例、JSON 模型展开、架构测试策略、适用测试工序、API 契约和完成定义（DoD）。
3. 编辑前确认所属项目和功能上下文：React/Nx、Nest/Nx、Rust domain/API/persistent crate 或 Tauri。
4. **红（Red）**：为选定场景的预期行为创建或更新就近测试；运行并记录预期行为失败，而不是只记录缺少依赖或编译配置错误。
5. **绿（Green）**：在所属项目中做最小生产代码改动，并重新运行聚焦测试。
6. **重构（Refactor）**：改善结构，同时保持选定场景及所有相关支撑测试通过。
7. 写入 `artifacts/05-code/<US-xxx>/<SC-xxx>.md`，记录场景、改动路径、Red/Green/Refactor 证据、命令、结果和剩余风险；并在同名 `.json` 记录 Git 基线、实际改动路径、场景 → Q2/Q1 测试 → 功能上下文追踪，以及 Red（非零）/Green（零）/Refactor（零）的命令退出码。

## 规则

- 一次 coding 运行只实现一个场景。含多个场景的故事必须分别回到 coding 阶段完成。
- 场景必须同时改动至少一个 `apps/` 或 `libs/` 下的测试文件和一个生产代码文件；JSON 中的 `changed_code_paths` 必须与 Git 基线后的实际改动完全一致。
- 遵循架构规定的测试工序和测试替身选择；Q1 测试必须支撑选定的 Q2 验收测试。
- 不得以 Markdown 伪代码代替实现，也不得创建根级 `src/` 或 `tests/` 目录。
- 保留既有 Evidence 边界，并遵守 `AGENTS.md`。
- 前端代码位于 `apps/web` 或 `libs/web/*`；使用所属 Nx 项目的 test、lint、typecheck target。
- Rust 服务端代码位于 `apps/server` 或 `libs/server/*`；运行聚焦 Cargo 测试、Clippy 和 rustfmt。
- Nest 代码位于 `apps/server-nest` 或 `libs/server-nest/*`；必要时使用对应 Nx target 和 Prisma 生成。
- 仅桌面端代码位于 `apps/desktop/src-tauri`；共享 UI 仍属于 Web surface。
- 测试应保持确定性并聚焦行为。

## 测试驱动开发循环

```text
Red：      为 SC-xxx 添加失败的行为测试
Green：    只实现足以让该测试通过的行为
Refactor： 在不改变行为的前提下改善设计
```

循环中先运行最小适用质量检查，评审前再运行更广泛的门禁：

```sh
pnpm nx test <project> --run
pnpm nx lint <project>
pnpm nx typecheck <project>
cargo test -p evidence-server
cargo clippy -p evidence-server --all-targets -- -D warnings
cargo fmt -p evidence-server -- --check
cargo test -p evidence-desktop
```
