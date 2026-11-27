---
type: language
title: FM v6 语言与严格契约
description: Zod 定义的 FM v6 AST、跨对象语义约束和稳定诊断，实体/角色/Context/关系/规则红线，以及 examples[].test 的标准验收元数据。
tags: [fm, dsl, schema, entities, rules, validation, vocabulary, zod]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-27T13:29:03.591Z
sources:
  - id: openwiki-source-64a2b18876b184e07c424672
    resource: repo://apps/cli/src/commands/model.ts
  - id: openwiki-source-7bb156d03ddba2cff4399f8b
    resource: repo://apps/desktop/src/main/projectIpc.ts
  - id: openwiki-source-7048814eb39f8b8ebff8b02b
    resource: repo://libs/evidence-canvas-interaction/src/engine/journeyStages.ts
  - id: openwiki-source-b4abb2821db0f045818014a1
    resource: repo://libs/evidence-model-core/src/session/createModelSession.ts
  - id: openwiki-source-9008514a60858ff717f539ab
    resource: repo://libs/evidence-model-core/src/validation/fmCheck.ts
  - id: openwiki-source-bb6561cac02f8a21961ea926
    resource: repo://libs/evidence-model-core/src/validation/scope.ts
  - id: openwiki-source-4fa503355d9f3a8084bea718
    resource: repo://libs/evidence-model-io/src/adapters/modelRoot.ts
  - id: openwiki-source-e399a918ad3d695b7f506627
    resource: repo://libs/evidence-model-io/src/workspace.ts
  - id: openwiki-source-dd948eb74e58734da3b37ea9
    resource: repo://libs/evidence-schema/package.json
  - id: openwiki-source-75b4a800cf064015957f9321
    resource: repo://libs/evidence-schema/src/ast/clause.ts
  - id: openwiki-source-52858d6130375e8776a048e7
    resource: repo://libs/evidence-schema/src/ast/document.ts
  - id: openwiki-source-58cc0dc028651165d939cdea
    resource: repo://libs/evidence-schema/src/ast/documentSemantics.ts
  - id: openwiki-source-c265f00105116b029505cbda
    resource: repo://libs/evidence-schema/src/ast/entity.ts
  - id: openwiki-source-3a0a328f2c66bce9f017bb17
    resource: repo://libs/evidence-schema/src/ast/id.ts
  - id: openwiki-source-33794ec4dbf0b0b8815e5e81
    resource: repo://libs/evidence-schema/src/ast/lifecycle.ts
  - id: openwiki-source-6dd8352adfce201b404ea1bf
    resource: repo://libs/evidence-schema/src/ast/provenance.ts
  - id: openwiki-source-88797fd20ee6b84a485fa4c7
    resource: repo://libs/evidence-schema/src/ast/relationship.ts
  - id: openwiki-source-e32f800f7852b379dbe14855
    resource: repo://libs/evidence-schema/src/ast/rule.ts
  - id: openwiki-source-81352b1a378745cf2308d10d
    resource: repo://libs/evidence-schema/src/ast/values.ts
  - id: openwiki-source-a7be6659247893a47c92f244
    resource: repo://libs/evidence-schema/src/validation/mapZodIssues.ts
  - id: openwiki-source-3a801269d4e9a920c1e0021d
    resource: repo://libs/evidence-schema/src/validation/strictValidate.ts
  - id: openwiki-source-976e28bc7b01588161a1f7bd
    resource: repo://libs/evidence-schema/src/vocabulary.ts
generated: { by: "pi", at: "2026-11-27T13:29:03.591Z" }
---

# FM v6 语言与严格契约

FM 以权责、请求/确认、事实与边界建模，不是 CRUD 表清单。`libs/evidence-schema` 是语言入口：AST 的 **Zod schemas 是运行时权威，类型由 z.infer 推导**；随包 JSON Schemas 是外部合同。

## 文档与标识符

DomainModelDocument 是 manifest + entities/relationships/rules 三平集合，和可选 `readme`，磁盘形态为 `.evidence/model/` 下的文件树。manifest strict：type=fm_model、schemaVersion=6.0、ruleLanguage=CEL、非空 name、semver、非空且唯一 entryContextRefs，每项必须是 Context；可选 description 与私有 sourceDocument（协议全文及条款字符范围）。未知字段由严格语法拒绝。

ID 为小写字母开头的点/横线分段；属性 lower_snake_case；CEL alias为字母/下划线开头；version按semver grammar。ID跨实体/关系/规则全局唯一，重复对象报id.duplicate且不替换首次索引。VALUE_TYPES 包含CEL scalar和decimal/date/money/enum/id/list/map/dynamic等业务便利类型。

closed vocab按落盘字符串只声明一次，vocabularyIds/Labels/Field/guard派生顺序与展示标签；声明顺序是阅读顺序，不等于画布布局算法。

## 四类实体与业务时间

| category | kinds | 关键语义 |
| --- | --- | --- |
| evidence | rfp、proposal、contract、fulfillment_request、fulfillment_confirmation、other_evidence | 责任与事实，不是任意记录 |
| participant | party、thing | 实际参与方或领域对象 |
| role | party、domain、third_party、context、evidence | 能力/责任插槽，不是实现者 |
| context | contract、pre_contract、domain | 唯一所属与依赖边界 |

业务时间由 `timeRole` 而非属性名确定。rfp/proposal/request 为 `start`+`deadline` 时段，contract/confirmation 为 `occurrence` 时刻；other 可表达时段或时点。已声明时标不得重复，必须 required/keyData/timestamp；缺时标是完整性缺口。

凭证可先保存再补归属和责任。已声明的责任必须指向合法 Party Role 并遵守上下文或父合同边界；合同角色不能重复或超过两位。正式门禁另检查完整性。

participant.party不得contextRef，允许跨合同扮演；thing必须domain Context，可选domainRole=calculator/checker，不允许给Party装计算器标记。Role必须所属Context，不可携Evidence的responsibleRoleRef/roleRefs。Context不得contextRef，可有parentContextRef但不得循环；已有 rootRefs 必须引用本 Context 实体，合同 Context 声明根时恰有一个合同根；空根是完整性问题。

attribute要求name/label/meaning、可选合法valueType、boolean required/keyData，实体内名称唯一，未知字段拒绝。derivedByRuleRef必须指向同Context、target精确entity+attribute的derivation，反向target也必须被属性回指。

## 两类关系与跨界白名单

关系只有plays_role/references，端点须存在，不允许self或Contract-Contract；cardinality min≥0整数、max正整数或many、min≤max。可选 flowKind 为 primary/breach_compensation/escalation；缺省按 primary 阅读，不把默认值物化到源文件。

plays_role允许party→party/third_party role、thing→domain role、Context→context role，以及跨Context moment Evidence→evidence role。moment是contract/confirmation/other_evidence，rfp/proposal/request时段不够资格，给relationship.playsRole.momentOnly。

references 同 Context 按端点规则。跨界白名单包括 contract 到其 pre_contract 子 Context 的 proposal、Evidence 到 thing 或 confirmation/other_evidence。履约确认→请求与违约补偿请求→请求必须同归属或均未归属；不能跨合约配对。已归属上下文之间的其他引用须满足白名单。Evidence Role 作为 socket 的实现必须隔离在另一 Context。

## 六类CEL规则

derivation可产生任意合法resultType且必须target；precondition/invariant/eligibility/completion/breach必须bool且禁止target。label/description/expression非空，contextRef真实。binding为{ref,cardinality?:one|many}或{type}的严格互斥形态，alias为CEL标识符，ref须解析实体。schema只校验形态/图语义，不执行CEL；作用域、追溯和表达式求值在model-core。

## 内联 examples 是验收输入

实体examples可带test：flow、tags、actingRoleRef、显式offset RFC3339 asOf、basedOn、expectedStatus、inputs、pathParameters(exampleRef/jsonpath)、expect(JSONPath→期望)。对象strict、JSON值须真实可序列化，tags/basedOn唯一；**inputs覆盖只允许显式>=400负向测试**。静态图级检查补充示例标签/引用等约束；创建入口映射、角色、依赖隔离/排序、捕获和CEL oracle属于 evidence-acceptance projector，不把投影条件塞进schema。

## 相关页面

- [关键数据、派生与来源追溯](./key-data-and-provenance.md)
- [静态门禁、CEL 与样例求值](../model/checks-and-simulation.md)
- [API 聚合根契约与 HAL 投影](../contracts/api-projection.md)
