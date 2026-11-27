---
type: workflow
title: 资料摄取与补丁审查
description: 业务文本、协议和蓝图如何先变成可修正草稿再创建项目，以及已提交 Agent JSON Patch 如何在保持后续编辑安全的前提下一步撤销。
tags: [ingestion, draft, blueprint, contract-clauses, patch-review, desktop]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-27T13:29:03.591Z
sources:
  - id: openwiki-source-55138c775f581f8c989ca7dc
    resource: repo://apps/desktop/src/main/agentRuntime.ts
  - id: openwiki-source-71f7c0262d5ba642c71843ea
    resource: repo://apps/desktop/src/main/ingestionIpc.ts
  - id: openwiki-source-1c1b4203dc4b1050778717b6
    resource: repo://apps/desktop/src/main/ingestionModelReader.ts
  - id: openwiki-source-74158507676a0014907d29c4
    resource: repo://apps/desktop/src/renderer/screens/EditorScreen.spec.tsx
  - id: openwiki-source-9459ee1a8fc917f2d94619ce
    resource: repo://apps/desktop/src/renderer/screens/EditorScreen.tsx
  - id: openwiki-source-e4eff0404180d86ccc5c9300
    resource: repo://apps/desktop/src/renderer/state/useEditorShortcuts.ts
  - id: openwiki-source-87e5669496e1e215691f3e0c
    resource: repo://apps/desktop/src/renderer/state/useLiveModelBridge.ts
  - id: openwiki-source-0f694a4fe59aaac32febf5b9
    resource: repo://libs/desktop/contracts/src/ingestion.ts
  - id: openwiki-source-a4f2cbe0bac1324ce81a947e
    resource: repo://libs/desktop/contracts/src/ipc.ts
  - id: openwiki-source-ac27b1bc49832883eb3ab2c2
    resource: repo://libs/desktop/feature-agent/src/components/agent/InlinePatchCard.tsx
  - id: openwiki-source-af477b8a3e3d3695b6300a12
    resource: repo://libs/desktop/feature-agent/src/state/usePatchReview.spec.tsx
  - id: openwiki-source-0c662531e68a2db936eccc7f
    resource: repo://libs/desktop/feature-agent/src/state/usePatchReview.ts
  - id: openwiki-source-3de36534a91cd7bc566fa73b
    resource: repo://libs/desktop/feature-ingestion/src/DraftReviewPanel.tsx
  - id: openwiki-source-4118fb8b792cfa64e27f061d
    resource: repo://libs/desktop/feature-ingestion/src/IngestDraftModal.tsx
  - id: openwiki-source-3b4892a0d4698c5c4f9afc2f
    resource: repo://libs/evidence-agent/src/prompts/ingestion.ts
  - id: openwiki-source-e7a0163cee12c286486c9e09
    resource: repo://libs/evidence-ingestion/src/blueprintParser.spec.ts
  - id: openwiki-source-a8401c74bdabce3583ee0faa
    resource: repo://libs/evidence-ingestion/src/blueprintParser.ts
  - id: openwiki-source-c42b13ef1a37b9815f238e72
    resource: repo://libs/evidence-ingestion/src/compileDraft.spec.ts
  - id: openwiki-source-c72f3ae3bdeedab3b69531aa
    resource: repo://libs/evidence-ingestion/src/compileDraft.ts
  - id: openwiki-source-981e7780f12aa16a4cbad7c0
    resource: repo://libs/evidence-ingestion/src/contractAnnotator.spec.ts
  - id: openwiki-source-d05386d298648515951c1601
    resource: repo://libs/evidence-ingestion/src/contractAnnotator.ts
  - id: openwiki-source-28fbdef6d24bd368fb32ac63
    resource: repo://libs/evidence-ingestion/src/contractReader.spec.ts
  - id: openwiki-source-63090b1842811e6d7feab22a
    resource: repo://libs/evidence-ingestion/src/contractReader.ts
  - id: openwiki-source-87d1f635bdcebe6ba2d509a2
    resource: repo://libs/evidence-ingestion/src/draftAssembly.ts
  - id: openwiki-source-bea3b070120987aa7086cae7
    resource: repo://libs/evidence-ingestion/src/draftSupport.ts
  - id: openwiki-source-545d5fdc074fc194a9f1ab0b
    resource: repo://libs/evidence-ingestion/src/readDraftJson.ts
  - id: openwiki-source-f493d1fe2a59521ae7006150
    resource: repo://libs/evidence-ingestion/src/textExtractor.spec.ts
  - id: openwiki-source-b4abb2821db0f045818014a1
    resource: repo://libs/evidence-model-core/src/session/createModelSession.ts
  - id: openwiki-source-8527abf116e660a4c6e52d8a
    resource: repo://libs/evidence-schema/src/ingestion/draft.ts
generated: { by: "pi", at: "2026-11-27T13:29:03.591Z" }
---

# 资料摄取与补丁审查

两种辅助路径方向不同：**摄取先审后建**，**Agent 补丁先应用再审查**。后者必须在 tool call 内给模型反馈，审查不是写前批准。两者最终都使用普通 FM 与普通门禁，不发明特殊可信格式。

## 三种 reader、一份草稿

main 的 ingestion:draft/compile 承担模型调用与落盘，renderer 无文件系统。kind=contract 先分句离线阅读；blueprint 用确定性表格解析；text 优先配置模型，不可用或返回不可读结果时回退本地规则。结果显式 reader=contract/blueprint/text-model/text-rules，fallback 带原因与原/新问题，不能把失败说成“业务没有内容”。

协议 annotator（位于 `libs/evidence-ingestion`）按程序/风险分配 → 业务动作 → 计算的优先级分类 business/domain/boilerplate，防“提交仲裁”被误当履约。annotation 保留原句、1-based locator、原因、computesValue 与 charStart/charEnd 字符偏移。模糊或程序/义务混合条款报告待人判断，法律文字仍可展开阅读，不默默丢弃。contract reader 对业务句复用 row reader，计算条款生成有名称的 domain calculator/checker thing，去重并附“第N句”来源；不能命名则留缺口，不编一个公式。草稿 sourceDocument 保留协议全文及条款切片；仅唯一精确匹配才把对象 provenance 连接到 clauseIndex/字符范围，重复句子不猜位置，编译后保留为 manifest.sourceDocument 与 entity.sourceSnippet。完全无业务句明确报告。

模型 reader 是 tool-less 读法，不是项目 Agent：使用主进程统一 AI 配置的显式模型依赖，临时目录、noTools=all、120秒、收 text deltas 并以最终助理消息校准、agent-error 转失败、finally 清会话/临时目录。随包 prompt 要求合同/双方角色、签约时点、前合同 rfp/proposal、请求时段/确认时刻（用 timeRole 绑定实际字段）、补偿新履约、domain thing/计算与逐句来源，禁止补造配对或把法律条款改义务，JSON-only。

readIngestionDraftJson 从 fence/文本取对象，缺集合补空、错误类型报告，短 kind 规范化；未知 evidence 保留 other_evidence 并告知，未知 domainRole 丢弃并告知。无法解析、非对象或元素缺 ID 全体拒绝。draft 的 contexts/participants/roles/things/evidences/fulfillmentPairs/breachCompensations/relationships 共八数组，ID 暂定、可附 ProvenanceSnippet，shape guard 仅检查容器和 ID。

本地 text reader 识别合同、时限义务、完成确认、单独证明和双方；签约后引用不重复造合同，违约是另一义务非回滚，配不上明确留缺。parseBlueprint 支持 Markdown/CSV 的中英 stage/activity/evidence/kind/party/thing/system aliases，保留重复文书为独立对象和 row provenance；孤立 confirmation 不造 request。

## 人工修正与编译

IngestDraftModal（位于 `libs/desktop/feature-ingestion`）支持粘贴或载入本地文件，拒空文本，读取后展示 DraftReviewPanel：reader、evidence/participant/pair 数、删改断开的 pair、条款分类和被过滤法律句、来源 locator 与缺口。可改 evidence label/kind/drop，本地变更不写模型；移除 pair 端点后计数相应减少。不能靠面板替编译器编造缺失的合同另一方。

提交才选目标并 compile。compileIngestionDraft 为对象重编稳定 schema ID，重复 label 加后缀；以 monotone fixpoint 决定可写对象，删除合同会传递删除失根 Context、成员、pair，每个 droppedId 报一次。只有 pair 两端存在、同合同且引用成立，并能找到请求的起止时标与确认时点，才生成完成规则；缺引用可明确连接，缺业务时标则报告并跳过。最后仍由 strictValidateDomainModel 判断。

main 强制用户名称，零 surviving entities 拒绝且不写盘；成功 projectStore.createFromDocument 并打开 editor，拒绝已有项目覆盖。返回的 ingestion layoutDomainModel 是草稿落地坐标（前合同/合同/履约/thing），不是 desktop 当前 ELK 画布求解器，两者不要混淆。

## Agent 补丁已在模型中

主进程解析共享 ModelPatchRequestSchema，在 owner 的最新 live revision 上原子准备并提交标准 RFC 6902 补丁。错误、仅 test 或 no-op 不产生虚假事务。`useLiveModelBridge` 去重并按 revision 重放推送和 prompt 回执中的事务，再将 before/after 交给审阅控制器；补丁仍并入人类会话历史。

usePatchReview 从 diffDomainModels 的 contexts/entities 生成 added/removed/modified IDs、rationale/op 名称和 overlay；只标现有变更对象，不加 ghost，不宣称列出所有关系/规则 diff。InlinePatchCard 提供 counts、说明、可定位 chips（removed 无法定位）、保留/撤销和过期提示；画布全局 Storming 和凭证原位 Inquiry 共用唯一 review state。

撤销应用 Immer inverse patches；仅当前模型与 after 引用相同时才执行，否则保留用户后续编辑只关闭审阅。

## 相关页面

- [工作区、台账与交付](./workspace-surfaces.md)
- [Pi 建模 Agent 与受控工具](../agents/pi-harness.md)
- [模型工作区与源文件](../model/source-formats.md)
