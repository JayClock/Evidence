---
type: architecture
title: 系统架构与依赖边界
description: 两个应用宿主与二十六个共享库如何围绕 FM 文档协作，以及 Zod、原生 CEL、Immer、业务泳道和 Node I/O 的职责与依赖方向。
tags: [architecture, workspace, dependencies, nx, data-flow, monorepo]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-27T13:29:03.591Z
sources:
  - id: openwiki-source-8037e2358a2c4f9b2c722a11
    resource: repo://AGENTS.md
  - id: openwiki-source-19442573d926816973f7a35a
    resource: repo://apps/cli/src/commands/diff.ts
  - id: openwiki-source-e294dea08271a01c5abf94b7
    resource: repo://apps/cli/src/model.ts
  - id: openwiki-source-69d58f985d20203ea0c2f899
    resource: repo://apps/cli/src/router.ts
  - id: openwiki-source-de5c5760d707be19e09eb7e3
    resource: repo://apps/desktop/project.json
  - id: openwiki-source-55138c775f581f8c989ca7dc
    resource: repo://apps/desktop/src/main/agentRuntime.ts
  - id: openwiki-source-8a985fe113b4313884662500
    resource: repo://apps/desktop/src/main/artifactPipeline.ts
  - id: openwiki-source-fc371e1f84c3b5d478075b07
    resource: repo://apps/desktop/src/main/deliveryProjection.ts
  - id: openwiki-source-5d33672c45ec58cd29dce507
    resource: repo://apps/desktop/src/main/main.ts
  - id: openwiki-source-f0f06a0981a7ca97c510b44d
    resource: repo://apps/desktop/src/renderer/state/useEditorSession.ts
  - id: openwiki-source-87e5669496e1e215691f3e0c
    resource: repo://apps/desktop/src/renderer/state/useLiveModelBridge.ts
  - id: openwiki-source-b5ea8c8713a5b04ee1c21d2d
    resource: repo://apps/desktop/vite.main.config.mjs
  - id: openwiki-source-15aba07b973e26bd886a7db3
    resource: repo://apps/desktop/vitest.config.mts
  - id: openwiki-source-18fab4844d8695b257bd644b
    resource: repo://docs/workspace-layout.md
  - id: openwiki-source-0c1cc5dc86ad401eb9678504
    resource: repo://ENVIRONMENT.md
  - id: openwiki-source-2fda883e9b76745f69f487f7
    resource: repo://eslint.config.mjs
  - id: openwiki-source-f914c929c674a53cdbb8b53c
    resource: repo://libs/desktop/services/src/mcpRequestHandler.ts
  - id: openwiki-source-3487fdf20c88f517d0a744eb
    resource: repo://libs/evidence-acceptance/package.json
  - id: openwiki-source-1f91a0904801fda4a6bbc7e4
    resource: repo://libs/evidence-agent-sensors/src/sensors/native/nativeStageGate.ts
  - id: openwiki-source-6f04de9cd5b37856e059a081
    resource: repo://libs/evidence-agent-sensors/src/sensors/sensorsEngine.ts
  - id: openwiki-source-9d54a30ae7fe8603951dd3dd
    resource: repo://libs/evidence-agent/src/browser.ts
  - id: openwiki-source-1c67fed1db077d0e39bb80ad
    resource: repo://libs/evidence-agent/src/index.ts
  - id: openwiki-source-21f4015324deb45fb05f6870
    resource: repo://libs/evidence-api/src/adapter/modelAdapter.ts
  - id: openwiki-source-7dad3c227e7d6e118c34b56a
    resource: repo://libs/evidence-api/src/projector.ts
  - id: openwiki-source-abc633034c7c8d642614f964
    resource: repo://libs/evidence-canvas-interaction/src/engine/swimlaneLayout.ts
  - id: openwiki-source-7c4f607b2d42287b8ffedc0c
    resource: repo://libs/evidence-model-core/package.json
  - id: openwiki-source-bcadd1e63a7d140ce717e9ea
    resource: repo://libs/evidence-model-io/package.json
  - id: openwiki-source-2c4cbeffd18cdc1b75d15ef4
    resource: repo://libs/evidence-model-io/src/adapters/diskAdapter.ts
  - id: openwiki-source-4fa503355d9f3a8084bea718
    resource: repo://libs/evidence-model-io/src/adapters/modelRoot.ts
  - id: openwiki-source-e399a918ad3d695b7f506627
    resource: repo://libs/evidence-model-io/src/workspace.ts
  - id: openwiki-source-dd948eb74e58734da3b37ea9
    resource: repo://libs/evidence-schema/package.json
  - id: openwiki-source-52858d6130375e8776a048e7
    resource: repo://libs/evidence-schema/src/ast/document.ts
  - id: openwiki-source-3a801269d4e9a920c1e0021d
    resource: repo://libs/evidence-schema/src/validation/strictValidate.ts
  - id: openwiki-source-2d798afa87a0b2d7dccd51cb
    resource: repo://libs/evidence-tools/package.json
  - id: openwiki-source-d8dbf281c85f8a886745ac24
    resource: repo://tools/workspace-rules/boundary-drill.mjs
  - id: openwiki-source-df1e4d0dc0a35c64fd0e652b
    resource: repo://tsconfig.base.json
  - id: openwiki-source-98d5ddb014a0fd4d678f6f2a
    resource: repo://tsconfig.json
generated: { by: "pi", at: "2026-11-27T13:29:03.591Z" }
---

# 系统架构与依赖边界

Evidence 的真相源是 `DomainModelDocument`：manifest、entities、relationships、rules。桌面实时编辑与磁盘模型是同一契约的不同时间快照，而不是两套领域语言。当前 workspace 有 **apps/desktop 和 apps/cli 两个应用**，十二个 evidence 库和十四个 desktop 库。

## 责任与依赖方向

| 层 | 所有者及关键机制 |
| --- | --- |
| schema/universal | evidence-schema：Zod FM v6 AST、语法与跨对象 refinement、稳定 FM 诊断、工具输入、canonical JSON；依赖 zod、fast-json-stable-stringify、tslib，不依赖工作区上层 |
| domain/universal | model-core：图、guarded draft mutations、Immer 会话/历史、RFC 6902、原生 cel-js、追溯和静态 FM 检查；同步 SHA-256 使用 noble/hashes |
| domain/universal | canvas-interaction：无 DOM 的业务泳道布局、模型适配、可序列化几何和作用域，不持有 DOM/React Flow 视口 |
| io/node | model-io：目录工作区发现、源文件读写与字节摘要 |
| projection | evidence-api：模型与可选 overlay → 业务路由、HAL、服务、OpenAPI、部署；不依赖 acceptance |
| projection/node | acceptance：消费 API，编译内联样例、导出 Bruno 集合、运行 HTTP 验收、drift 和原生 oasdiff |
| domain/universal | evidence-tools：Pi/MCP 共用的 guarded patch/recipe registry |
| orchestration/node | agent：Pi session、提示词、Zod 工具；browser 子入口提供纯数据合同 |
| orchestration/node | evidence-agent-sensors：原生传感器、sensorReport 折叠诊断与阶段门禁 |
| orchestration/node | mcp：外部工具与本地桥，不依赖 agent 或 visualization；二者在桌面宿主相遇 |
| desktop/services | desktop/services：主进程桥接服务、MCP 请求分发、readDelivery 与模型源读取 |
| ui/feature/browser | desktop-contracts 与 ui-kit、canvas/inspector/story/delivery/agent features；testing 为独立支持库 |
| app | desktop 组合 Electron/React 工作台；cli 组合共享库命令，使用 cac 注册参数，不复制领域规则 |

库不能反向依赖 app；acceptance 可消费 api，api 不可依赖 acceptance；共享工具不依赖 SDK 适配器。

## 构建与依赖合同

运行时依赖在实际 importer 的 package.json 声明，工作区边使用 workspace:*；根只放开发工具。pnpm hoisted linker 可能掩盖缺失声明，因此 Nx dependency-checks 与 enforce-module-boundaries 是必要门禁。

ESLint 同时约束 type、layer、platform、scope：universal 只能引用 universal；browser 只允许 browser/universal 或明确 browser-safe 表面，禁直接引用 Electron、MCP SDK、Pi SDK。schema 不得依赖投影，evidence 不得依赖 desktop/testing。

库 export 的 `@evidence-poc/source` 条件指向 src，tsconfig customConditions、Vite/Vitest resolve.conditions 必须一致；遗漏会退到 dist，出现未构建模块错误。agent 的 `/browser` 和 API 的 `/delivery` 子入口、model-core/testing、各命令入口延续此合同。根 tsconfig 引用二十六个库及 cli；desktop 继续由自己的 Forge/typecheck target 检查。

## 从建模到交付

1. model-io 加载工作区的 `.evidence/model/`，core 将源文件解析为领域文档。只有约定的文件参与源读取。
2. renderer ModelSession 用 `mutate(recipe)` 或 `applyPatchBatch` 原子变更，维护选择、撤销/重做与惰性图；MCP 补丁直接作用于 renderer 会话；Pi Agent 补丁由主进程原子提交给唯一 editor owner，renderer 重放并并入同一撤销历史。
3. 主进程与 services 传感器计算关键数据追溯、FM 静态门禁与 API 差异；渲染端 ProblemsPanel 区分机器检查和业务批准。
4. CLI 和主进程交付服务调用 `evidence-api` 生成 OpenAPI 3.1 规格，调用 `evidence-acceptance` 导出 Bruno 并对真实后端服务执行双门禁验收。

## 相关页面

- [快速开始与任务导航](../quickstart.md)
- [FM v6 语言与严格契约](../language/fm-dsl.md)
- [桌面宿主与项目生命周期](../desktop/app-shell.md)
- [统一 CLI 与双门禁验收工作流](../workflows/cli-governance.md)
