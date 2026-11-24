---
type: contract
title: API 聚合根契约与 HAL 投影
description: 模型与可选 overlay 如何投影 draft API snapshot、OpenAPI 3.1、服务与超媒体，以及内联 examples 如何编译成标准 HTTP 验收。
tags: [api, projection, openapi, overlay, diagnostics, cli, contract]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-24T13:18:19.740Z
sources:
  - id: openwiki-source-0665c978968bd863d445c79a
    resource: repo://apps/cli/src/commands/export.ts
  - id: openwiki-source-eb64da3d440064cfd8e29c7a
    resource: repo://docs/api-projection-v6.md
  - id: openwiki-source-4f4956186309f29a9271894d
    resource: repo://libs/evidence-acceptance/src/renderDeliverables.ts
  - id: openwiki-source-cfb863e81258afec257b30c8
    resource: repo://libs/evidence-acceptance/src/runner/acceptanceRunner.ts
  - id: openwiki-source-feaf4e64c269397a25f93a3d
    resource: repo://libs/evidence-agent/src/sensors/native/nativeApiSensor.ts
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
generated: { by: "pi", at: "2026-11-24T13:18:19.740Z" }
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

POST 的 self 与 Location 指向资源主 GET（同步创建为 201，异步请求受理为 202）；实体 GET 的 self 是自身，集合 GET 的 self 是集合路径。集合用 `_embedded.<业务复数名>` 返回摘要，每项有自己的主 self，并返回非负 total。实体、摘要和集合是分离的 schema。Evidence 间 references 让先决对象 route 指向依赖者 POST，形成 next:<entityRef>；去重排序，模板链接保留 templated。默认 journey 为每个 POST 与获准调用者组合生成可能步骤，http-journeys.json 明确 runtimeValidated=false，不把静态导航当验收已执行。

## OpenAPI 与字段纪律

`buildDeliveryContract` 产生 OpenAPI 3.1.0，info.version 与 x-evidence-model-version 均来自模型版本，manifest → info，route → operation，读写对象 → component schemas，services 与部署拓扑一致。operation 的 x-evidence-* 追溯 entity、context、service、contract、请求/确认、允许角色、exposure、derived/stamped。

- POST 请求体只有 caller 字段，additionalProperties=false；派生字段和 stamped 业务时间不作为客户端输入。
- 响应中 derived/stamped 标 readOnly，派生字段携带 rule 引用；对象 component 要求 HAL `_links`。
- 201 Location 的 x-evidence-uri-template 是 itemPath；2xx 实体响应为 application/hal+json 并保留 link templates。
- path 参数必须对应模板，required string；GET 无 body。无真实 participant.party 扮演责任角色的路由仍保留，但标 internal exposure，不悄悄消失。

缺 confirmation 或需要服务端执行派生规则等未完成能力在 limitations 明示；不能从生成契约推断后端已经实现。audit_api 在上层统计 evidence-only coverage 并给缺口 warning，投影本身不伪造覆盖评分。

## 内联样例到标准验收

`evidence-acceptance/src/delivery/scenarioProjector.ts` 的 AcceptanceFlow/Step 是临时编译 IR，**不是新持久化 suite 格式**。只有实体 examples[].test 参与：flow、actingRoleRef、asOf、basedOn/pathParameters、预期状态/inputs/expect/tags。

每例须唯一映射 POST 且角色获准；依赖按图排序，拒绝环、未知例、跨 flow、依赖拒绝操作、上游时间晚于当前。正向样例先清除 asserted derived 值，再用原生 CEL 对显式 upstream facts 求值；给定期望与推导不符必须失败，不允许 oracle 读取自己的答案。显式负向状态只生成声明的输入/断言，不能臆造非法案例。

路径参数从上游响应捕获，正向结果携带响应 Schema。导出生成 Bruno 集合及 Evidence 验收元数据；`evidence test` 调用 Bruno 对真实后端执行请求和断言，再根据实际响应校验 Schema。CEL int/uint 在 JSON 边界将安全整数转为 number，较宽的合法 int64/uint64 转为精确十进制 string；输入 unsafe number 或超出 CEL 类型范围的值拒绝，不能静默舍入。

## 命令与写出

`evidence export --openapi` 将聚合契约写到 `.evidence/delivery/release/openapi.json`。完整投影用库的 `renderOutputs`，包含聚合与分服务 OpenAPI、拓扑、路由、projection、HTTP journeys、可选 limitations 以及 manifest。manifest 记录工具、schema、Node、AJV、输入摘要和文件字节摘要。`writeOutput` 使用同级暂存目录和 rename 替换生成树，拒绝不安全的相对路径。

Overlay 是投影库的输入，不是 `evidence export` 或 `evidence diff` 的参数。若已通过库应用 overlay，可比较输出的成品 OpenAPI 文件。

## 验证与消费者

projection specs 保护 overlay/路径/角色、FM_INVALID、无效报告与证据缺口；OpenAPI specs 校验 3.1 元模型、refs/operationId/path 参数/GET body 并编译严格消费者类型。outputRenderer specs 保护稳定排序、重排等价、文件字节和 manifest；apiLoader specs 保护 schema 字节与重复键；acceptance/projector specs 保护 CEL oracle、依赖/角色、负向与整数边界。

桌面和 sensors 使用同步 buildDelivery(document)，renderer 使用 browser-safe field-contract 入口避免 fs。

详见仓库文档 [API 交付规则](../../docs/api-projection-v6.md)。

相关：[路由与差异](./delivery-routes-and-diff.md) · [CLI 双门禁](../workflows/cli-governance.md)
