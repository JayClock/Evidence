# 跨境设备采购：交付、索赔与托管放款

一批工作站约定总价 100 万元，首付 30%。买方要求交货时，卖方拿什么证明已经交付？银行收到尾款放款请求时，又凭什么判断该放款还是冻结？这个案例从两份协议分别回答这两个问题。

| 合约上下文 | 谁对谁负责                                                                                                           | 可以追溯的凭证                                                                                                             |
| ---------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 设备采购   | 买方与供应商签约。卖方要求支付首款，买方登记银行到账回执；买方要求交货，卖方登记到港交付结果。                       | 采购合同引用寻源阶段的中选报价。交付请求既引用采购合同，也引用预付款确认；发生逾期时，索赔请求指明合同和被违反的交付请求。 |
| 资金托管   | 买方另与银行签约。买方向银行申请放款或冻结，银行确认实际划付或停止划付。供应商是收款人，不是托管协议的第三个签约人。 | 银行可核对采购侧已登记的检验结果。发生争议时，采购侧的交付确认在托管侧充当「质押凭单」，无需重签一份提单。                 |

**谁出证，谁备案？** SGS 提供独立的检验出证服务；卖方负责把检验结果登记到采购合同中。`doc-sgs-inspection-cert` 是这次备案留下的其它凭证，`created_at` 是备案时刻，而非卖方签发第三方证书的时刻。它不能代替卖方的交付确认，也不能代替银行的冻结确认。

## 用三条记录链演练

- **`happy-path`**：买方征询、卖方报价、双方签约。在预付款到账后买方请求交付；卖方在截止前登记到港，并备案合格证书。买方申请尾款，银行确认划付 70 万元。
- **`late-delivery`**：交付窗口在 2 月 10 日 09:00 UTC 截止，交付确认在 2 月 12 日 09:00 UTC 形成。凭证仍然留存，但证明的是**迟了两天**。买方按合同总额 × 固定日费率 0.05% × 2 索赔 1,000 元；卖方确认抵扣后，银行实际划付 699,000 元。
- **`defect-escalation`**：有交付确认，但技术检验不合格。买方依据不合格备案和质押凭单申请冻结；到银行登记 `frozen: true`，才有停止划付的证明。记录到此为止，不推定仲裁受理或裁决。

这些是独立样例。签约和确认各记一个时刻；征询、报价及履约请求各有开始和截止时刻。签约时的托管金额检查只要求金额为正，报价检查也只要求报价为正，两者都不是资金守恒或技术资质认证。

## 阅读与核验

从 [模型源](.evidence/model/model.json) 查看两份合同；从[故事](.evidence/stories/story.md)依次核对每一步的形成方、时间和依据。例子保留了六类凭证和五类角色，校验的是建模元素，不是银行后端。仓库根目录可执行：

```sh
pnpm nx build cli
pnpm evidence check --workspace examples/full-spectrum-procurement
pnpm evidence export --workspace examples/full-spectrum-procurement --openapi --verify
pnpm evidence story --workspace examples/full-spectrum-procurement --no-ai --export
pnpm exec vitest run libs/evidence-schema/tests/fixtures/fullSpectrumProcurement.spec.ts libs/evidence-model-core/src/validation/fullSpectrumProcurement.spec.ts libs/evidence-acceptance/src/fullSpectrumVerification.spec.ts
```

不带 `--scope` 的检查验证模型一致性，不证明两份合同已经可以独立交付。按两个合同做完整性检查时，仍有托管方作为请求权利人的正向履约、补偿与升级交接关系未满足仓库的交付门禁。三个故事和 [OpenAPI](.evidence/delivery/release/openapi.json) 不代表已通过真实 HTTP 验收。
