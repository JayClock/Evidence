---
type: architecture
title: 桌面宿主与项目生命周期
description: Electron 窗口与 IPC 边界、目录工作区的自动持久化，以及 Chokidar 监控和外部变更冲突。
tags: [desktop, electron, ipc, preload, project-store, windows]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-27T13:29:03.591Z
sources:
  - id: openwiki-source-f85ce0e3a462797434d822a8
    resource: repo://apps/desktop/src/main/agentIpcHandlers.ts
  - id: openwiki-source-55138c775f581f8c989ca7dc
    resource: repo://apps/desktop/src/main/agentRuntime.ts
  - id: openwiki-source-db59d33fa24fde2a30d85df7
    resource: repo://apps/desktop/src/main/ai/aiConfigIpc.ts
  - id: openwiki-source-8a985fe113b4313884662500
    resource: repo://apps/desktop/src/main/artifactPipeline.ts
  - id: openwiki-source-c8d6c908e749a45544b1e625
    resource: repo://apps/desktop/src/main/deliveryIpc.ts
  - id: openwiki-source-71f7c0262d5ba642c71843ea
    resource: repo://apps/desktop/src/main/ingestionIpc.ts
  - id: openwiki-source-116417bc4058f5af8fe23abc
    resource: repo://apps/desktop/src/main/livePersistence.ts
  - id: openwiki-source-5d33672c45ec58cd29dce507
    resource: repo://apps/desktop/src/main/main.ts
  - id: openwiki-source-934367cee5dc2ef07c9fb835
    resource: repo://apps/desktop/src/main/modelWatcher.ts
  - id: openwiki-source-1ea7682f1abe09b6e2edbf92
    resource: repo://apps/desktop/src/main/projectIpc.spec.ts
  - id: openwiki-source-7bb156d03ddba2cff4399f8b
    resource: repo://apps/desktop/src/main/projectIpc.ts
  - id: openwiki-source-7d6301f8bedb09df7ce20329
    resource: repo://apps/desktop/src/main/projectStore.ts
  - id: openwiki-source-96631daa0b2c8e332a97ecb3
    resource: repo://apps/desktop/src/main/windows.ts
  - id: openwiki-source-e7883d7e0923e51ae8b6bf50
    resource: repo://apps/desktop/src/preload/index.ts
  - id: openwiki-source-6651f1ec072a303df17f1059
    resource: repo://apps/desktop/src/renderer/App.spec.tsx
  - id: openwiki-source-11fabacb6c2c8bcce85a2dd4
    resource: repo://apps/desktop/src/renderer/App.tsx
  - id: openwiki-source-8cf0a9a71aa931358b6f4ffc
    resource: repo://apps/desktop/src/renderer/components/dashboard/CreateProjectModal.tsx
  - id: openwiki-source-22956292b0951fa33ef92a77
    resource: repo://apps/desktop/src/renderer/screens/DashboardScreen.tsx
  - id: openwiki-source-f0f06a0981a7ca97c510b44d
    resource: repo://apps/desktop/src/renderer/state/useEditorSession.ts
  - id: openwiki-source-87e5669496e1e215691f3e0c
    resource: repo://apps/desktop/src/renderer/state/useLiveModelBridge.ts
  - id: openwiki-source-26d2bfdeaab3b9cf414f5bfe
    resource: repo://libs/desktop/services/src/modelSource.ts
  - id: openwiki-source-2c4cbeffd18cdc1b75d15ef4
    resource: repo://libs/evidence-model-io/src/adapters/diskAdapter.ts
  - id: openwiki-source-e399a918ad3d695b7f506627
    resource: repo://libs/evidence-model-io/src/workspace.ts
generated: { by: "pi", at: "2026-11-27T13:29:03.591Z" }
---

# 桌面宿主与项目生命周期

apps/desktop 是 Electron 可视化宿主（另有 apps/cli 终端应用）。main 持文件系统/进程资源，renderer 持 ModelSession；contextIsolation=true、nodeIntegration=false，preload 仅通过 contextBridge 暴露 typed evidenceAPI，不泄漏 fs/ipcRenderer。

## 启动与窗口

ready 后创建 recent-projects.json store，注册 Agent、项目、摄取、story、AI、delivery IPC，再同步 MCP client config、启动本地 bridge、成功后注册 MCP IPC，最后开 dashboard。配置同步失败降级空列表，bridge 启动失败写 stderr 并继续；before-quit 释放 Agent/bridge。macOS 使用 light theme、activate 在无窗口时重开 dashboard，其他平台 window-all-closed 退出。

同一 binary 带 --mcp-stdio 则不打开窗口、不读 store、不注册客户端，仅连接已运行 desktop socket；失败写 stderr/退出1。

Dashboard 1024×680（min900×600），editor1440×900（min1180×760），无框隐藏标题栏。Map 以 rootPath 去重 editor，重复打开 focus，closed 只清自己条目；MCP 取 Map 首窗而非 focus 顺序。hash routing 支持 dev URL 与 packaged file：#/editor?rootPath=encoded，其余回 dashboard，缺 root 明确错误。

Dashboard mount 同时读 recents/templates，模板数量来自真实构造；open 后更新 recent 再 openEditorWindow。精选模板卡包括 procurement 和 blank。创建对话框选择工作区目录；create 后开 editor。摄取 compile 也通过同一 store/createFromDocument 落地。

## Preload 合同

EvidenceDesktopApi 分 projects、agent、mcp、ingestion、story、aiConfig、system。projects 包含工作区读写队列、持久化与产物状态，以及只读 API 预览；agent 负责会话、实时镜像、sensors、选区和已提交补丁事务；mcp 负责状态/request/response/capture-mode。

请求多为 invoke，订阅均返回 unsubscribe；mcp.respond 用单向 send 回答 main 发起请求。Agent 事务由 main 单向发布，也随 prompt 返回。channel 与 DTO 由 desktop-contracts 统一；features 通过参数取得窄 API port，只有 app shell 读取 window.evidenceAPI。renderer tests 注入 evidenceAPI 假实现，不启动 Electron。

## 工作区与持久化

ProjectStore 每次打开从磁盘读取工作区的 `.evidence/model/`，不缓存领域文档。显式初始化以独占方式创建 `.evidence/`，已有同名入口时拒绝覆盖。最近项目单独保存，最多 20 条，按根去重并以临时文件与 rename 更新，无法读取时视为空列表。

编辑器状态先更新，主进程按工作区所有者和持久化 ID 接收修订，防抖 400 ms，串行写入；等待时只保留最新快照。ProjectStore 写前比较来源摘要，对无变化的字节不重写，写后复查摘要。外部更改引发冲突而不是被覆盖；用户可显式重新加载。准备关窗时尝试完成待写修订，不由 renderer 的卸载取消。

Chokidar 从现存祖先监控真实路径，只接收 manifest 和三类源树；等待稳定写入并去抖后合批。打开与重载为编辑窗口创建或更换 watcher，关闭后清理。主进程对收到的事件重新计算摘要，忽略自身写入；不匹配时发布持久化冲突并使故事缓存失效。

## 主进程服务边界

原生 story IPC 支持故事与 what-if，AI 依赖由 main 的统一 AiConfigService 注入。配置可通过 AI badge、Cmd/Ctrl+, 或命令面板打开。主进程使用共享 Pi 配置目录；renderer 仅接收公共状态，可选模型、调思考级别、测试连接、重载配置或打开配置目录。测试连接不保存，默认 15 秒超时；选择或重载后重置旧 Agent/story 模型，保留画布状态和 Agent transcript。

交付 IPC 只读分析显式编辑修订；主进程从确认的磁盘版本生成 API 草稿、Bruno 和传感器结果，任务过期时不能发布到当前界面。

摄取可选模型 reader 和规则 fallback，compile 拒绝空实体，再写项目/开窗。

Agent runtime 按规范化 root 绑定唯一 editor owner，关窗释放。补丁在 main 原子提交，再由 renderer 按 revision 重放；不再等待 renderer 确认。MCP 同一 WebContents 回答模型和截图矩形，status 推送所有窗口并可拉取，见专页。

## 验证入口

projectStore 和 projectIpc specs 保护初始化、磁盘冲突和工作区所有权；modelWatcher specs 保护树的原子写、合批和关闭；livePersistence 和 artifactPipeline specs 验证排队与产物版本。App tests 保护 hash；delivery/ingestion/story/AI IPC specs 通过注入 dialog/service 保护生命周期与取消，integration specs 验证真实树往返。

## 相关页面

- [系统架构与依赖边界](../architecture/overview.md)
- [渲染会话、异步布局与实时同步](./renderer-state.md)
- [工作区、台账与交付](./workspace-surfaces.md)
