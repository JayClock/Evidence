# 办公笔记本采购履约示例模型

这个目录当前用于演示 React Flow 下的履约建模布局效果。

场景：甲方向乙方采购 100 台办公笔记本电脑。

## 布局重点

- `合约前上下文`：RFP → Proposal，并挂询价/报价凭证。
- `合约的上下文`：Contract 作为入口，分出支付、开票、发货三条履约分支。
- Role 位于合约上下文上方，包含采购方、供应方、收货方，以及 `ROLE:3rd system` 的第三方系统角色。
- Party / Thing / Place 等参与对象位于合约上下文下方。
- RFP / Proposal / Evidence 到 Thing 的补充关系存在于数据里，视图默认收敛，选中相关节点时展开。

## 目录结构

```txt
.evidence/
  entities/      # Context / Evidence / Role / Participant 节点
  associations/  # 节点之间的履约、凭证、角色、参与对象关系
```
