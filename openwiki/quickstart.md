---
type: guide
title: 快速开始与任务导航
description: 安装Evidence桌面与统一CLI，以 FM v6 建模、静态检查、导出 OpenAPI 与 Bruno 集合并对真实 HTTP 服务验收，以及按任务定位架构、桌面、语言和治理文档。
tags: [quickstart, onboarding, navigation, commands]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-24T13:18:19.740Z
sources:
  - id: openwiki-source-5466111549d3bdae4dce66a7
    resource: repo://apps/cli/package.json
  - id: openwiki-source-52a825b501b0001cef1b2ecc
    resource: repo://apps/cli/src/commands/check.ts
  - id: openwiki-source-97029bfc63aaa8f0d97e713c
    resource: repo://apps/cli/src/commands/test.ts
  - id: openwiki-source-69d58f985d20203ea0c2f899
    resource: repo://apps/cli/src/router.ts
  - id: openwiki-source-8a985fe113b4313884662500
    resource: repo://apps/desktop/src/main/artifactPipeline.ts
  - id: openwiki-source-116417bc4058f5af8fe23abc
    resource: repo://apps/desktop/src/main/livePersistence.ts
  - id: openwiki-source-5d33672c45ec58cd29dce507
    resource: repo://apps/desktop/src/main/main.ts
  - id: openwiki-source-034a304691f6c1f77f682d25
    resource: repo://apps/desktop/src/renderer/state/useMcpBridge.ts
  - id: openwiki-source-eb64da3d440064cfd8e29c7a
    resource: repo://docs/api-projection-v6.md
  - id: openwiki-source-0c1cc5dc86ad401eb9678504
    resource: repo://ENVIRONMENT.md
  - id: openwiki-source-cd086b179a9af7a48561ba25
    resource: repo://libs/evidence-api/src/delivery/routes.ts
  - id: openwiki-source-db628d3d14b8f1801370c287
    resource: repo://libs/evidence-api/src/delivery/topology.ts
  - id: openwiki-source-aac6631a251b846350b2d550
    resource: repo://libs/evidence-mcp/src/server/toolset.ts
  - id: openwiki-source-38e18c58a2be3089edddbc1a
    resource: repo://libs/evidence-model-core/src/adapters/modelSourceFiles.ts
  - id: openwiki-source-9008514a60858ff717f539ab
    resource: repo://libs/evidence-model-core/src/validation/fmCheck.ts
  - id: openwiki-source-e399a918ad3d695b7f506627
    resource: repo://libs/evidence-model-io/src/workspace.ts
  - id: openwiki-source-52858d6130375e8776a048e7
    resource: repo://libs/evidence-schema/src/ast/document.ts
  - id: openwiki-source-c265f00105116b029505cbda
    resource: repo://libs/evidence-schema/src/ast/entity.ts
  - id: openwiki-source-e32f800f7852b379dbe14855
    resource: repo://libs/evidence-schema/src/ast/rule.ts
  - id: openwiki-source-5b54a58d1b51cd490b0e7162
    resource: repo://package.json
  - id: openwiki-source-98d5ddb014a0fd4d678f6f2a
    resource: repo://tsconfig.json
generated: { by: "pi", at: "2026-11-24T13:07:09.861Z" }
---

# 快速开始与任务导航

Evidence是语言无关的后端业务建模工作台：先描述双方责任、请求时段、确认时刻、事实与派生规则，再投影接口和验收。模型不是ORM或后端实现；画布、CLI、传感器和生成器复用同一DomainModelDocument。

当前 workspace 为**两个应用（desktop/cli）、十七个 TypeScript 库**。Node.js 22、pnpm 12.16.1 是框架开发工具链；`pnpm install` 安装固定 Bruno CLI，契约比较另需固定原生 oasdiff。项目目录不提供 skill 树。

## 从干净环境启动

```bash
pnpm install
pnpm api:setup                 # 显式下载/校验固定oasdiff；install不会代跑
pnpm exec nx build cli
pnpm evidence --help
pnpm desktop                   # Electron Forge工作台
```

oasdiff在node_modules/.cache，删除依赖/cache后重新setup；无需Go/Docker，比较时不联网补装。build/test/lint根脚本是Nx wrappers，按需最窄验证，不一定每次启动先全仓测试。工作区包通过@evidence-poc/source读src，遗漏resolve.conditions会退dist。

## 目录工作区

在已有目录使用 `pnpm evidence init --workspace /path/to/project --name '履约模型'`，或在桌面选择目录和模板。初始化不会覆盖已有 `.evidence/`。模型只保存在 `.evidence/model/` 的 `model.json`、`entities/`、`relationships/` 和 `rules/`；内联验收写在实体的 `examples[].test`。桌面使用随应用提供的提示词和 schema。

## 用 B2B Escrow 走通 CLI

从仓库根运行：

```bash
pnpm evidence inspect --workspace examples/b2b-escrow --json
pnpm evidence check --workspace examples/b2b-escrow --scope context.procurement --json
pnpm evidence export --workspace examples/b2b-escrow
pnpm evidence export --workspace examples/b2b-escrow --verify
pnpm evidence diff examples/b2b-escrow/baseline-v1 examples/b2b-escrow --format markdown
```

在工作区内运行时可以省略 `--workspace`。`compile` 和 `lineage` 把派生结果写入 `.evidence/derived`。`export` 生成 OpenAPI 3.1 和 Bruno：分别在 `.evidence/delivery/release` 和 `.evidence/acceptance`。`--openapi` / `--tests` 只生成一类。需要实际 HTTP 验收时，先准备并启动独立 Fastify：

```bash
pnpm example:setup
node examples/b2b-escrow/implementations/ts-fastify/dist/server.js --test-mode --port 8085
# 在另一个终端运行：
pnpm evidence test --workspace examples/b2b-escrow --target http://127.0.0.1:8085 --json
```

## 公共 API 与交付

URI 从业务聚合根开始，如 `/product-procurements/{contractId}`；客户端通过 HAL self 和 Location 找到主 GET。`routePrefixes` 与精确 `routes` 描述服务所有权，不过不规定运行时部署。可选 overlay 和分服务完整输出属于[投影库](./contracts/api-projection.md)。

## 开始桌面工作

打开含 `.evidence/model` 的工作区；新项目选模板，或从业务文本/协议/蓝图读取draft、人工修正再compile创建。开项目不运行 project 指令，也不生成后端。AI 设置读取共享 Pi 配置，可选择默认模型和思考级别、重载配置或打开配置目录。无可用模型时，静态建模、规则摄取和离线事实故事仍可用。

默认旅程按邀请投标、投标、合同签约、履约履行四阶段展开；Inspector 编辑语义。Mod+K 打开画布 Storming 先铺凭证；节点内 Inquiry 追溯来源、模拟 What-If 或继续建模。Agent 补丁由主进程先提交，renderer 重放到同一撤销历史，最新事务可一步回退。

左侧导轨是实体表、门禁与诊断、对象目录，对应 Mod+1、Mod+2、Mod+4。实体表与画布共用选区；Alt+D 打开全窗交付产物预览。编辑自动落盘，产物从经验证的磁盘修订生成。外部改写导致冲突，应明确从磁盘重载。

外部Agent通过per-user socket；desktop同binary支持--mcp-stdio，写工具通过 renderer 的会话事务，不直接写源。MCP/内置Agent的参数用共享Zod校验，算子优先。

## 第一天必须分清的门槛

1. **静态一致性≠scope完整性≠HTTP验收≠业务批准。** FM check v6 的 testExampleCount 只是声明数量；humanConfirmation始终not-asserted-by-machine。
2. **草稿可看≠发布授权。** 阶段门禁需要有效报告和 scope 完整性；API 发布还关注覆盖和破坏性变更。机器不能代签。
3. **产物同步不靠CI悄修。** export --verify只比较missing/modified/extra、失败不写，开发重新export并提交。
4. **双验收gate有明确基线。** regression跑旧基线全部flows，DoD跑当前新增/变化；allow-pending只为DoD探索且报告仍未通过，strict CI不用它。详见下页。
5. **故事与本地预演不等于验收。** story --no-ai 仅显示声明事实，journey preview 只读可见前缀；对真实后端的验收由 `evidence test` 驱动 Bruno。

## 按任务找文档

| 任务/问题 | 页面 |
| --- | --- |
| CLI导出、真实验收、regression/DoD、pending、CI baseline | [统一CLI与双门禁](./workflows/cli-governance.md) |
| 包依赖、两应用、universal/Node/browser边界 | [系统架构](./architecture/overview.md) |
| FM可写什么、Zod strict/refinement、责任/引用红线 | [FM v6 语言](./language/fm-dsl.md) |
| 金额/截止时间谁提供、native CEL属性lineage、文本来源 | [关键数据与来源](./language/key-data-and-provenance.md) |
| 工作区、源文件、摘要与写入冲突 | [源格式](./model/source-formats.md) |
| Immer recipes、RFC6902安全、原子历史和选择 | [模型变更与会话](./model/commands-and-session.md) |
| 静态v6证明什么、scope、CEL精确整数/样例oracle | [检查与样例求值](./model/checks-and-simulation.md) |
| sensor severity、版本化stage gate、治理策略 | [传感器](./agents/sensor-orchestration.md) |
| Pi 会话、随包指令、镜像与补丁 | [内置Agent](./agents/pi-harness.md) |
| 外部 Cursor/Claude、socket、超时和工具 | [MCP](./agents/mcp-integration.md) |
| 模型→OpenAPI、overlay、内联examples投影 | [API契约](./contracts/api-projection.md) |
| 服务/路由、字段来源、oasdiff、草稿与验收 | [交付差异](./contracts/delivery-routes-and-diff.md) |
| Electron/main/preload、项目存储、Chokidar监控 | [桌面宿主](./desktop/app-shell.md) |
| 编辑会话、修订与界面定位 | [renderer状态](./desktop/renderer-state.md) |
| 对象目录、实体表、Storming、交付 Hub 与快捷键 | [工作区界面](./desktop/workspace-surfaces.md) |
| 业务泳道、React Flow 和检查器 | [画布与检查器](./desktop/canvas-and-inspector.md) |
| 文本摄取、draft采纳、Agent补丁审查 | [摄取与审查](./desktop/ingestion-and-patch-review.md) |
| setup、Nx/Forge、边界lint、CI/OpenWiki维护 | [构建与维护](./operations/build-and-package.md) |
| 选最窄测试、fixtures、注入/真实socket/SUT/browser验证 | [验证策略](./testing/verification-strategy.md) |
