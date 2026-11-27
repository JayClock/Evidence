---
type: testing
title: 测试边界与验证策略
description: 按Zod契约、Immer事务、native CEL、业务泳道、Node I/O、桌面IPC与真实HTTP验收选择最窄测试，以及fixture、工具准备和CI双门禁的边界。
tags: [testing, vitest, fixtures, digests, injection, desktop, cli, acceptance]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-27T13:29:03.591Z
sources:
  - id: openwiki-source-164e2da859b5277df81c7d94
    resource: repo://.github/workflows/ci.yml
  - id: openwiki-source-66c2ef915cc65b281496d068
    resource: repo://apps/cli/vitest.config.mts
  - id: openwiki-source-fe198b09c0b1eeb6a6ebe4d9
    resource: repo://apps/desktop/src/main/agentRuntime.spec.ts
  - id: openwiki-source-1ea7682f1abe09b6e2edbf92
    resource: repo://apps/desktop/src/main/projectIpc.spec.ts
  - id: openwiki-source-5a8bb195f6c36951b548492b
    resource: repo://apps/desktop/tests/integration.spec.ts
  - id: openwiki-source-47ca9da7961156aadbba9a5c
    resource: repo://apps/desktop/tests/phase-3-loop.spec.ts
  - id: openwiki-source-15aba07b973e26bd886a7db3
    resource: repo://apps/desktop/vitest.config.mts
  - id: openwiki-source-634783f4e08965a7ab7ec587
    resource: repo://examples/b2b-escrow/implementations/ts-fastify/test/app.test.mjs
  - id: openwiki-source-29536c90f762c67d4e41b9c9
    resource: repo://libs/desktop/testing/src/desktopApi.ts
  - id: openwiki-source-6d71eb468fb1263201f30ef6
    resource: repo://libs/evidence-acceptance/README.md
  - id: openwiki-source-87c8cacafc41063592c13c80
    resource: repo://libs/evidence-acceptance/src/acceptance.e2e.spec.ts
  - id: openwiki-source-d916b31bf94d895d48e443c4
    resource: repo://libs/evidence-agent/src/session/evidenceAgentSession.spec.ts
  - id: openwiki-source-062416ee8e7e3d6d3b09aaad
    resource: repo://libs/evidence-api/package.json
  - id: openwiki-source-48c413ac4f0282e1b0126f20
    resource: repo://libs/evidence-api/src/delivery/routes.spec.ts
  - id: openwiki-source-561a740200649f731d1630c1
    resource: repo://libs/evidence-api/src/openapi/openapi.spec.ts
  - id: openwiki-source-2050d152180fc886e9fc0d4f
    resource: repo://libs/evidence-api/src/testing/fixtures.ts
  - id: openwiki-source-65aecc4d0c320b921968555c
    resource: repo://libs/evidence-model-core/src/validation/fmCheck.spec.ts
  - id: openwiki-source-4b16ae600d62bb250ded558c
    resource: repo://libs/evidence-model-core/src/validation/modelDigest.spec.ts
  - id: openwiki-source-d72e0b169ed5313d27b92071
    resource: repo://libs/evidence-model-core/tests/fixtures/README.md
  - id: openwiki-source-dedfc22fcf8046b31159c04e
    resource: repo://libs/evidence-model-io/src/workspace.spec.ts
  - id: openwiki-source-6ba748254f38112b13d529da
    resource: repo://nx.json
  - id: openwiki-source-d8dbf281c85f8a886745ac24
    resource: repo://tools/workspace-rules/boundary-drill.mjs
  - id: openwiki-source-b58f839a189d87a7e1f37d39
    resource: repo://vitest.config.mts
generated: { by: "pi", at: "2026-11-27T13:29:03.591Z" }
---

# 测试边界与验证策略

优先验证改变的行为，不因文档更新一律跑全仓。源码/tests是权威；“读过测试”不等于“已执行通过”。本页是测试地图，不是永久最新CI绿灯证明。

## 工具与运行项目

Node22/pnpm12.16.1，install --frozen-lockfile后若涉及API compatibility先api:setup。Vitest root发现workspace config，CLI和核心库是node，desktop单jsdom项目包含 renderer/main/tests，features 的 tests 已移到各自库；Nx从Vitest推test与per-file目标、默认^build。cli target还依build，真实spawn测dist不能跳过构建。source condition须配置一致，model-core/cli已显式source+node。

```bash
pnpm exec vitest run --config libs/evidence-model-core/vitest.config.mts src/session/jsonPatches.spec.ts
pnpm exec nx test cli
pnpm exec nx test desktop
pnpm exec nx run-many -t typecheck lint --all
```

直接Vitest筛选路径须相对当前config root或传可匹配的repository路径；不确定name先读各config，不猜旧scoped project名。

## 按边界选最窄验证

| 行为 | 代表测试 | 保护什么 |
| --- | --- | --- |
| FM语法/语义 | schema strictValidate/zodPipeline/exampleTest | strict unions/refinements、稳定code/path/objectId、未知字段拒绝、无输入突变 |
| 模型编辑 | core mutations/*、session/createModelSession/jsonPatches | guarded red lines、原子失败/no-op、forward/inverse历史、结果snapshot、selection与RFC6901/6902安全 |
| CEL/lineage/oracle | celEvaluator/celAnalysis/transientSandbox、traceability/fmCheck | native scoped AST、macro shadowing、精确int64/uint64、显式asOf、typed/JSON边界、静态v6不冒充执行 |
| headless布局 | canvas swimlaneLayout、layoutTreeToGraph | Context、阶段、折线坐标与配对关系 |
| 画布/Inspector | feature-canvas adapter/CanvasViewport、Inspector/CEL specs | local/world一致、早期handles、scope/diagnostics/token、单批undo、原生CEL诊断 |
| 文件与发现 | model-io workspace/adapters、desktop projectStore/modelWatcher | 工作区发现与不覆盖保护、源选择、幂等写入、原子替换与重建 |
| 桥与竞态 | Agent/MCP/runtime/useGraphLayout/useDeliveryHub |同步revision、旧reply丢弃、主进程提交与 renderer 重放顺序、超时、磁盘产物候选与修订核对、过期review不撤后续工作 |
| API与兼容性 | projection/openapi/outputRenderer、oasdiffRunner/breakingScenarios |最终contract/overlay、schema/consumer types、稳定bytes/manifest、原生工具版本/错误闭合 |
| HTTP验收 | `brunoRenderer.spec`、`acceptance.e2e`、`runner/suiteSelection`、`cli governance.e2e` | 固定 Bruno 对真实 SUT 执行；检查捕获、派生断言、双门禁、漂移、退出码与报告 |
| 放映、来源、AI | flowAggregator/story/whatIf/journeyPreview、EditorScreen、aiConfig/agentIpc | 声明的流程与前缀隔离、选中对象的来源片段、共享 Pi 配置、凭据不经 renderer 及模型切换 |

## 注入昂贵依赖，不伪造被测合同

会话单测 mock Pi 原生 session runtime；桌面注入 sessionFactory/sensors/transport，测试无需模型凭据；AI runtime 与产物流水线依赖注入避免真实 OS 弹窗与模型调用。installDesktopApi是renderer channel log+Agent/MCP模拟器，UI不启动Electron。时钟/文件/engine可注入保证可复现。

并非一切都mock：bridge spec开真实Unix socket验证0600/超时/复用；oasdiff integration执行固定binary；HTTP e2e启动独立backend。模拟其他层只为隔离当前层，不能拿假的runner宣称真实HTTP已绿。

## Fixture与摘要

model-core valid-traceable-subscription现在是静态责任模型，两条派生链、一个key-data待决；invalid-missing-confirmation一致但不完整。可执行 acceptance examples 在 examples/b2b-escrow；独立 ts-fastify 使用自己的 frozen lockfile，先 example:setup 再 example:test。原生测试跟随创建 Location 主 GET 并检查 HAL 集合，真实 HTTP 故障测试分别破坏金额、业务时钟与 payload。

## 相关页面

- [静态门禁、CEL 与样例求值](../model/checks-and-simulation.md)
- [构建、打包与维护](../operations/build-and-package.md)
- [统一 CLI 与双门禁验收工作流](../workflows/cli-governance.md)
