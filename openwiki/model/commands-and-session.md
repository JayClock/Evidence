---
type: architecture
title: 受控模型变更、会话与历史
description: Immer recipes、guarded mutators与标准RFC6902如何构成原子模型事务，历史、选择、同步事件和Agent/MCP边界的真实安全语义。
tags: [mutations, session, undo, subscriptions, patches, diff, graph, purity]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-27T13:29:03.591Z
sources:
  - id: openwiki-source-55138c775f581f8c989ca7dc
    resource: repo://apps/desktop/src/main/agentRuntime.ts
  - id: openwiki-source-8a985fe113b4313884662500
    resource: repo://apps/desktop/src/main/artifactPipeline.ts
  - id: openwiki-source-71f7c0262d5ba642c71843ea
    resource: repo://apps/desktop/src/main/ingestionIpc.ts
  - id: openwiki-source-f0f06a0981a7ca97c510b44d
    resource: repo://apps/desktop/src/renderer/state/useEditorSession.ts
  - id: openwiki-source-87e5669496e1e215691f3e0c
    resource: repo://apps/desktop/src/renderer/state/useLiveModelBridge.ts
  - id: openwiki-source-034a304691f6c1f77f682d25
    resource: repo://apps/desktop/src/renderer/state/useMcpBridge.ts
  - id: openwiki-source-0c662531e68a2db936eccc7f
    resource: repo://libs/desktop/feature-agent/src/state/usePatchReview.ts
  - id: openwiki-source-bab9cd022cd0c06c4edacf32
    resource: repo://libs/evidence-model-core/src/diff/modelDiff.ts
  - id: openwiki-source-c6f998270d30fac839dc0715
    resource: repo://libs/evidence-model-core/src/model/graph.ts
  - id: openwiki-source-5f7aa18271519108d52c8b0d
    resource: repo://libs/evidence-model-core/src/mutations/attributeMutations.ts
  - id: openwiki-source-6aa88597ad507455da0395d6
    resource: repo://libs/evidence-model-core/src/mutations/derivationMutations.ts
  - id: openwiki-source-f9bdd97bedce682d7ba772f7
    resource: repo://libs/evidence-model-core/src/mutations/entityMutations.ts
  - id: openwiki-source-719c33f78b7e011a9ae31e2b
    resource: repo://libs/evidence-model-core/src/mutations/errors.ts
  - id: openwiki-source-bbf79e218d6aafb73b87b3af
    resource: repo://libs/evidence-model-core/src/mutations/evidenceGrowth.ts
  - id: openwiki-source-018d7f07550f9f8d085a8f81
    resource: repo://libs/evidence-model-core/src/mutations/fulfillmentMutations.ts
  - id: openwiki-source-435cf97447e9a87f2921f3cd
    resource: repo://libs/evidence-model-core/src/mutations/guards.ts
  - id: openwiki-source-32b6905d2b3e0b5d4b3caa0f
    resource: repo://libs/evidence-model-core/src/mutations/relationshipMutations.ts
  - id: openwiki-source-ff9543d041ae3c5c225cf524
    resource: repo://libs/evidence-model-core/src/mutations/ruleMutations.ts
  - id: openwiki-source-36b616eafb8331e3eddb8d31
    resource: repo://libs/evidence-model-core/src/purity.spec.ts
  - id: openwiki-source-b4abb2821db0f045818014a1
    resource: repo://libs/evidence-model-core/src/session/createModelSession.ts
  - id: openwiki-source-5552b65f098f7942c5396da6
    resource: repo://libs/evidence-model-core/src/session/jsonPatches.ts
  - id: openwiki-source-307bb5e668d266a4bd7c1f2d
    resource: repo://libs/evidence-schema/src/ast/jsonPatch.ts
  - id: openwiki-source-f3dd6cff8734842de5630223
    resource: repo://libs/evidence-tools/src/index.ts
generated: { by: "pi", at: "2026-11-27T13:29:03.591Z" }
---

# 受控模型变更、会话与历史

`createModelSession` 以 **Immer draft recipe + forward/inverse patches** 管编辑；协议只传RFC6902和RFC6901字符串pointer，不泄漏Immer array paths。

## 会话所有权与提交

session持current document、惰性memo DomainGraph、selection、undo/redo、listener Set。公开读getDocument/getGraph/getSelection/validate/canUndo/canRedo；写 mutate(recipe,label)、applyPatchBatch、applyCommittedPatch、replaceDocument；历史undo/redo；选择select/selectAttribute/clearSelection与subscribe。

mutate在produceWithPatches隔离draft运行，snapshotRecipeResult避免返回revoked draft/别名；无patch为no-op，不清redo、不发文档事件。异常中途抛出就不record。record先可选strict gate，再提取affectedIds、裁undo、清redo、换document/清graph、发document-changed后history-changed。affectedIds比较前后对象身份并包含关系端点，数组移位不把所有后移对象都误报改动。

historyLimit默认100，finite取floor并至少1，非finite回100。entry包含label/patches/inversePatches/affectedIds；undo/redo应用已存patch而非重跑recipe，空stack返回false，新编辑清redo。replaceDocument默认作为可撤销replacement并走record/guard；resetHistory=true清两stack直接替换，供reload，不受forward gate。undo/redo也不重做strict gate，恢复历史事实。

## 渐进建模不是绕过语法

validateOnDispatch默认false，开启时对next strictValidate，失败ModelSessionValidationError、文档与历史均不提交。desktop初建只传document，允许静态不完整的渐进模型；但领域mutator仍实施业务guard，RFC6902边界仍实施strict syntax。原子JSON Patch不是自动调用每个domain mutator，所以不能声称任意wire patch都等同经过所有领域guard。

## Guarded domain mutators

mutations/下的函数接受draft并原地更新draft，不能拿普通共享源直接当可变容器。guards核实ID grammar/跨集合唯一、实体/context/root合同、party roles已绑定、分类/责任边界。ModelMutationError有稳定code/details，供工具诊断而非解析中文。

entity identity的id/type/category不可随update改，rule的id/type/kind/context/target保持；派生目标存在时attribute rename拒绝，不能可靠重写expression。entity删除先枚举所有引用，不cascade则entity.referenced，cascade仅删可安全移除引用；derived attribute移除先处理rule，不能留悬空target。relationship拒绝self与错误plays_role方向。

复合mutators同步写合同root、派生双向或完整履约结构，在一个recipe形成一次历史。证据可不先定责而独立生长，后续可拆分请求/确认、绑定结构化来源、为履约组指定上下文并记录补偿。

## Agent、MCP与差异对比

MCP 在 renderer applyPatchBatch，Pi 主进程原子提交、renderer applyCommittedPatch 重放；共享历史，只在真变更后建立 Agent 审阅。diffDomainModels 产生只读差异，支持 patch review 构建 overlay 与一键撤销。自动传感器由已落盘的产物流水线调度。

## 相关页面

- [渲染会话、异步布局与实时同步](../desktop/renderer-state.md)
- [静态门禁、CEL 与样例求值](./checks-and-simulation.md)
- [模型工作区与源文件](./source-formats.md)
