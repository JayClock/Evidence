---
type: contract
title: 交付路由、快照与契约差异
description: 业务聚合根如何成为 URI、Context 如何成为服务，字段来源如何限制请求，以及固定 oasdiff 比较最终 OpenAPI、桌面实时预览和冻结导出的行为。
tags: [delivery, topology, routing, openapi, field-origin, api-diff, breaking-changes, desktop]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-27T13:29:03.591Z
sources:
  - id: openwiki-source-19442573d926816973f7a35a
    resource: repo://apps/cli/src/commands/diff.ts
  - id: openwiki-source-69d58f985d20203ea0c2f899
    resource: repo://apps/cli/src/router.ts
  - id: openwiki-source-8a985fe113b4313884662500
    resource: repo://apps/desktop/src/main/artifactPipeline.ts
  - id: openwiki-source-c8d6c908e749a45544b1e625
    resource: repo://apps/desktop/src/main/deliveryIpc.ts
  - id: openwiki-source-fc371e1f84c3b5d478075b07
    resource: repo://apps/desktop/src/main/deliveryProjection.ts
  - id: openwiki-source-eb64da3d440064cfd8e29c7a
    resource: repo://docs/api-projection-v6.md
  - id: openwiki-source-bf747dad922ce4438e285478
    resource: repo://libs/desktop/feature-canvas/src/LiveApiContext.tsx
  - id: openwiki-source-71d7e1232409d0d4ee39377c
    resource: repo://libs/desktop/feature-delivery/src/components/delivery/DeliveryHub.tsx
  - id: openwiki-source-32df59b611c02b85d275991a
    resource: repo://libs/desktop/feature-delivery/src/state/useDeliveryHub.ts
  - id: openwiki-source-da7d9ed7229ea1d3aab94a15
    resource: repo://libs/desktop/services/src/mcpDeliveryService.ts
  - id: openwiki-source-00036286abae2d8c898e2cef
    resource: repo://libs/evidence-acceptance/src/commands.ts
  - id: openwiki-source-d0f0c50af79c1c9e74ccaeb4
    resource: repo://libs/evidence-acceptance/src/diff/compareContracts.ts
  - id: openwiki-source-d7e13f22c3acec1fe75d3f7c
    resource: repo://libs/evidence-acceptance/src/diff/oasdiffRunner.ts
  - id: openwiki-source-c04eb3f2becdc2db18da73a3
    resource: repo://libs/evidence-agent-sensors/src/sensors/native/nativeApiSensor.ts
  - id: openwiki-source-e945d84c4f7201722caecdad
    resource: repo://libs/evidence-api/src/delivery/addressing.ts
  - id: openwiki-source-53303a19d90a404248f1d663
    resource: repo://libs/evidence-api/src/delivery/fieldOrigin.ts
  - id: openwiki-source-f03cbc6b1d6e72ee81aab365
    resource: repo://libs/evidence-api/src/delivery/files.ts
  - id: openwiki-source-e2bfe2b62dac07a26ade079e
    resource: repo://libs/evidence-api/src/delivery/modelDelivery.ts
  - id: openwiki-source-cd086b179a9af7a48561ba25
    resource: repo://libs/evidence-api/src/delivery/routes.ts
  - id: openwiki-source-9e4629be8b18a94ae1ff1f90
    resource: repo://libs/evidence-api/src/delivery/segments.ts
  - id: openwiki-source-db628d3d14b8f1801370c287
    resource: repo://libs/evidence-api/src/delivery/topology.ts
  - id: openwiki-source-aac6631a251b846350b2d550
    resource: repo://libs/evidence-mcp/src/server/toolset.ts
generated: { by: "pi", at: "2026-11-27T13:29:03.591Z" }
---

# 交付路由、快照与契约差异

路由/拓扑来自 `evidence-api/src/delivery`，比较来自 `evidence-acceptance/src/diff/compareContracts.ts`。不发明接口，也不以“重新投影”掩盖破坏性变化。`buildDelivery(document)` 与 loaded index+overlay 的 buildProjection 最终形成同一 draft snapshot。

## Context、服务和跨边界

buildDeliveryTopology 每个 Context 一个 service，而非每表一个服务，避免把一组请求/确认拆成分布式事务。serviceId 用 context 的稳定 ID，公开 URI 从业务根开始。service 用 routePrefixes 和精确 routes 声明实际所有权，最终 overlay routes 参与重新计算。分类顺序是：回答其他 Context 的 evidence-role socket → capability；否则 pre_contract → channel、domain → domain、其余 fulfillment。

- channel 承载询价/报价，签约向 core 单向推进，不回写渠道。
- fulfillment 持有合同履约账；domain 回答计算/检查，不持履约账。
- capability 用独立合同支持支付/物流等可替换能力。

跨 context 的 evidence plays_role 定义供应方 supplies、消费方 consumes 和 capability async link，确认在供应方自己的时钟形成回调。Domain 被规则 binding/ref 或 references 读取时为 reads/sync；pre_contract 到 parent contract 为 signs/sync。links 按 ID 去重排序，services 按 context 排序；替换能力提供方不应改变 core paths。

OpenAPI 的 `x-evidence-services` 使用同一逻辑服务归属；拓扑不规定容器、网关或传输。

## HTTP 寻址与角色

routes 从业务聚合根生成，Context 不加公共前缀：合同 /product-procurements、征询 /product-inquiries、领域事实 /products。履约项嵌在合同主 URI 下；proposal 按 references 嵌在征询下，方案成单与直接签约均返回合同主 URI。每个创建实体都有主 GET，集合有 list GET；具有 modeled id 和上下文归属的独立 other_evidence 提供顶层只读查询；未归属凭证不投影。

segment allocator 在全局业务根与局部兄弟资源命名空间分配，真实冲突用稳定身份后缀，不受无关角色和 Context 重命名影响；operationId 为稳定 camelCase。itemPath 指实体主 GET，集合 self 指集合 GET；parameterEntityRefs 显式标明模板参数属于哪个实体。

`childShape` 不依赖 references 箭头方向，读取 child endpoint 的 cardinality；只有所有已发现 max=1 才 singleton，未知不推断唯一。最终寻址使用业务名词，如单例 /payment 与集合 /payments/{paymentId}；仅集合增加实例参数，确认同样有主 GET。

callerRoles 从根合同角色筛出具有真实 participant.party 扮演者的 role.party，通常按 responsibleRoleRef 收窄；异步请求方可读取关联的同上下文确认，但不因此获得写权限。仅确认写操作接受明确声明、同上下文且有真实扮演者的第三方 callback 角色。无获准角色仍保留 internal 路由；模型角色线索不是运行时授权实现。

启用 `asyncAcceptance` 的请求响应为 202，Location 指向可查询的请求 URI；共享确认的 POST 接收非空、唯一的 `request_ids`。

## 字段来源就是 payload 合同

fieldFor 优先 derived（可解析规则或已声明 derivedByRuleRef），其次由显式 `timeRole` 标识的 service-time，最后 caller。悬空 derived rule 也不能把字段降成客户端输入。

POST 仅 caller，additionalProperties=false；derived/stamped 在响应 component 标 readOnly、x-evidence-origin、caller-input=false 及规则引用。业务时间 required/keyData/timestamp 的建模约束在 schema 层检查。契约能声明“不接受回填时间”，实际后端仍须执行拒绝；生成类型/静态检查并非 HTTP 防护已实施。

交付树包含聚合及分服务 OpenAPI、topology、routes、projection、http-journeys（runtimeValidated=false）和可选 limitations。缺 confirmation/服务端派生 runtime 等未实现能力明示，不生成虚假闭环。

## oasdiff 是兼容性权威

`compareContracts` 异步比较两份投影的最终 OpenAPI；`compareOpenApiContracts` 直接比较同模型、同服务范围的两份契约，不重新投影。

compareContracts 拒绝不同 modelId、任一侧 error diagnostics 和无效 OpenAPI，返回 base/target modelDigest，以及 oasdiff 原生 changes、Markdown changelog、full details。原生等级 INFO=1、WARN=2、ERR=3，**level>=2 即 breaking**。语义扩展的 full diff 与 HTTP breaking changelog 应分别理解。

OasdiffRunner 固定版本 1.38.0：binary precedence 为显式 options、EVIDENCE_OASDIFF_BIN、从已安装包位置上溯的 cache、PATH。compare 不联网下载；安装用 `pnpm api:setup`。临时目录写空 config、两份 canonical contract，以 execFile 无 shell 执行 version、changelog JSON/Markdown 和 diff JSON；禁 external refs，默认 30 秒、16MiB buffer，finally 清理。版本/输出不合法或执行失败保留 stdout/stderr 并抛 OasdiffError，不降级成自制比较器。

## 桌面与外部边界

主进程的自动草稿写出仅依赖通过源摘要复核的磁盘修订。实时预览从编辑文档与基线计算摘要、契约差异、覆盖率及绑定；live bindings 经 provider 供画布，MCP topology/OpenAPI 则从 saved readDelivery 读取相同领域边界。

## 相关页面

- [API 聚合根契约与 HAL 投影](./api-projection.md)
- [构建、打包与维护](../operations/build-and-package.md)
- [统一 CLI 与双门禁验收工作流](../workflows/cli-governance.md)
