---
type: integration
title: MCP 工具与桌面桥
description: 外部 IDE 和 CLI Agent 如何经本地 socket 访问桌面实时模型、提交 RFC 6902 补丁，以及读取已保存模型的传感器与交付结果。
tags: [mcp, desktop, bridge, ipc, agent, security]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-27T13:29:03.591Z
sources:
  - id: openwiki-source-5d33672c45ec58cd29dce507
    resource: repo://apps/desktop/src/main/main.ts
  - id: openwiki-source-96631daa0b2c8e332a97ecb3
    resource: repo://apps/desktop/src/main/windows.ts
  - id: openwiki-source-10c205a4e921b18ced6f317e
    resource: repo://apps/desktop/src/renderer/components/McpStatusPill.spec.tsx
  - id: openwiki-source-ad7f21c3693ad8e219a30a50
    resource: repo://apps/desktop/src/renderer/components/McpStatusPill.tsx
  - id: openwiki-source-034a304691f6c1f77f682d25
    resource: repo://apps/desktop/src/renderer/state/useMcpBridge.ts
  - id: openwiki-source-c1447b0a1d84b7b06f5158c2
    resource: repo://libs/desktop/contracts/src/mcpIpc.ts
  - id: openwiki-source-29c934d66a454faa733f4e69
    resource: repo://libs/desktop/services/src/mcpBridgeRuntime.spec.ts
  - id: openwiki-source-582687140a7ffcc45796a4a5
    resource: repo://libs/desktop/services/src/mcpBridgeRuntime.ts
  - id: openwiki-source-af9e9eedd01c7380100306d9
    resource: repo://libs/desktop/services/src/mcpCapture.ts
  - id: openwiki-source-a7a3bb5b442026b5d45d6078
    resource: repo://libs/desktop/services/src/mcpDeliveryService.spec.ts
  - id: openwiki-source-da7d9ed7229ea1d3aab94a15
    resource: repo://libs/desktop/services/src/mcpDeliveryService.ts
  - id: openwiki-source-697d89ca37efe8b1eaf6801e
    resource: repo://libs/desktop/services/src/mcpIpcHandlers.ts
  - id: openwiki-source-8c2a2a57a7a95b5a677ada16
    resource: repo://libs/desktop/services/src/mcpRegistration.ts
  - id: openwiki-source-fa5e7270b08943dd81045610
    resource: repo://libs/desktop/services/src/mcpRequestHandler.spec.ts
  - id: openwiki-source-f914c929c674a53cdbb8b53c
    resource: repo://libs/desktop/services/src/mcpRequestHandler.ts
  - id: openwiki-source-2cf337f57f4002cc74947da4
    resource: repo://libs/desktop/services/src/mcpSensorService.ts
  - id: openwiki-source-57110244e247dc01b14ea0b1
    resource: repo://libs/desktop/services/src/readDelivery.ts
  - id: openwiki-source-2da2689c8b8685a06790cacd
    resource: repo://libs/evidence-agent-sensors/src/sensors/sensorReport.ts
  - id: openwiki-source-761175c9daae6ba4b731889e
    resource: repo://libs/evidence-mcp/src/bridge/bridge.spec.ts
  - id: openwiki-source-12552feb7d841ed4485ce9a4
    resource: repo://libs/evidence-mcp/src/bridge/client.ts
  - id: openwiki-source-549dec29444534dfdadbe736
    resource: repo://libs/evidence-mcp/src/bridge/endpoint.ts
  - id: openwiki-source-84e6441315cee138958f6890
    resource: repo://libs/evidence-mcp/src/bridge/server.ts
  - id: openwiki-source-77f78c07571bd5f81a39b9b1
    resource: repo://libs/evidence-mcp/src/server/toolset.spec.ts
  - id: openwiki-source-aac6631a251b846350b2d550
    resource: repo://libs/evidence-mcp/src/server/toolset.ts
  - id: openwiki-source-f3dd6cff8734842de5630223
    resource: repo://libs/evidence-tools/src/index.ts
generated: { by: "pi", at: "2026-11-27T13:29:03.591Z" }
---

# MCP 工具与桌面桥

`evidence-mcp` 把协议工具与传输分开：stdio 进程定义可调用的行为，桌面主进程与 `libs/desktop/services` 负责路由与服务，渲染进程持有实时 `ModelSession`。模型读取/修改面向内存；传感器与交付面向保存后的模型，不能用后者证明未保存编辑已通过检查。

## 启动与工具面

桌面可执行文件带 `--mcp-stdio` 时只启动 stdio 服务，不打开窗口、不读取项目存储，也不注册客户端；它仍需要另一个运行中的桌面宿主。启动失败写 stderr 并退出 1。`runEvidenceMcpStdio` 用桥客户端连接 `McpServer`，stdin 结束即结束；服务器把工具异常包装成错误结果。

当前注册 **25 个工具**：13 个只读，12 个写工具。

| 所有者 | 工具 |
| --- | --- |
| 渲染会话 | `get_app_state`、`get_domain_model`、`get_selected_entity`、`apply_model_patch` |
| 主进程/services 传感器 | `get_key_data_audit`、`run_stage_gate` |
| 主进程/services 交付服务 | `get_delivery_topology`、`export_openapi_contract` |
| 截图协作 | `get_canvas_screenshot` |
| 共享领域工具 | 建模原型、Context 关系、健康检查、What-If，以及凭证、配对、责任和例外处理算子 |

通用补丁工具和领域工具由 `evidence-tools` 的统一 registry 提供，Pi 和 MCP 共用 schema、描述与执行路径；其中写工具标为非幂等（idempotentHint=false），并标为 `readOnlyHint: false`、`destructiveHint: true`。所有工具先用实际 Zod schema 解析输入，未知字段或畸形参数不会进入模型访问。未知方法返回 `UNSUPPORTED_METHOD`。验收来自实体 `examples[].test`：用 `evidence export --tests` 导出 Bruno 集合，再以 `evidence test` 对真实后端执行，而不是在 MCP 中回放。

`SERVER_INSTRUCTIONS` 要求先读应用状态、再读选区或模型；先铺设凭证并澄清来源，在有真实请求和确认时配对，在合约内确定归属；假设只做模拟，确定的补偿才建模。其他变更走 `{ rationale, patches }`，禁止直接写 `.evidence/model`。位置索引编辑应先 `test` 预期对象 ID，避免过期快照改错对象；改后复查台账和阶段门禁。

证据入口：`libs/evidence-mcp/src/server/toolset.ts`、`server/mcpServer.ts`。

## 单一事务写通道

共享 registry 通过宿主端口先 `getDomainModel({ includeRules: true })`，在本地用 `createModelPatch` 运行 guarded draft mutator，再把生成的标准 JSON Patch 交给 `applyModelPatch`；算子拒绝时不发送任何写入。

渲染端解析 `ModelPatchRequestSchema`，调用一次 `session.applyPatchBatch(patches, label)`，整批成功只形成一个撤销步骤；中途 `test`、路径或结构检查失败则不提交。随后执行 `session.validate()`：严格 FM 诊断会返回 blocking diagnostics，但默认的渐进式会话不会因此回滚已接受的补丁。失败结果保留原 revision，成功只有文档引用真正改变才递增 revision；桥读取当前 session，连续调用不必等待 React 重渲染。

参见 `apps/desktop/src/renderer/state/useMcpBridge.ts` 与[模型会话](../model/commands-and-session.md)。

## 本地传输与信任边界

端点取 Electron `userData` 路径的短哈希：Unix 临时目录中的 `evidence-mcp-<digest>.sock`，Windows 为命名管道。隔离以 userData 为准，不应把它理解为网络身份认证。

Unix 启动前清理旧 socket，监听后收紧权限到 `0600`，关闭后删除；命名管道跳过文件处理。每条连接一问一答，换行分隔 JSON、用请求 ID 关联，消息上限 64 MiB。解析失败、缺 ID、超限和 socket 错误都返回结构化失败。没有 token、没有 TCP 端口：同一 OS 用户的其他进程仍可连接。

客户端每次调用新建 socket，10 秒超时；主进程为 renderer 调用分配 UUID、维护 pending map，15 秒超时。因此无响应通常先在客户端表现为 `RENDERER_UNAVAILABLE`，不会误作空模型。

## 路由与已保存结果

`createMcpRequestHandler`（位于 `libs/desktop/services`）将实时会话方法转发 renderer。传感器和交付先用 `get_app_state` 查询 active project root；没有项目就抛 `NO_ACTIVE_PROJECT`。MCP 选择的是 `listEditorWindows()` 返回的首个窗口（Map 插入顺序），不是当前焦点窗口；截图测量和模型访问共用这个 WebContents。

- 传感器服务按 root 缓存；无法读取时台账为 `producedBy: unavailable`，门禁为 `passed: false`、退出码 1，不能显示空绿灯。MCP 台账的 `derived` 当前固定为空，不能代表完整派生明细。
- 交付服务复用 `readDelivery`（`loadModel` + `buildProjection`），统计各服务路由，返回 routePrefixes、精确 routes、OpenAPI、pathCount 和 limitations。读取或投影失败传播为工具错误，而不是部分契约。
- 交付以活动工作区的 `.evidence/model` 为输入。

## 截图、注册与状态

renderer 测量可见画布或目标节点裁剪矩形；无布局/节点在屏外时返回 null，主进程抛 `SCREENSHOT_FAILED`。有效截图前后切换 capture-mode 隐藏选框与控制条，调用 `capturePage(rect)` 并编码 PNG，以保留细线和小字。

启动时注册 Cursor，以及 macOS/Windows 的 Claude Desktop：仅客户端配置目录已存在才合并 `evidence-desktop` 项，保留其他键和服务器；损坏配置只报告失败、不覆盖。配置运行同一个可执行文件，参数 `--mcp-stdio`，环境含 `EVIDENCE_MCP_ENDPOINT`；Linux 不猜测 Claude 路径。

`McpStatus` 包含 listening、endpoint、connections、calls、registeredClients、error；连接变化和调用后推送所有窗口，也支持拉取。状态 pill 表示未启动、待命、连接中并显示端点/调用数。connections 只在短连接调用进行时非零，registeredClients 只含配置成功者；`get_app_state` 中的固定 `{ connections: 1, calls: 0 }` 不是实时计数。

## 失败与测试

| 情况 | 对外行为 |
| --- | --- |
| 桌面未运行 | `APP_NOT_RUNNING`；只有 `get_app_state` 降级为 `isRunning: false` |
| 桌面在运行但无编辑窗口 | 首次 renderer 跳转失败并序列化为 `INTERNAL_ERROR`，不降级为离线 |
| 无选区 | `NO_SELECTION` |
| bridge 启动失败 | stderr 记录，桌面继续但没有 MCP |
| 模型/门禁不可用 | 显式 unavailable 或失败 |

`libs/evidence-mcp/src/bridge/bridge.spec.ts` 覆盖真实 socket 往返、0600、超时和端点复用；`toolset.spec.ts` 覆盖输入先验拒绝、25 个工具及其中十二个写工具、PNG、算子提交与拒绝。`libs/desktop/services` 的 `mcpBridgeRuntime.spec.ts` 验证调用计数、renderer 错误、截图恢复和无窗口；`mcpRequestHandler.spec.ts` 验证路由、active root、空截图、未知方法和计数。传感器、交付及客户端注册各有独立测试。

## 相关页面

- [Pi 建模 Agent](./pi-harness.md)
- [原生传感器](./sensor-orchestration.md)
- [实时会话同步](../desktop/renderer-state.md)
- [API 投影](../contracts/api-projection.md)
