# Evidence 软件交付旅程

本文件描述维护 Evidence 产品时使用的工程反馈循环。它不是 Evidence 产品用户旅程，不应复制到 `docs/product/`。

## WIP 约束

- 一个 iteration 只有一张 active Story。
- 一张 Story 可以包含多个候选示例，但一次编码只选择一个最小可验收场景。
- 当前 Story 未经 Showcase 得到反馈前，不启动下一张 Story。
- 拆分出的工作以新的 Story/Issue 进入后续 iteration，不在当前 iteration 建立并行子流程。

## 反馈循环

1. **Kickoff**：从冻结的 GitHub Issue 选择一张 Story，确认角色、问题、价值、成功信号和本轮非目标。
2. **Discover**：以 TQA 一次澄清一个高价值业务未知，并用具体 Given/When/Then 示例确认答案。
3. **Model**：Modeler 尝试用当前 `.evidence` 模型展开示例；只有解释失败时才提出最小模型变化。
4. **Check**：独立 Model Checker 寻找不能展开的步骤、缺失关系、冲突不变量、含混术语和未解释结果；Model/Check 循环直到 desk check 可通过。
5. **Design**：把一个场景映射到 owning runtime、功能上下文、架构增量、Q2/Q1、测试替身、测试工序和实现边界。
6. **Build**：按工序执行有语义的 Red → 最小 Green → 保持 Green 的 Refactor，并追加机器执行事实。
7. **Showcase**：向领域专家展示可运行场景及模型解释；由人判断价值是否成立，并记录接受、继续学习或停止。
8. **Learn**：将 Probe/Sense/Respond 转化为权威知识变化或下一张 Issue；原始 iteration 证据保持不可变。

## 人工反馈点

| 时点                           | 人类判断                   | 不应由 Gate 代替的原因         |
| ------------------------------ | -------------------------- | ------------------------------ |
| Kickoff                        | 这个问题现在是否值得解决   | 优先级和价值依赖业务情境       |
| Model walkthrough / desk check | 模型是否能自然解释真实例子 | 统一语言与隐性规则需要领域知识 |
| Showcase                       | 可运行增量是否解决问题     | 测试通过不能代替产品价值判断   |

格式、Schema、路径、哈希、命令结果和静态质量规则由确定性 Checker 执行，不增加人工审批层。
