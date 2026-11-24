# 业务故事

> 仅投影模型声明的业务事实，不代表已执行验收或规则判定。

## defect-escalation

业务流：defect-escalation

11 个业务环节：办理《智能装备全球采购招标建议书（Global Procurement RFP）》 → 办理《顶峰数控智能制造装备竞标技术报价单（Apex Bid Proposal）》 → 办理《高端智能装备国际采购主买卖契约（Master Equipment Procurement Agreement）》 → 办理《买方与托管行三方资金托管监管协议（Tripartite Escrow Agreement）》 → 办理《首期生产预付款支付请求（Advance Down Payment Request）》 → 办理《首期预付款到账确认书（Advance Payment Bank Confirmation）》 → 办理《整机出厂及航运交付催告请求（Equipment Factory Dispatch Request）》 → 办理《国际海运多式联运提单签收确认（Multimodal Delivery Confirmation）》 → 办理《SGS中立国际技术质量公证证书（SGS Technical Inspection Certificate）》 → 办理《质检不合格后凭证质押冻结仲裁请求》 → 办理《独立托管行冻结受理与仲裁介入确认》

**业务目标**：逐步核对defect-escalation中的单据流转、经办责任与履约依据。

### 1. 办理《智能装备全球采购招标建议书（Global Procurement RFP）》

**经办方**：采购方当事人买方角色（Procurement Buyer Role） · **单据**：智能装备全球采购招标建议书（Global Procurement RFP）

采购方当事人买方角色（Procurement Buyer Role）办理《智能装备全球采购招标建议书（Global Procurement RFP）》，业务时点为2026-01-01T09:00:00Z。仅展示模型声明的事实，未执行验收或规则判定。

#### 智能装备全球采购招标建议书（Global Procurement RFP）

| 字段 | 值 | 关键数据 | 来源 |
| --- | --- | --- | --- |
| 截标时间 \(expired\_at\) | 2026-01-02T18:00:00Z | 是 | — |
| 采购预算上限 \(rfp\_budget\_ceiling\) | \{"currency":"CNY","minorUnits":120000000\} | 是 | — |
| 招标启动时间 \(started\_at\) | 2026-01-01T09:00:00Z | 是 | — |

### 2. 办理《顶峰数控智能制造装备竞标技术报价单（Apex Bid Proposal）》

**经办方**：供货方当事人卖方角色（Equipment Supplier Role） · **单据**：顶峰数控智能制造装备竞标技术报价单（Apex Bid Proposal）

供货方当事人卖方角色（Equipment Supplier Role）办理《顶峰数控智能制造装备竞标技术报价单（Apex Bid Proposal）》，业务时点为2026-01-02T09:00:00Z。仅展示模型声明的事实，未执行验收或规则判定。

#### 顶峰数控智能制造装备竞标技术报价单（Apex Bid Proposal）

| 字段 | 值 | 关键数据 | 来源 |
| --- | --- | --- | --- |
| 报价有效截止日 \(expired\_at\) | 2026-01-04T18:00:00Z | 是 | — |
| 投标总报价 \(quoted\_total\_price\) | \{"currency":"CNY","minorUnits":100000000\} | 是 | — |
| 报价承诺生效时间 \(started\_at\) | 2026-01-02T09:00:00Z | 是 | — |

依据：声明依据：doc-sourcing-rfp\#质检争议

### 3. 办理《高端智能装备国际采购主买卖契约（Master Equipment Procurement Agreement）》

**经办方**：采购方当事人买方角色（Procurement Buyer Role） · **单据**：高端智能装备国际采购主买卖契约（Master Equipment Procurement Agreement）

采购方当事人买方角色（Procurement Buyer Role）办理《高端智能装备国际采购主买卖契约（Master Equipment Procurement Agreement）》，业务时点为2026-01-03T09:00:00Z。仅展示模型声明的事实，未执行验收或规则判定。

#### 高端智能装备国际采购主买卖契约（Master Equipment Procurement Agreement）

| 字段 | 值 | 关键数据 | 来源 |
| --- | --- | --- | --- |
| 合同签约总价 \(contract\_total\_amount\) | \{"currency":"CNY","minorUnits":100000000\} | 是 | — |
| 发货交期允许天数 \(delivery\_deadline\_days\) | 35 | — | — |
| 预付款比例 \(down\_payment\_rate\) | 0\.3 | — | — |
| 契约签署生效时刻 \(signed\_at\) | 2026-01-03T09:00:00Z | 是 | — |

依据：声明依据：doc-supplier-proposal\#质检争议

### 4. 办理《买方与托管行三方资金托管监管协议（Tripartite Escrow Agreement）》

**经办方**：资金托管委托人角色（Escrow Depositor Role） · **单据**：买方与托管行三方资金托管监管协议（Tripartite Escrow Agreement）

资金托管委托人角色（Escrow Depositor Role）办理《买方与托管行三方资金托管监管协议（Tripartite Escrow Agreement）》，业务时点为2026-01-04T09:00:00Z。仅展示模型声明的事实，未执行验收或规则判定。

#### 买方与托管行三方资金托管监管协议（Tripartite Escrow Agreement）

| 字段 | 值 | 关键数据 | 来源 |
| --- | --- | --- | --- |
| 托管账户冻结资金 \(escrow\_locked\_amount\) | \{"currency":"CNY","minorUnits":100000000\} | 是 | — |
| 托管协议签署时刻 \(signed\_at\) | 2026-01-04T09:00:00Z | 是 | — |

依据：声明依据：doc-procurement-contract\#质检争议

> ⚠️ 业务待决悬念：《买方与托管行三方资金托管监管协议（Tripartite Escrow Agreement）》的业务依据或责任约定尚待补齐，请问需要补充哪些单据、数据来源或经办责任？

### 5. 办理《首期生产预付款支付请求（Advance Down Payment Request）》

**经办方**：供货方当事人卖方角色（Equipment Supplier Role） · **单据**：首期生产预付款支付请求（Advance Down Payment Request）

供货方当事人卖方角色（Equipment Supplier Role）办理《首期生产预付款支付请求（Advance Down Payment Request）》，业务时点为2026-01-05T09:00:00Z。仅展示模型声明的事实，未执行验收或规则判定。

#### 首期生产预付款支付请求（Advance Down Payment Request）

| 字段 | 值 | 关键数据 | 来源 |
| --- | --- | --- | --- |
| 应付首期金额 \(advance\_amount\) | \{"currency":"CNY","minorUnits":30000000\} | 是 | — |
| 支付最迟截止时间 \(expired\_at\) | 2026-01-07T18:00:00Z | 是 | — |
| 催付开放时间 \(started\_at\) | 2026-01-05T09:00:00Z | 是 | — |

依据：声明依据：doc-procurement-contract\#质检争议、doc-escrow-agreement\#质检争议

### 6. 办理《首期预付款到账确认书（Advance Payment Bank Confirmation）》

**经办方**：采购方当事人买方角色（Procurement Buyer Role） · **单据**：首期预付款到账确认书（Advance Payment Bank Confirmation）

采购方当事人买方角色（Procurement Buyer Role）办理《首期预付款到账确认书（Advance Payment Bank Confirmation）》，业务时点为2026-01-06T09:00:00Z。仅展示模型声明的事实，未执行验收或规则判定。

#### 首期预付款到账确认书（Advance Payment Bank Confirmation）

| 字段 | 值 | 关键数据 | 来源 |
| --- | --- | --- | --- |
| 实付到账金额 \(confirmed\_amount\) | \{"currency":"CNY","minorUnits":30000000\} | 是 | — |
| 电汇入账确认时刻 \(confirmed\_at\) | 2026-01-06T09:00:00Z | 是 | — |

依据：声明依据：req-advance-payment\#质检争议

### 7. 办理《整机出厂及航运交付催告请求（Equipment Factory Dispatch Request）》

**经办方**：采购方当事人买方角色（Procurement Buyer Role） · **单据**：整机出厂及航运交付催告请求（Equipment Factory Dispatch Request）

采购方当事人买方角色（Procurement Buyer Role）办理《整机出厂及航运交付催告请求（Equipment Factory Dispatch Request）》，业务时点为2026-01-07T09:00:00Z。仅展示模型声明的事实，未执行验收或规则判定。

#### 整机出厂及航运交付催告请求（Equipment Factory Dispatch Request）

| 字段 | 值 | 关键数据 | 来源 |
| --- | --- | --- | --- |
| 交货合同最后时限 \(expired\_at\) | 2026-02-10T09:00:00Z | 是 | — |
| 交付机组数量 \(shipped\_units\_count\) | 2 | 是 | — |
| 提货窗口起始时间 \(started\_at\) | 2026-01-07T09:00:00Z | 是 | — |

依据：声明依据：conf-advance-payment\#质检争议

> ⚠️ 业务待决悬念：《整机出厂及航运交付催告请求（Equipment Factory Dispatch Request）》的业务依据或责任约定尚待补齐，请问需要补充哪些单据、数据来源或经办责任？

### 8. 办理《国际海运多式联运提单签收确认（Multimodal Delivery Confirmation）》

**经办方**：供货方当事人卖方角色（Equipment Supplier Role） · **单据**：国际海运多式联运提单签收确认（Multimodal Delivery Confirmation）

供货方当事人卖方角色（Equipment Supplier Role）办理《国际海运多式联运提单签收确认（Multimodal Delivery Confirmation）》，业务时点为2026-02-09T09:00:00Z。仅展示模型声明的事实，未执行验收或规则判定。

#### 国际海运多式联运提单签收确认（Multimodal Delivery Confirmation）

| 字段 | 值 | 关键数据 | 来源 |
| --- | --- | --- | --- |
| 码头卸货签收时刻 \(confirmed\_at\) | 2026-02-09T09:00:00Z | 是 | — |
| 口岸到货检验状态 \(port\_arrival\_status\) | 待技术核验 | — | — |

依据：声明依据：req-equipment-delivery\#质检争议

### 9. 办理《SGS中立国际技术质量公证证书（SGS Technical Inspection Certificate）》

**经办方**：供货方当事人卖方角色（Equipment Supplier Role） · **单据**：SGS中立国际技术质量公证证书（SGS Technical Inspection Certificate）

供货方当事人卖方角色（Equipment Supplier Role）办理《SGS中立国际技术质量公证证书（SGS Technical Inspection Certificate）》，业务时点为2026-02-12T09:00:00Z。仅展示模型声明的事实，未执行验收或规则判定。

#### SGS中立国际技术质量公证证书（SGS Technical Inspection Certificate）

| 字段 | 值 | 关键数据 | 来源 |
| --- | --- | --- | --- |
| 证书颁发盖章时刻 \(created\_at\) | 2026-02-12T09:00:00Z | 是 | — |
| 安全合规核验通过标志 \(passed\_safety\_checks\) | false | 是 | — |

依据：声明依据：conf-equipment-delivery\#质检争议

### 10. 办理《质检不合格后凭证质押冻结仲裁请求》

**经办方**：资金托管委托人角色（Escrow Depositor Role） · **单据**：质检不合格后凭证质押冻结仲裁请求

资金托管委托人角色（Escrow Depositor Role）办理《质检不合格后凭证质押冻结仲裁请求》，业务时点为2026-02-12T10:00:00Z。仅展示模型声明的事实，未执行验收或规则判定。

#### 质检不合格后凭证质押冻结仲裁请求

| 字段 | 值 | 关键数据 | 来源 |
| --- | --- | --- | --- |
| 仲裁受理期限 \(expired\_at\) | 2026-02-15T10:00:00Z | 是 | — |
| 冻结申请开始 \(started\_at\) | 2026-02-12T10:00:00Z | 是 | — |

依据：声明依据：doc-sgs-inspection-cert\#质检争议、doc-escrow-agreement\#质检争议、conf-equipment-delivery\#质检争议

> ⚠️ 业务待决悬念：《质检不合格后凭证质押冻结仲裁请求》的业务依据或责任约定尚待补齐，请问需要补充哪些单据、数据来源或经办责任？

### 11. 办理《独立托管行冻结受理与仲裁介入确认》

**经办方**：托管结算代理人角色（Escrow Settlement Agent Role） · **单据**：独立托管行冻结受理与仲裁介入确认

托管结算代理人角色（Escrow Settlement Agent Role）办理《独立托管行冻结受理与仲裁介入确认》，业务时点为2026-02-12T11:00:00Z。仅展示模型声明的事实，未执行验收或规则判定。

#### 独立托管行冻结受理与仲裁介入确认

| 字段 | 值 | 关键数据 | 来源 |
| --- | --- | --- | --- |
| 冻结受理时刻 \(confirmed\_at\) | 2026-02-12T11:00:00Z | 是 | — |
| 资金冻结标志 \(frozen\) | true | 是 | — |

依据：声明依据：req-escrow-freeze\#质检争议

> ⚠️ 业务待决悬念：《独立托管行冻结受理与仲裁介入确认》的业务依据或责任约定尚待补齐，请问需要补充哪些单据、数据来源或经办责任？

## happy-path

业务流：happy-path

11 个业务环节：办理《智能装备全球采购招标建议书（Global Procurement RFP）》 → 办理《顶峰数控智能制造装备竞标技术报价单（Apex Bid Proposal）》 → 办理《高端智能装备国际采购主买卖契约（Master Equipment Procurement Agreement）》 → 办理《买方与托管行三方资金托管监管协议（Tripartite Escrow Agreement）》 → 办理《首期生产预付款支付请求（Advance Down Payment Request）》 → 办理《首期预付款到账确认书（Advance Payment Bank Confirmation）》 → 办理《整机出厂及航运交付催告请求（Equipment Factory Dispatch Request）》 → 办理《国际海运多式联运提单签收确认（Multimodal Delivery Confirmation）》 → 办理《SGS中立国际技术质量公证证书（SGS Technical Inspection Certificate）》 → 办理《验收合格后托管尾款放款请求（Final Escrow Release Request）》 → 办理《托管尾款清算放款确认（Final Escrow Release Confirmation）》

**业务目标**：逐步核对happy-path中的单据流转、经办责任与履约依据。

### 1. 办理《智能装备全球采购招标建议书（Global Procurement RFP）》

**经办方**：采购方当事人买方角色（Procurement Buyer Role） · **单据**：智能装备全球采购招标建议书（Global Procurement RFP）

采购方当事人买方角色（Procurement Buyer Role）办理《智能装备全球采购招标建议书（Global Procurement RFP）》，业务时点为2026-01-01T09:00:00Z。仅展示模型声明的事实，未执行验收或规则判定。

#### 智能装备全球采购招标建议书（Global Procurement RFP）

| 字段 | 值 | 关键数据 | 来源 |
| --- | --- | --- | --- |
| 截标时间 \(expired\_at\) | 2026-01-02T18:00:00Z | 是 | — |
| 采购预算上限 \(rfp\_budget\_ceiling\) | \{"currency":"CNY","minorUnits":120000000\} | 是 | — |
| 招标启动时间 \(started\_at\) | 2026-01-01T09:00:00Z | 是 | — |

### 2. 办理《顶峰数控智能制造装备竞标技术报价单（Apex Bid Proposal）》

**经办方**：供货方当事人卖方角色（Equipment Supplier Role） · **单据**：顶峰数控智能制造装备竞标技术报价单（Apex Bid Proposal）

供货方当事人卖方角色（Equipment Supplier Role）办理《顶峰数控智能制造装备竞标技术报价单（Apex Bid Proposal）》，业务时点为2026-01-02T09:00:00Z。仅展示模型声明的事实，未执行验收或规则判定。

#### 顶峰数控智能制造装备竞标技术报价单（Apex Bid Proposal）

| 字段 | 值 | 关键数据 | 来源 |
| --- | --- | --- | --- |
| 报价有效截止日 \(expired\_at\) | 2026-01-04T18:00:00Z | 是 | — |
| 投标总报价 \(quoted\_total\_price\) | \{"currency":"CNY","minorUnits":100000000\} | 是 | — |
| 报价承诺生效时间 \(started\_at\) | 2026-01-02T09:00:00Z | 是 | — |

依据：声明依据：doc-sourcing-rfp\#顺畅履约

### 3. 办理《高端智能装备国际采购主买卖契约（Master Equipment Procurement Agreement）》

**经办方**：采购方当事人买方角色（Procurement Buyer Role） · **单据**：高端智能装备国际采购主买卖契约（Master Equipment Procurement Agreement）

采购方当事人买方角色（Procurement Buyer Role）办理《高端智能装备国际采购主买卖契约（Master Equipment Procurement Agreement）》，业务时点为2026-01-03T09:00:00Z。仅展示模型声明的事实，未执行验收或规则判定。

#### 高端智能装备国际采购主买卖契约（Master Equipment Procurement Agreement）

| 字段 | 值 | 关键数据 | 来源 |
| --- | --- | --- | --- |
| 合同签约总价 \(contract\_total\_amount\) | \{"currency":"CNY","minorUnits":100000000\} | 是 | — |
| 发货交期允许天数 \(delivery\_deadline\_days\) | 35 | — | — |
| 预付款比例 \(down\_payment\_rate\) | 0\.3 | — | — |
| 契约签署生效时刻 \(signed\_at\) | 2026-01-03T09:00:00Z | 是 | — |

依据：声明依据：doc-supplier-proposal\#顺畅履约

### 4. 办理《买方与托管行三方资金托管监管协议（Tripartite Escrow Agreement）》

**经办方**：资金托管委托人角色（Escrow Depositor Role） · **单据**：买方与托管行三方资金托管监管协议（Tripartite Escrow Agreement）

资金托管委托人角色（Escrow Depositor Role）办理《买方与托管行三方资金托管监管协议（Tripartite Escrow Agreement）》，业务时点为2026-01-04T09:00:00Z。仅展示模型声明的事实，未执行验收或规则判定。

#### 买方与托管行三方资金托管监管协议（Tripartite Escrow Agreement）

| 字段 | 值 | 关键数据 | 来源 |
| --- | --- | --- | --- |
| 托管账户冻结资金 \(escrow\_locked\_amount\) | \{"currency":"CNY","minorUnits":100000000\} | 是 | — |
| 托管协议签署时刻 \(signed\_at\) | 2026-01-04T09:00:00Z | 是 | — |

依据：声明依据：doc-procurement-contract\#顺畅履约

> ⚠️ 业务待决悬念：《买方与托管行三方资金托管监管协议（Tripartite Escrow Agreement）》的业务依据或责任约定尚待补齐，请问需要补充哪些单据、数据来源或经办责任？

### 5. 办理《首期生产预付款支付请求（Advance Down Payment Request）》

**经办方**：供货方当事人卖方角色（Equipment Supplier Role） · **单据**：首期生产预付款支付请求（Advance Down Payment Request）

供货方当事人卖方角色（Equipment Supplier Role）办理《首期生产预付款支付请求（Advance Down Payment Request）》，业务时点为2026-01-05T09:00:00Z。仅展示模型声明的事实，未执行验收或规则判定。

#### 首期生产预付款支付请求（Advance Down Payment Request）

| 字段 | 值 | 关键数据 | 来源 |
| --- | --- | --- | --- |
| 应付首期金额 \(advance\_amount\) | \{"currency":"CNY","minorUnits":30000000\} | 是 | — |
| 支付最迟截止时间 \(expired\_at\) | 2026-01-07T18:00:00Z | 是 | — |
| 催付开放时间 \(started\_at\) | 2026-01-05T09:00:00Z | 是 | — |

依据：声明依据：doc-procurement-contract\#顺畅履约、doc-escrow-agreement\#顺畅履约

### 6. 办理《首期预付款到账确认书（Advance Payment Bank Confirmation）》

**经办方**：采购方当事人买方角色（Procurement Buyer Role） · **单据**：首期预付款到账确认书（Advance Payment Bank Confirmation）

采购方当事人买方角色（Procurement Buyer Role）办理《首期预付款到账确认书（Advance Payment Bank Confirmation）》，业务时点为2026-01-06T09:00:00Z。仅展示模型声明的事实，未执行验收或规则判定。

#### 首期预付款到账确认书（Advance Payment Bank Confirmation）

| 字段 | 值 | 关键数据 | 来源 |
| --- | --- | --- | --- |
| 实付到账金额 \(confirmed\_amount\) | \{"currency":"CNY","minorUnits":30000000\} | 是 | — |
| 电汇入账确认时刻 \(confirmed\_at\) | 2026-01-06T09:00:00Z | 是 | — |

依据：声明依据：req-advance-payment\#顺畅履约

### 7. 办理《整机出厂及航运交付催告请求（Equipment Factory Dispatch Request）》

**经办方**：采购方当事人买方角色（Procurement Buyer Role） · **单据**：整机出厂及航运交付催告请求（Equipment Factory Dispatch Request）

采购方当事人买方角色（Procurement Buyer Role）办理《整机出厂及航运交付催告请求（Equipment Factory Dispatch Request）》，业务时点为2026-01-07T09:00:00Z。仅展示模型声明的事实，未执行验收或规则判定。

#### 整机出厂及航运交付催告请求（Equipment Factory Dispatch Request）

| 字段 | 值 | 关键数据 | 来源 |
| --- | --- | --- | --- |
| 交货合同最后时限 \(expired\_at\) | 2026-02-10T09:00:00Z | 是 | — |
| 交付机组数量 \(shipped\_units\_count\) | 2 | 是 | — |
| 提货窗口起始时间 \(started\_at\) | 2026-01-07T09:00:00Z | 是 | — |

依据：声明依据：conf-advance-payment\#顺畅履约

> ⚠️ 业务待决悬念：《整机出厂及航运交付催告请求（Equipment Factory Dispatch Request）》的业务依据或责任约定尚待补齐，请问需要补充哪些单据、数据来源或经办责任？

### 8. 办理《国际海运多式联运提单签收确认（Multimodal Delivery Confirmation）》

**经办方**：供货方当事人卖方角色（Equipment Supplier Role） · **单据**：国际海运多式联运提单签收确认（Multimodal Delivery Confirmation）

供货方当事人卖方角色（Equipment Supplier Role）办理《国际海运多式联运提单签收确认（Multimodal Delivery Confirmation）》，业务时点为2026-02-09T09:00:00Z。仅展示模型声明的事实，未执行验收或规则判定。

#### 国际海运多式联运提单签收确认（Multimodal Delivery Confirmation）

| 字段 | 值 | 关键数据 | 来源 |
| --- | --- | --- | --- |
| 码头卸货签收时刻 \(confirmed\_at\) | 2026-02-09T09:00:00Z | 是 | — |
| 口岸到货检验状态 \(port\_arrival\_status\) | 已到港 | — | — |

依据：声明依据：req-equipment-delivery\#顺畅履约

### 9. 办理《SGS中立国际技术质量公证证书（SGS Technical Inspection Certificate）》

**经办方**：供货方当事人卖方角色（Equipment Supplier Role） · **单据**：SGS中立国际技术质量公证证书（SGS Technical Inspection Certificate）

供货方当事人卖方角色（Equipment Supplier Role）办理《SGS中立国际技术质量公证证书（SGS Technical Inspection Certificate）》，业务时点为2026-02-10T10:00:00Z。仅展示模型声明的事实，未执行验收或规则判定。

#### SGS中立国际技术质量公证证书（SGS Technical Inspection Certificate）

| 字段 | 值 | 关键数据 | 来源 |
| --- | --- | --- | --- |
| 证书颁发盖章时刻 \(created\_at\) | 2026-02-10T10:00:00Z | 是 | — |
| 安全合规核验通过标志 \(passed\_safety\_checks\) | true | 是 | — |

依据：声明依据：conf-equipment-delivery\#顺畅履约

### 10. 办理《验收合格后托管尾款放款请求（Final Escrow Release Request）》

**经办方**：资金托管委托人角色（Escrow Depositor Role） · **单据**：验收合格后托管尾款放款请求（Final Escrow Release Request）

资金托管委托人角色（Escrow Depositor Role）办理《验收合格后托管尾款放款请求（Final Escrow Release Request）》，业务时点为2026-02-11T09:00:00Z。仅展示模型声明的事实，未执行验收或规则判定。

#### 验收合格后托管尾款放款请求（Final Escrow Release Request）

| 字段 | 值 | 关键数据 | 来源 |
| --- | --- | --- | --- |
| 放款窗口截止 \(expired\_at\) | 2026-02-15T18:00:00Z | 是 | — |
| 尾款放款金额 \(release\_amount\) | \{"currency":"CNY","minorUnits":70000000\} | 是 | — |
| 放款窗口开始 \(started\_at\) | 2026-02-11T09:00:00Z | 是 | — |

依据：声明依据：doc-sgs-inspection-cert\#顺畅履约、doc-escrow-agreement\#顺畅履约

> ⚠️ 业务待决悬念：《验收合格后托管尾款放款请求（Final Escrow Release Request）》的业务依据或责任约定尚待补齐，请问需要补充哪些单据、数据来源或经办责任？

### 11. 办理《托管尾款清算放款确认（Final Escrow Release Confirmation）》

**经办方**：托管结算代理人角色（Escrow Settlement Agent Role） · **单据**：托管尾款清算放款确认（Final Escrow Release Confirmation）

托管结算代理人角色（Escrow Settlement Agent Role）办理《托管尾款清算放款确认（Final Escrow Release Confirmation）》，业务时点为2026-02-11T10:00:00Z。仅展示模型声明的事实，未执行验收或规则判定。

#### 托管尾款清算放款确认（Final Escrow Release Confirmation）

| 字段 | 值 | 关键数据 | 来源 |
| --- | --- | --- | --- |
| 放款确认时刻 \(confirmed\_at\) | 2026-02-11T10:00:00Z | 是 | — |
| 实际放款金额 \(released\_amount\) | \{"currency":"CNY","minorUnits":70000000\} | 是 | — |

依据：声明依据：req-escrow-release\#顺畅履约

> ⚠️ 业务待决悬念：《托管尾款清算放款确认（Final Escrow Release Confirmation）》的业务依据或责任约定尚待补齐，请问需要补充哪些单据、数据来源或经办责任？

## late-delivery

业务流：late-delivery

13 个业务环节：办理《智能装备全球采购招标建议书（Global Procurement RFP）》 → 办理《顶峰数控智能制造装备竞标技术报价单（Apex Bid Proposal）》 → 办理《高端智能装备国际采购主买卖契约（Master Equipment Procurement Agreement）》 → 办理《买方与托管行三方资金托管监管协议（Tripartite Escrow Agreement）》 → 办理《首期生产预付款支付请求（Advance Down Payment Request）》 → 办理《首期预付款到账确认书（Advance Payment Bank Confirmation）》 → 办理《整机出厂及航运交付催告请求（Equipment Factory Dispatch Request）》 → 办理《国际海运多式联运提单签收确认（Multimodal Delivery Confirmation）》 → 办理《交货逾期违约赔偿与滞纳金索赔请求（Late Delivery Penalty Request）》 → 办理《SGS中立国际技术质量公证证书（SGS Technical Inspection Certificate）》 → 办理《违约金抵扣与赔偿结清确认凭据（Penalty Compensation Settlement Receipt）》 → 办理《验收合格后托管尾款放款请求（Final Escrow Release Request）》 → 办理《托管尾款清算放款确认（Final Escrow Release Confirmation）》

**业务目标**：逐步核对late-delivery中的单据流转、经办责任与履约依据。

### 1. 办理《智能装备全球采购招标建议书（Global Procurement RFP）》

**经办方**：采购方当事人买方角色（Procurement Buyer Role） · **单据**：智能装备全球采购招标建议书（Global Procurement RFP）

采购方当事人买方角色（Procurement Buyer Role）办理《智能装备全球采购招标建议书（Global Procurement RFP）》，业务时点为2026-01-01T09:00:00Z。仅展示模型声明的事实，未执行验收或规则判定。

#### 智能装备全球采购招标建议书（Global Procurement RFP）

| 字段 | 值 | 关键数据 | 来源 |
| --- | --- | --- | --- |
| 截标时间 \(expired\_at\) | 2026-01-02T18:00:00Z | 是 | — |
| 采购预算上限 \(rfp\_budget\_ceiling\) | \{"currency":"CNY","minorUnits":120000000\} | 是 | — |
| 招标启动时间 \(started\_at\) | 2026-01-01T09:00:00Z | 是 | — |

### 2. 办理《顶峰数控智能制造装备竞标技术报价单（Apex Bid Proposal）》

**经办方**：供货方当事人卖方角色（Equipment Supplier Role） · **单据**：顶峰数控智能制造装备竞标技术报价单（Apex Bid Proposal）

供货方当事人卖方角色（Equipment Supplier Role）办理《顶峰数控智能制造装备竞标技术报价单（Apex Bid Proposal）》，业务时点为2026-01-02T09:00:00Z。仅展示模型声明的事实，未执行验收或规则判定。

#### 顶峰数控智能制造装备竞标技术报价单（Apex Bid Proposal）

| 字段 | 值 | 关键数据 | 来源 |
| --- | --- | --- | --- |
| 报价有效截止日 \(expired\_at\) | 2026-01-04T18:00:00Z | 是 | — |
| 投标总报价 \(quoted\_total\_price\) | \{"currency":"CNY","minorUnits":100000000\} | 是 | — |
| 报价承诺生效时间 \(started\_at\) | 2026-01-02T09:00:00Z | 是 | — |

依据：声明依据：doc-sourcing-rfp\#逾期交货

### 3. 办理《高端智能装备国际采购主买卖契约（Master Equipment Procurement Agreement）》

**经办方**：采购方当事人买方角色（Procurement Buyer Role） · **单据**：高端智能装备国际采购主买卖契约（Master Equipment Procurement Agreement）

采购方当事人买方角色（Procurement Buyer Role）办理《高端智能装备国际采购主买卖契约（Master Equipment Procurement Agreement）》，业务时点为2026-01-03T09:00:00Z。仅展示模型声明的事实，未执行验收或规则判定。

#### 高端智能装备国际采购主买卖契约（Master Equipment Procurement Agreement）

| 字段 | 值 | 关键数据 | 来源 |
| --- | --- | --- | --- |
| 合同签约总价 \(contract\_total\_amount\) | \{"currency":"CNY","minorUnits":100000000\} | 是 | — |
| 发货交期允许天数 \(delivery\_deadline\_days\) | 35 | — | — |
| 预付款比例 \(down\_payment\_rate\) | 0\.3 | — | — |
| 契约签署生效时刻 \(signed\_at\) | 2026-01-03T09:00:00Z | 是 | — |

依据：声明依据：doc-supplier-proposal\#逾期交货

### 4. 办理《买方与托管行三方资金托管监管协议（Tripartite Escrow Agreement）》

**经办方**：资金托管委托人角色（Escrow Depositor Role） · **单据**：买方与托管行三方资金托管监管协议（Tripartite Escrow Agreement）

资金托管委托人角色（Escrow Depositor Role）办理《买方与托管行三方资金托管监管协议（Tripartite Escrow Agreement）》，业务时点为2026-01-04T09:00:00Z。仅展示模型声明的事实，未执行验收或规则判定。

#### 买方与托管行三方资金托管监管协议（Tripartite Escrow Agreement）

| 字段 | 值 | 关键数据 | 来源 |
| --- | --- | --- | --- |
| 托管账户冻结资金 \(escrow\_locked\_amount\) | \{"currency":"CNY","minorUnits":100000000\} | 是 | — |
| 托管协议签署时刻 \(signed\_at\) | 2026-01-04T09:00:00Z | 是 | — |

依据：声明依据：doc-procurement-contract\#逾期交货

> ⚠️ 业务待决悬念：《买方与托管行三方资金托管监管协议（Tripartite Escrow Agreement）》的业务依据或责任约定尚待补齐，请问需要补充哪些单据、数据来源或经办责任？

### 5. 办理《首期生产预付款支付请求（Advance Down Payment Request）》

**经办方**：供货方当事人卖方角色（Equipment Supplier Role） · **单据**：首期生产预付款支付请求（Advance Down Payment Request）

供货方当事人卖方角色（Equipment Supplier Role）办理《首期生产预付款支付请求（Advance Down Payment Request）》，业务时点为2026-01-05T09:00:00Z。仅展示模型声明的事实，未执行验收或规则判定。

#### 首期生产预付款支付请求（Advance Down Payment Request）

| 字段 | 值 | 关键数据 | 来源 |
| --- | --- | --- | --- |
| 应付首期金额 \(advance\_amount\) | \{"currency":"CNY","minorUnits":30000000\} | 是 | — |
| 支付最迟截止时间 \(expired\_at\) | 2026-01-07T18:00:00Z | 是 | — |
| 催付开放时间 \(started\_at\) | 2026-01-05T09:00:00Z | 是 | — |

依据：声明依据：doc-procurement-contract\#逾期交货、doc-escrow-agreement\#逾期交货

### 6. 办理《首期预付款到账确认书（Advance Payment Bank Confirmation）》

**经办方**：采购方当事人买方角色（Procurement Buyer Role） · **单据**：首期预付款到账确认书（Advance Payment Bank Confirmation）

采购方当事人买方角色（Procurement Buyer Role）办理《首期预付款到账确认书（Advance Payment Bank Confirmation）》，业务时点为2026-01-06T09:00:00Z。仅展示模型声明的事实，未执行验收或规则判定。

#### 首期预付款到账确认书（Advance Payment Bank Confirmation）

| 字段 | 值 | 关键数据 | 来源 |
| --- | --- | --- | --- |
| 实付到账金额 \(confirmed\_amount\) | \{"currency":"CNY","minorUnits":30000000\} | 是 | — |
| 电汇入账确认时刻 \(confirmed\_at\) | 2026-01-06T09:00:00Z | 是 | — |

依据：声明依据：req-advance-payment\#逾期交货

### 7. 办理《整机出厂及航运交付催告请求（Equipment Factory Dispatch Request）》

**经办方**：采购方当事人买方角色（Procurement Buyer Role） · **单据**：整机出厂及航运交付催告请求（Equipment Factory Dispatch Request）

采购方当事人买方角色（Procurement Buyer Role）办理《整机出厂及航运交付催告请求（Equipment Factory Dispatch Request）》，业务时点为2026-01-07T09:00:00Z。仅展示模型声明的事实，未执行验收或规则判定。

#### 整机出厂及航运交付催告请求（Equipment Factory Dispatch Request）

| 字段 | 值 | 关键数据 | 来源 |
| --- | --- | --- | --- |
| 交货合同最后时限 \(expired\_at\) | 2026-02-10T09:00:00Z | 是 | — |
| 交付机组数量 \(shipped\_units\_count\) | 2 | 是 | — |
| 提货窗口起始时间 \(started\_at\) | 2026-01-07T09:00:00Z | 是 | — |

依据：声明依据：conf-advance-payment\#逾期交货

> ⚠️ 业务待决悬念：《整机出厂及航运交付催告请求（Equipment Factory Dispatch Request）》的业务依据或责任约定尚待补齐，请问需要补充哪些单据、数据来源或经办责任？

### 8. 办理《国际海运多式联运提单签收确认（Multimodal Delivery Confirmation）》

**经办方**：供货方当事人卖方角色（Equipment Supplier Role） · **单据**：国际海运多式联运提单签收确认（Multimodal Delivery Confirmation）

供货方当事人卖方角色（Equipment Supplier Role）办理《国际海运多式联运提单签收确认（Multimodal Delivery Confirmation）》，业务时点为2026-02-12T09:00:00Z。仅展示模型声明的事实，未执行验收或规则判定。

#### 国际海运多式联运提单签收确认（Multimodal Delivery Confirmation）

| 字段 | 值 | 关键数据 | 来源 |
| --- | --- | --- | --- |
| 码头卸货签收时刻 \(confirmed\_at\) | 2026-02-12T09:00:00Z | 是 | — |
| 口岸到货检验状态 \(port\_arrival\_status\) | 逾期到港 | — | — |

依据：声明依据：req-equipment-delivery\#逾期交货

### 9. 办理《交货逾期违约赔偿与滞纳金索赔请求（Late Delivery Penalty Request）》

**经办方**：采购方当事人买方角色（Procurement Buyer Role） · **单据**：交货逾期违约赔偿与滞纳金索赔请求（Late Delivery Penalty Request）

采购方当事人买方角色（Procurement Buyer Role）办理《交货逾期违约赔偿与滞纳金索赔请求（Late Delivery Penalty Request）》，业务时点为2026-02-12T10:00:00Z。仅展示模型声明的事实，未执行验收或规则判定。

#### 交货逾期违约赔偿与滞纳金索赔请求（Late Delivery Penalty Request）

| 字段 | 值 | 关键数据 | 来源 |
| --- | --- | --- | --- |
| 索赔违约金总额 \(claimed\_penalty\_amount\) | \{"currency":"CNY","minorUnits":100000\} | 是 | — |
| 清偿宽限期截止时间 \(expired\_at\) | 2026-02-15T18:00:00Z | 是 | — |
| 实际逾期天数 \(overdue\_days\) | 2 | 是 | — |
| 索赔主张发起时间 \(started\_at\) | 2026-02-12T10:00:00Z | 是 | — |

依据：声明依据：conf-equipment-delivery\#逾期交货、req-equipment-delivery\#逾期交货

> ⚠️ 业务待决悬念：《交货逾期违约赔偿与滞纳金索赔请求（Late Delivery Penalty Request）》的业务依据或责任约定尚待补齐，请问需要补充哪些单据、数据来源或经办责任？

### 10. 办理《SGS中立国际技术质量公证证书（SGS Technical Inspection Certificate）》

**经办方**：供货方当事人卖方角色（Equipment Supplier Role） · **单据**：SGS中立国际技术质量公证证书（SGS Technical Inspection Certificate）

供货方当事人卖方角色（Equipment Supplier Role）办理《SGS中立国际技术质量公证证书（SGS Technical Inspection Certificate）》，业务时点为2026-02-13T09:00:00Z。仅展示模型声明的事实，未执行验收或规则判定。

#### SGS中立国际技术质量公证证书（SGS Technical Inspection Certificate）

| 字段 | 值 | 关键数据 | 来源 |
| --- | --- | --- | --- |
| 证书颁发盖章时刻 \(created\_at\) | 2026-02-13T09:00:00Z | 是 | — |
| 安全合规核验通过标志 \(passed\_safety\_checks\) | true | 是 | — |

依据：声明依据：conf-equipment-delivery\#逾期交货

### 11. 办理《违约金抵扣与赔偿结清确认凭据（Penalty Compensation Settlement Receipt）》

**经办方**：供货方当事人卖方角色（Equipment Supplier Role） · **单据**：违约金抵扣与赔偿结清确认凭据（Penalty Compensation Settlement Receipt）

供货方当事人卖方角色（Equipment Supplier Role）办理《违约金抵扣与赔偿结清确认凭据（Penalty Compensation Settlement Receipt）》，业务时点为2026-02-13T10:00:00Z。仅展示模型声明的事实，未执行验收或规则判定。

#### 违约金抵扣与赔偿结清确认凭据（Penalty Compensation Settlement Receipt）

| 字段 | 值 | 关键数据 | 来源 |
| --- | --- | --- | --- |
| 违约清结确认时刻 \(confirmed\_at\) | 2026-02-13T10:00:00Z | 是 | — |
| 实际结清违约金额 \(settled\_penalty\_amount\) | \{"currency":"CNY","minorUnits":100000\} | 是 | — |

依据：声明依据：req-breach-penalty\#逾期交货

### 12. 办理《验收合格后托管尾款放款请求（Final Escrow Release Request）》

**经办方**：资金托管委托人角色（Escrow Depositor Role） · **单据**：验收合格后托管尾款放款请求（Final Escrow Release Request）

资金托管委托人角色（Escrow Depositor Role）办理《验收合格后托管尾款放款请求（Final Escrow Release Request）》，业务时点为2026-02-14T09:00:00Z。仅展示模型声明的事实，未执行验收或规则判定。

#### 验收合格后托管尾款放款请求（Final Escrow Release Request）

| 字段 | 值 | 关键数据 | 来源 |
| --- | --- | --- | --- |
| 放款窗口截止 \(expired\_at\) | 2026-02-17T18:00:00Z | 是 | — |
| 尾款放款金额 \(release\_amount\) | \{"currency":"CNY","minorUnits":69900000\} | 是 | — |
| 放款窗口开始 \(started\_at\) | 2026-02-14T09:00:00Z | 是 | — |

依据：声明依据：doc-sgs-inspection-cert\#逾期交货、conf-breach-settlement\#逾期交货、doc-escrow-agreement\#逾期交货

> ⚠️ 业务待决悬念：《验收合格后托管尾款放款请求（Final Escrow Release Request）》的业务依据或责任约定尚待补齐，请问需要补充哪些单据、数据来源或经办责任？

### 13. 办理《托管尾款清算放款确认（Final Escrow Release Confirmation）》

**经办方**：托管结算代理人角色（Escrow Settlement Agent Role） · **单据**：托管尾款清算放款确认（Final Escrow Release Confirmation）

托管结算代理人角色（Escrow Settlement Agent Role）办理《托管尾款清算放款确认（Final Escrow Release Confirmation）》，业务时点为2026-02-14T10:00:00Z。仅展示模型声明的事实，未执行验收或规则判定。

#### 托管尾款清算放款确认（Final Escrow Release Confirmation）

| 字段 | 值 | 关键数据 | 来源 |
| --- | --- | --- | --- |
| 放款确认时刻 \(confirmed\_at\) | 2026-02-14T10:00:00Z | 是 | — |
| 实际放款金额 \(released\_amount\) | \{"currency":"CNY","minorUnits":69900000\} | 是 | — |

依据：声明依据：req-escrow-release\#逾期交货

> ⚠️ 业务待决悬念：《托管尾款清算放款确认（Final Escrow Release Confirmation）》的业务依据或责任约定尚待补齐，请问需要补充哪些单据、数据来源或经办责任？
