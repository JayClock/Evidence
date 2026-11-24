---
type: frontend
title: 业务泳道画布与属性检查器
description: 业务泳道布局与折线如何映射到 React Flow，以及模型检查器、来源台账与原生 CEL 诊断的职责。
tags: [canvas, layout, swimlane, react-flow, inspector, cel, renderer]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-24T13:18:19.740Z
sources:
  - id: openwiki-source-9459ee1a8fc917f2d94619ce
    resource: repo://apps/desktop/src/renderer/screens/EditorScreen.tsx
  - id: openwiki-source-f0f06a0981a7ca97c510b44d
    resource: repo://apps/desktop/src/renderer/state/useEditorSession.ts
  - id: openwiki-source-50f41d92dd610018f85692d8
    resource: repo://apps/desktop/src/renderer/state/useGraphLayout.ts
  - id: openwiki-source-0e9598c3f82a767e6ca10632
    resource: repo://libs/desktop/feature-canvas/src/CanvasViewport.tsx
  - id: openwiki-source-f172557f5294fb7b6d40b660
    resource: repo://libs/desktop/feature-canvas/src/diagnosticIndex.ts
  - id: openwiki-source-6e68c0c1e5717ade71a301bb
    resource: repo://libs/desktop/feature-canvas/src/DiagnosticMarkers.tsx
  - id: openwiki-source-4627c03fe3c69aaf82172492
    resource: repo://libs/desktop/feature-canvas/src/FulfillmentEdge.tsx
  - id: openwiki-source-7a1228eb46af6c602fefd762
    resource: repo://libs/desktop/feature-canvas/src/NodeCard.tsx
  - id: openwiki-source-6d874554d1c41740fadb809b
    resource: repo://libs/desktop/feature-canvas/src/useReactFlowAdapter.ts
  - id: openwiki-source-000b39f31699cab4b8d68ff9
    resource: repo://libs/desktop/feature-inspector/src/inspector/AttributeDataGrid.tsx
  - id: openwiki-source-124f96739a75992558c391b8
    resource: repo://libs/desktop/feature-inspector/src/inspector/cel/CelCodeMirrorViewer.tsx
  - id: openwiki-source-273fd33d16f085d84b7c9c4c
    resource: repo://libs/desktop/feature-inspector/src/inspector/cel/CelFormulaBar.tsx
  - id: openwiki-source-2705304ded6d7ebcd7c41094
    resource: repo://libs/desktop/feature-inspector/src/inspector/FulfillmentPairSection.tsx
  - id: openwiki-source-294ae639434a4e29c9572cbc
    resource: repo://libs/desktop/feature-inspector/src/inspector/KeyDataLedgerSheet.tsx
  - id: openwiki-source-907db0a62784e18d1d287ccf
    resource: repo://libs/desktop/feature-inspector/src/inspector/KeyDataProvenanceView.tsx
  - id: openwiki-source-329e2fdd1b963b693d975c9a
    resource: repo://libs/desktop/feature-inspector/src/RightInspector.tsx
  - id: openwiki-source-53303a19d90a404248f1d663
    resource: repo://libs/evidence-api/src/delivery/fieldOrigin.ts
  - id: openwiki-source-9ee70d5240554c9ba831c12f
    resource: repo://libs/evidence-canvas-interaction/src/adapter/domainToLayoutTree.ts
  - id: openwiki-source-d84c8b850a9cea851ace93a0
    resource: repo://libs/evidence-canvas-interaction/src/adapter/layoutTreeToGraph.spec.ts
  - id: openwiki-source-83718bb983fce0c284abb003
    resource: repo://libs/evidence-canvas-interaction/src/adapter/layoutTreeToGraph.ts
  - id: openwiki-source-8519befa14872dae2b942568
    resource: repo://libs/evidence-canvas-interaction/src/engine/swimlaneLayout.spec.ts
  - id: openwiki-source-abc633034c7c8d642614f964
    resource: repo://libs/evidence-canvas-interaction/src/engine/swimlaneLayout.ts
  - id: openwiki-source-0ae760ad3a5c96a106b90cc0
    resource: repo://libs/evidence-canvas-interaction/src/layout/serializable.ts
  - id: openwiki-source-3b8cee887561dc24e2e125cf
    resource: repo://libs/evidence-canvas-interaction/src/ruler/math.ts
  - id: openwiki-source-8d0ffb3d7528805a524ee47f
    resource: repo://libs/evidence-canvas-interaction/src/selection/contextScope.ts
  - id: openwiki-source-40ed2cf21089af3de30a0699
    resource: repo://libs/evidence-canvas-interaction/src/selection/hoverHighlight.ts
  - id: openwiki-source-765a818dd2c076288d6080cc
    resource: repo://libs/evidence-schema/src/inspector/groups.ts
generated: { by: "pi", at: "2026-11-24T13:07:09.861Z" }
---

# 业务泳道画布与属性检查器

职责分四层：canvas-interaction 负责无 DOM/React 的 业务泳道布局与几何；desktop feature-canvas 渲染 React Flow；feature-inspector 负责模型编辑；schema/inspector 注册字段与参考约束。app 组合它们，不直接进口 React Flow/CodeMirror。

## 业务泳道布局

`computeSwimlaneLayout` 构造 Context 层级树，沿邀请投标、投标、合同签约、履约履行四阶段布置。Context 随其中凭证跨越相应阶段；因果引用影响排序。布局不依赖 DOM，`useGraphLayout` 按图和卡片密度计算，选择和回放变动不要求重排。

卡片按 simplified 220×82、standard 220×156、expanded 240×200 固定。适配器按 contextRef/parentContextRef 嵌套，保留空 Context 并拒绝父级循环。布局对象保留本地坐标和世界坐标，折线在展平时累加容器偏移；布局边缺路线会报错。

跨 Context 或 plays_role 用虚线，plays_role 有箭头。责任线来自显式 roleRefs 和 responsibleRoleRef。`toSerializableLayout` 提供不携领域对象与 Map 的几何表示。

## React Flow 只管理视口

adapter 父 Context 先列，使用 **local box + parentId/extent=parent**，free node 是 root 坐标；另存 worldBox 供范围/诊断。显式 initialWidth/Height 与 invisible source/target handles 让首次测量前边就能渲染。关系保留世界坐标 polyline；pairLink 直接使用布局的 fulfillmentPairs。

CanvasViewport 经 ReactFlowProvider 管理 pan、pinch、marquee/fit animation，非业务模型拖拽编辑器：不可 draggable/connectable，wheel zoom 关闭，pane click 清选区。范围 0.1–2 由 CanvasViewport 配置。partial marquee 只回报首个 entity，Context 是不可交互底纸。

fit/scope/density/focus/zoom 由 token 驱动，避免重渲染重放快捷键，bounds 至少1×1；scope 变化清理 hover 并重框；同 scope 布局更新保留视口语境，新建凭证可另行请求聚焦。HUD render prop 暴露 zoom/fit/reset/grid/minimap，app 叠加密度和清选区等工作区动作。controls 带 capture-hide，层级低于 activity drawer；三种背景 dots/lines/none、折叠 radar 与业务 legend 不修改模型。

scope 是 canonical layout 的 mask：目标 Context subtree、拥有对象与一跳邻居、需要的 frame（祖先仅 frame）、触边和 bounds；不重新布局另一张图。computeHighlight 只扩一跳，未知 ID 返回空/不 dim，hover 优先、否则选择保持可读。

## 节点、边、补丁与诊断

NodeCard 用 category spine 和 interval/moment/card 表现时段/时刻，domainRole participant 为 capability 形状，显示 party/responsibility/API badges；卡片按 timeRole 标记时点或时段端点，详情提供关键数据来源；凭证节点可打开卡片内 Inquiry。API 待刷新不伪装覆盖成功。out-of-scope 不可点击/键盘进入。

FulfillmentEdge 绘制布局提供的 polyline，flowKind 用独立颜色/线型区分主流程、违约补偿和升级；其余包括、diagnostic halo、plays_role arrow、cardinality chips 和 hover label；simplified 隐藏未 hover/highlight 的 plays_role。pairLink 是细虚线无箭头，语义为履约声明而非虚构关系。ChangeRing 只标当前模型新增/删除/修改，不改对象颜色。

DiagnosticIndex 只用已知 target（#前实体/关系）或真实 Context fallback，不解析消息猜引用；按 issueId 去重、保留最高 severity。Markers 画 outline/count，忽略 out-of-scope，点击把原 issues 交 app 定位。报告过期时 app 丢弃整个 index，见[renderer 状态](./renderer-state.md)。

## 声明式 Inspector 与事务

schema registry 声明 general/责任/attributes，fulfillment/rules 是专用 section；每字段给 editor/options/reference/helper。reference 约束 category/kind/sameContext，责任 picker 只供同合同 party role，单引用允许“未声明”。ID 只读，text/select/boolean/reference/attribute-table 等控件由注册信息驱动。

字段提交通过 `session.mutate(draft=>...Mutator)`。文本 local draft 在 blur/Enter 且值改变才提交，Escape 恢复，按 entity ID key 重挂避免草稿串对象。CEL/provenance 在属性行或检查器的字段台账中编辑，不在通用 rail 乱造文本提供方；此字段台账不是工作区的只读实体表。

FulfillmentPairSection 从 graph.fulfillmentPair 显示 completion/confirmation/breach，pair/breach 调 guarded mutator，拒绝在面板显示原因。AttributeDataGrid 添加/更新/cascade删除属性、来源 picker、DerivedRuleSection 都同一会话事务；派生绑定可一次创建/更新规则并连接目标，一次撤销。

ApiFieldBadge 复用 browser-safe fieldFor：Input、CEL Derived、Service Timestamp。KeyDataProvenanceView 由模型分类，显示模型推导的字段来源。宽 KeyDataLedgerSheet 和 formula bar 编辑同 session，显示待决/闭合计数；Alt+L/按钮打开，Escape stopPropagation 避免连带清选区。

## CEL 公式与诊断

公式栏通过 `CelCodeMirrorViewer` 展示当前表达式；诊断来自 model-core 对 CEL 表达式和模型候选项的分析，不由着色规则决定，也不代表整个模型通过门禁。

## 测试地图

swimlaneLayout 与 layoutTreeToGraph specs 覆盖阶段、嵌套 Context、循环、容器坐标与履约配对。feature-canvas adapter/CanvasViewport specs 覆盖父前子、local/world 对齐、早期 handles、scope/diagnostic/token/overlay。Inspector/registry/CEL specs 覆盖字段约束、单次事务撤销、来源与 native 作用域诊断；故事与泳道测试保护阶段、责任与镜头定位。

相关：[模型事务](../model/commands-and-session.md) · [关键数据](../language/key-data-and-provenance.md) · [补丁审查](./ingestion-and-patch-review.md)
