---
type: contract
title: API 聚合根契约与 HAL 投影
description: 模型与可选 overlay 如何投影 draft API snapshot、OpenAPI 3.1、服务与超媒体，以及内联 examples 如何编译成标准 HTTP 验收。
tags: [api, projection, openapi, overlay, diagnostics, cli, contract]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-27T13:29:03.591Z
sources:
  - id: openwiki-source-0665c978968bd863d445c79a
    resource: repo://apps/cli/src/commands/export.ts
  - id: openwiki-source-eb64da3d440064cfd8e29c7a
    resource: repo://docs/api-projection-v6.md
  - id: openwiki-source-4f4956186309f29a9271894d
    resource: repo://libs/evidence-acceptance/src/renderDeliverables.ts
  - id: openwiki-source-cfb863e81258afec257b30c8
    resource: repo://libs/evidence-acceptance/src/runner/acceptanceRunner.ts
  - id: openwiki-source-c04eb3f2becdc2db18da73a3
    resource: repo://libs/evidence-agent-sensors/src/sensors/native/nativeApiSensor.ts
  - id: openwiki-source-21f4015324deb45fb05f6870
    resource: repo://libs/evidence-api/src/adapter/modelAdapter.ts
  - id: openwiki-source-5ada2ea19d2cb99c0b704bb8
    resource: repo://libs/evidence-api/src/apiLoader.spec.ts
  - id: openwiki-source-e945d84c4f7201722caecdad
    resource: repo://libs/evidence-api/src/delivery/addressing.ts
  - id: openwiki-source-32449ef9d6385b1251eee70e
    resource: repo://libs/evidence-api/src/delivery/fieldContract.spec.ts
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
  - id: openwiki-source-e7b8e25706f35341e5dd6899
    resource: repo://libs/evidence-api/src/diagnostics.ts
  - id: openwiki-source-a0e07a861eaab8e52f8f4245
    resource: repo://libs/evidence-api/src/http/hateoasWeaver.ts
  - id: openwiki-source-57fd648ccc0d7f08ee97d2b8
    resource: repo://libs/evidence-api/src/inspect.ts
  - id: openwiki-source-adefb9cc5fd30bc9ad8a24df
    resource: repo://libs/evidence-api/src/loader/apiLoader.ts
  - id: openwiki-source-979d85a5444e9aad27c18779
    resource: repo://libs/evidence-api/src/modelAdapter.spec.ts
  - id: openwiki-source-561a740200649f731d1630c1
    resource: repo://libs/evidence-api/src/openapi/openapi.spec.ts
  - id: openwiki-source-dda93af372b2aced5e221a86
    resource: repo://libs/evidence-api/src/projection.spec.ts
  - id: openwiki-source-7dad3c227e7d6e118c34b56a
    resource: repo://libs/evidence-api/src/projector.ts
  - id: openwiki-source-007097f0c3a549d556bab2ea
    resource: repo://libs/evidence-api/src/renderer/outputRenderer.spec.ts
  - id: openwiki-source-65cec3fa94938b2f2b5d4a29
    resource: repo://libs/evidence-api/src/renderer/outputRenderer.ts
  - id: openwiki-source-766caead67fa154b7d97b96f
    resource: repo://libs/evidence-api/src/renderer/outputWriter.spec.ts
  - id: openwiki-source-13153af2029f2aa63c0edef3
    resource: repo://libs/evidence-api/src/schemas/apiSchema.ts
  - id: openwiki-source-b6b6c0e38c718ba7eef29b0f
    resource: repo://libs/evidence-api/src/testing/openapi.ts
generated: { by: "pi", at: "2026-11-27T13:29:03.591Z" }
---

# API 聚合根契约与 HAL 投影

`evidence-api` 读取内存 FM 文档或模型目录，加可选 JSON overlay，产生 `EvidenceApiSnapshot`：routes、hypermedia、journeys、services、links、limitations、诊断及 OpenAPI。snapshot 固定 schemaVersion=7.0、mode=draft；投影是可审查的设计产物，不宣称发布就绪。

## 输入、索引与证据

`loadModel` 在读取前后比较源字节摘要，变化返回 SOURCE_CHANGED、index=null；解析/源问题也明确失败。`loadModelFromDocument` 通过 structuredClone 固定输入，建立实体/关系/规则和上下文索引。无 check report 表示没提供，不是通过。

可选报告需 checkVersion=6、consistent/complete/valid/modelValidated=true、inputChanged=false、errors 为空及字符串 modelDigest。失效报告保留为 FM_CHECK_INVALID gap，摘要不符为 FM_CHECK_STALE gap；这仍允许草稿预览，不是正式门禁通过。磁盘摘要是带 sha256: 前缀的源字节 digest；内存摘要来自 canonical compiled document。overlay/check 摘要是 canonical JSON 的裸 hex。

`inspect` 是只读库存：模型、roles、真实 participant.party 扮演的 Party Roles、未扮演角色、evidence/participant resource clues、contexts、文件摘要；不会发明路由。

## 业务 URI 与部署边界

公共 URI 从具名业务聚合根开始，不加 Context/lane 前缀：`/product-inquiries/{inquiryId}`、`/product-procurements/{contractId}`。方案嵌套在征询之下；从方案签约和直接签约都返回新合同主 URI。每一个创建入口都有对应的实体 GET，集合创建也有集合 GET。

references 无论箭头方向均读取 child endpoint 基数；普通子资源全部明确 max=1 才采用单例路径。履约确认的动作入口由拓扑决定：单份、可追加或共享确认的 POST 可以不同，但主 GET 都使用全局确认资源 URI。领域 thing 根以及具备可寻址标识和上下文的独立 other_evidence 有只读集合/主 GET；未归属上下文的凭证不生成公共路由。根名在全局分配，子段在兄弟资源间分配，真实冲突用稳定身份后缀消歧，不受无关角色和 Context 重命名影响。

服务仍由 Context 划分，但用 routePrefixes 和精确 route IDs 表达所有权；proposal 下的签约入口由合同服务处理。最终路由用于生成 topology、聚合 OpenAPI 和各服务的独立视图。拓扑只描述逻辑归属，不生成运行时部署配置。

## Overlay 与投影顺序

Overlay 是严格 JSON：schemaVersion=6.0、id、routes(id/path/summary)、journeys(id/roleRef/routeId/nextPossibleSteps)。不接受 YAML、重复键（含嵌套/转义）、非 JSON 数值、非对象、重复 section ID 或未知字段。缺省值只在校验后补齐；programmatic overlay 走同一 loader。嵌入 schema 文本须与随包文件字节一致，manifest 记录 schema digest。

`buildProjection` 顺序固定：

1. 对四部分文档执行 strictValidateDomainModel，失败为 FM_INVALID error，但仍返回可显示的草稿。
2. buildModelDelivery 生成模型基线，解析 overlay；loader 有诊断时整体放弃 overlay，不做部分接受。
3. 按 route id 覆盖现有 path/summary；未知 ID、改变参数名、空段/坏括号、method/path pattern 碰撞各有明确 error，不能凭 overlay 新增业务接口。
4. 校验 journey 的调用方在路由允许的当事人或回调角色中，nextPossibleSteps 必须解析到既有 step。
5. 将所有创建的 itemPath 同步到最终主 GET，重新计算 service ownership；编织 hypermedia，缺自定义 journeys 时从可达关系推导，最后才从最终 routes 建 OpenAPI，保证路径不分叉。
6. 归一化诊断并按 severity/code/target/message/identity 排序；库另提供 `validateProjection` 校验 snapshot schema。

## 超媒体不是虚构执行顺序

超媒体连接表示系统当前知道的可能后续，并不保证运行时环境已具备条件；创建与异步受理的 self 与 Location 始终指向主资源 GET。集合是独立 HAL 视图，内嵌 item 链接。

## 严格契约与字段边界

POST 请求只收 caller 字段且 `additionalProperties=false`；`derived` 与 `stamped` 字段在响应中只读，不能在请求正文中传入。OpenAPI 3.1 规格使用 typed registry 生成，保留操作的 entity、context、service、角色与履约来源。无法推导或需要服务端规则执行的特性明确输出到 limitations。

## 相关页面

- [交付路由、快照与契约差异](./delivery-routes-and-diff.md)
- [FM v6 语言与严格契约](../language/fm-dsl.md)
- [统一 CLI 与双门禁验收工作流](../workflows/cli-governance.md)
