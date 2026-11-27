---
type: storage
title: 模型工作区与源文件
description: 目录工作区发现、模型源树语法、读写与字节摘要，以及外部变更冲突边界。
tags: [workspace, files, serialization, digest, model-io, cli]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-27T13:29:03.591Z
sources:
  - id: openwiki-source-52a825b501b0001cef1b2ecc
    resource: repo://apps/cli/src/commands/check.ts
  - id: openwiki-source-64a2b18876b184e07c424672
    resource: repo://apps/cli/src/commands/model.ts
  - id: openwiki-source-934367cee5dc2ef07c9fb835
    resource: repo://apps/desktop/src/main/modelWatcher.ts
  - id: openwiki-source-7bb156d03ddba2cff4399f8b
    resource: repo://apps/desktop/src/main/projectIpc.ts
  - id: openwiki-source-7d6301f8bedb09df7ce20329
    resource: repo://apps/desktop/src/main/projectStore.ts
  - id: openwiki-source-13f52fb4800dd579eb332cd6
    resource: repo://libs/evidence-agent-sensors/src/sensors/native/modelSources.ts
  - id: openwiki-source-38e18c58a2be3089edddbc1a
    resource: repo://libs/evidence-model-core/src/adapters/modelSourceFiles.ts
  - id: openwiki-source-36b616eafb8331e3eddb8d31
    resource: repo://libs/evidence-model-core/src/purity.spec.ts
  - id: openwiki-source-9008514a60858ff717f539ab
    resource: repo://libs/evidence-model-core/src/validation/fmCheck.ts
  - id: openwiki-source-54f28741c6e97dfb9adcc096
    resource: repo://libs/evidence-model-core/tests/support/modelRoot.ts
  - id: openwiki-source-bcadd1e63a7d140ce717e9ea
    resource: repo://libs/evidence-model-io/package.json
  - id: openwiki-source-2c4cbeffd18cdc1b75d15ef4
    resource: repo://libs/evidence-model-io/src/adapters/diskAdapter.ts
  - id: openwiki-source-4fa503355d9f3a8084bea718
    resource: repo://libs/evidence-model-io/src/adapters/modelRoot.ts
  - id: openwiki-source-dedfc22fcf8046b31159c04e
    resource: repo://libs/evidence-model-io/src/workspace.spec.ts
  - id: openwiki-source-e399a918ad3d695b7f506627
    resource: repo://libs/evidence-model-io/src/workspace.ts
  - id: openwiki-source-52858d6130375e8776a048e7
    resource: repo://libs/evidence-schema/src/ast/document.ts
generated: { by: "pi", at: "2026-11-27T13:29:03.591Z" }
---

# 模型工作区与源文件

领域模型以工作区内的 `.evidence/model/` 为源：`model.json` 加上 `entities/`、`relationships/`、`rules/` 三类 JSON 文件。实体样例、来源与业务时间随对应对象保存；Bruno 与交付文件是派生产物。`model-core` 负责纯解析、文件命名和序列化，`model-io` 负责 Node 磁盘操作。core 的纯度测试验证浏览器构建无需 Node builtins，测试有自己的文件读取适配。

## 定位与初始化

CLI 默认从当前目录向上寻找最近的 `.evidence`，不跨 Git 边界。即使最近入口缺模型清单，也不会跳过它选用父工作区。`--workspace` 显式指定目录。启动时检查目录和清单；受管路径不允许通过符号链接穿出工作区。`evidence init` 在已有的目标目录初始化，不覆盖任何已有 `.evidence` 入口。

## 解析、命名与写入

实体文件名采用 category-kind--slug，关系与规则分别采用 relation--slug 和 rule--slug，冲突由稳定后缀消歧。先输出 manifest，再按类和路径排序；JSON 两空格缩进，末尾换行，可选按键排序。解析器以路径诊断报告坏 JSON、无效类型、重复 ID、缺 manifest 和空模型；manifest 版本必须为 6.0，不匹配标记 `model.schema-version`。开启 validate 可追加 strict 语义检查。

`writeModelDirectory` 只管理清单和三类源树。相同字节不重写，改变的文件用同目录临时文件和 rename 逐个替换；不再属于文档的受管 JSON 会删除，其他目录不受影响。写入报告 written/unchanged/removed。`expectedFiles` 可为当前内容提供乐观并发检查；这不是多文件事务。

## 读取范围与摘要

`readModelDirectory` 读取清单及三类模型源树。`readModelRoot` 读取检查使用的受管源文件，也包含根 README；忽略其它目录和生成物，缺目录返回空输入，由 parser 报告。`modelDigestOf` 按路径排序，把 path → sha256(bytes) 映射再计算 SHA-256；路径或字节变化会改变摘要，搬动工作区不会。

磁盘检查可复查来源摘要；API 的 `loadModel` 在读取前后确认来源没有变化。桌面以目录读取结果的摘要校验写入，并用 watcher 区分自身提交和外部编辑。外部更改暂停待写，显式从磁盘重载才替换当前模型，不自动合并。

## 命令与验证

构建 CLI 后使用 `evidence inspect --json` 查看模型统计，`evidence check --scope <context>` 检查模型和交付范围。`compile` / `lineage` 校验后写到 `.evidence/derived/`。`workspace.spec.ts` 保护初始化与发现边界，modelRoot 和磁盘适配测试保护源文件选择、幂等写入和外部文件；桌面 projectStore/projectIpc 测试保护冲突检查。

## 相关页面

- [FM v6 语言与严格契约](../language/fm-dsl.md)
- [桌面宿主与项目生命周期](../desktop/app-shell.md)
- [受控模型变更、会话与历史](./commands-and-session.md)
- [统一 CLI 与双门禁验收工作流](../workflows/cli-governance.md)
