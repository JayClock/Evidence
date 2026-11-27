---
type: pipeline
title: 静态门禁、CEL 与样例求值
description: FM check v6 如何分开一致性与scope完整性，native cel-js如何分析/求值，以及内联样例oracle和真实HTTP验收之间的不可替代边界。
tags: [validation, check, cel, examples, traceability]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-27T13:29:03.591Z
sources:
  - id: openwiki-source-52a825b501b0001cef1b2ecc
    resource: repo://apps/cli/src/commands/check.ts
  - id: openwiki-source-64a2b18876b184e07c424672
    resource: repo://apps/cli/src/commands/model.ts
  - id: openwiki-source-69d58f985d20203ea0c2f899
    resource: repo://apps/cli/src/router.ts
  - id: openwiki-source-8a985fe113b4313884662500
    resource: repo://apps/desktop/src/main/artifactPipeline.ts
  - id: openwiki-source-694f14a9d64dcf9f23bb8a3b
    resource: repo://apps/desktop/src/renderer/state/useSensorsState.ts
  - id: openwiki-source-74d7b554a01c3f371dc93772
    resource: repo://libs/desktop/feature-story/src/state/journeyPreview.ts
  - id: openwiki-source-2da2689c8b8685a06790cacd
    resource: repo://libs/evidence-agent-sensors/src/sensors/sensorReport.ts
  - id: openwiki-source-cf9d5eba427ed358972cd1da
    resource: repo://libs/evidence-cel/src/transientSandbox.ts
  - id: openwiki-source-7f610f2a7e2a332dd6249f23
    resource: repo://libs/evidence-model-core/src/scenario/scenarioStudio.ts
  - id: openwiki-source-39aee7c17098a6b50b3614f9
    resource: repo://libs/evidence-model-core/src/trace/flowAggregator.ts
  - id: openwiki-source-1375ef32da94e5a47494a6c0
    resource: repo://libs/evidence-model-core/src/validation/breachFlow.ts
  - id: openwiki-source-9008514a60858ff717f539ab
    resource: repo://libs/evidence-model-core/src/validation/fmCheck.ts
  - id: openwiki-source-f1f4a36fd7c708ebe345d142
    resource: repo://libs/evidence-model-core/src/validation/lintRules.ts
  - id: openwiki-source-bb6561cac02f8a21961ea926
    resource: repo://libs/evidence-model-core/src/validation/scope.ts
  - id: openwiki-source-58cc0dc028651165d939cdea
    resource: repo://libs/evidence-schema/src/ast/documentSemantics.ts
  - id: openwiki-source-f3dd6cff8734842de5630223
    resource: repo://libs/evidence-tools/src/index.ts
generated: { by: "pi", at: "2026-11-27T13:29:03.591Z" }
---

# 静态门禁、CEL 与样例求值

静态 FM v6 检查、CEL 样例求值、只读 What-If 和真实 HTTP 验收各自回答不同问题。

## FM check v6只证明静态事实

buildFmCheckReport同步聚合sourceIssues、strictValidateDomainModel的path/message、analyzeTraceability错误，去重后形成staticErrors/modelValidated。若用户提供scope且静态模型有效，再selectScope；ScopeSelectionError成为错误，其他内部异常不吞。completenessGaps仅在原模型有效时计算，target为selected或全模型。

currentDigest回调与输入digest比较，变化附Model inputs changed during validation，inputChanged=true、consistent=false。consistent=无静态错误且未变化；complete无scope为null，有scope为gaps为空且consistent；valid=无errors且complete!==false。所以无scope时有gaps仍可valid，不能把一致性当完整交付。

报告checkVersion=6，包含scopeRefs/contextRefs/gaps/errors、modelDigest/modelValidated/inputChanged、**testExampleCount（声明数量，不是执行数）**和humanConfirmation=not-asserted-by-machine。advisories始终针对提交模型，名称建议如ROLE_DOMAIN_NAME_NOT_ANTHROPOMORPHIC不影响consistent/complete/valid。

## Scope是交付单位

selectScope只收独立Context，拒绝非Context、child slice、重复scope。保留整个Context subtree、真实引用/规则依赖和角色实现；共享participant.party不把另一合同整包拖入，未知context-role实现不能猜造。

completeness 要求每属性 valueType/required、显式业务时标、凭证归属与责任、请求有confirmation/evidence-role、confirmation有request引用、contract context存在primary request、双方都作primary履约权利人等；已经是static error的不重复成gap。

flowKind 的完整性检查要求补偿请求/升级记录显式 references 被违约请求；补偿源须为新请求且链不得循环，升级须 other_evidence、责任角色及交接端点 notes。它只证明结构，不判法律终局，不能绕过请求自身的确认闭环。

readyScope重建同一scope并校验v6报告的一致/完整/有效、无errors/gaps、输入未变以及scope/context边界匹配。正式下游还有API projection/coverage门禁，见[传感器](../agents/sensor-orchestration.md)。

## 原生CEL是解析与求值权威

celEvaluator（位于 `libs/evidence-cel`）以@marcbachmann/cel-js Environment(unlistedVariablesAreDyn=true)直接parse，CompiledCel暴露native ParseResult/AST及可重复evaluate。native错误保留range/cause；isCelBuiltin排除内建常量/namespace，identifiers通过scoped walker排除宏局部变量。

Timestamp输入按declared type变Date，Duration与UnsignedInt使用native类型。int/uint为精确bigint，不走double中间态；celValueToJson把safe整数变number，**较宽整数变精确十进制string**，Date/Duration/bytes/Map/容器递归归一化。validateTypedValue允许safe number或在int64/uint64范围的exact decimal string；拒绝unsafe number、越界/格式错误，而不是拒绝所有大于JS安全范围的合法CEL整数。

native scoped AST也用于属性lineage与Inspector诊断，many macro/shadowing与static index规则见[关键数据](../language/key-data-and-provenance.md)。表达式能parse不等于模型绑定正确，能求值不等于后端执行了它。

## 瞬态样例oracle

evaluateRuleOnExample（位于 `libs/evidence-cel`）无Node I/O，不读环境时钟，不加载scenario文件。asOf必须RFC3339，拒绝未知alias、缺binding、one/list形态错误、无法解析entity或typed value。now/asOf的timestamp type-only alias由显式asOf注入，用户传不同值拒绝；其他scalar必须提供。

按模型属性类型转换独立clone的输入，compile/evaluate后celValueToJson，再验证resultType与JSON可表示性；拒绝undefined/non-finite/private runtime泄漏，失败保留rule ID与cause。它是**编译期预期生成器，不是backend simulator**。

evidence-acceptance projector 从 examples[].test解析flow依赖，先清asserted derived值、用upstream facts求规则，再对显式期望核对，冲突拒绝而非覆盖；`evidence test` 调用 Bruno 在真实后端检查状态与业务字段，再用响应做 Schema 校验；生成集合本身不是执行证据。int64/uint64精确string可保留到OpenAPI/测试literal，避免舍入制造伪绿。

## 故事与本地预演

scenarioStudio 编辑的是实体 `examples[].test` 中的 flow。flowAggregator 按显式 basedOn 与时点构造只读轨迹，供故事投影。桌面 journey preview 仅对当前可见前缀与唯一非 test 示例求规则，缺绑定保持未知，求值错误可见；它不执行 HTTP，也不形成持久化 replay 结论。卡片 What-If 是基于当前履约对的只读假设评估；补偿只有另行确认并建模才会写入。

## CLI和桌面当前入口

`evidence check --workspace <dir> --scope <context> --json` 读取工作区模型；`--scope` 可重复，从工作区内运行时可省略 `--workspace`。`compile` 和 `lineage` 要求报告有效后才写 `.evidence/derived/`。

桌面ProblemsPanel读SensorReport：FM errors=block、gaps=warn、inputChanged=warn、advisories=warn。报告documentRevision不等当前或loading/error则过期不标画布。自动诊断从已落盘修订生成，手动诊断可针对编辑器；检查不修改模型，不代替业务批准。

## 验证与故障边界

fmCheck/scope specs保护v6字段、null complete、digest变化、独立边界、缺口和lint；celEvaluator/celAnalysis/traceability specs保护native功能、词法scope和精确整数；transientSandbox specs保护显式时钟、typed值、resultType/JSON、输入不变。API acceptance e2e 用独立 HTTP 后端验证真实红绿。

遇错按层定位：syntax/引用/lineage→修模型；scope gaps→补责任闭环；oracle绑定/期望→修examples或规则；HTTP失败→修实际实现；源变更→重查；工具缺失→显式setup，不编造一个成功结论。

## 相关页面

- [FM v6 语言与严格契约](../language/fm-dsl.md)
- [受控模型变更、会话与历史](./commands-and-session.md)
- [测试边界与验证策略](../testing/verification-strategy.md)
