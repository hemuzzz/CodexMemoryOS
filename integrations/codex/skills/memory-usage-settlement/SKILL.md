---
name: memory-usage-settlement
description: Mark persistent CodexMemoryOS knowledge sources that materially influenced the current work as Used. Do not fabricate missing delivery facts.
---

# 知识使用结算

遵循安装位置同一 Codex home 下的 KNOWLEDGE.md 和实际工具 Schema。仅对确实影响分析、决策、实现、修复或审查的知识执行结算；仅召回、摘要交付或读取不等于 Used。

1. 选用实际已持久的 recallItemId 或 readRef；不要自填 assetId + Hash，也不要从空引用制造来源。
2. 每次选择仍有效且覆盖该条目原来源和当前资格的已授权 capabilityIds；GLOBAL 可以 []。不必恢复父召回中无关的项目范围，不默认全选已有能力。无能力时说明缺口，不自填路径授权。
3. 调用 asset_mark_used({capabilityIds, recallItemId}) 或 asset_mark_used({capabilityIds, readRef})，严格二选一。关联读取规范化为同一个召回来源，重复 Used 返回相同 usedId 和 created=false。独立召回或直接读取才是不同来源。
4. 旧内容实际影响过工作，后来合法演进，仍可结算合法旧引用；累计到 assetId，不按 Hash 分版本，不重新读取旧正文。资格失效仍拒绝。
5. Used 写失败如实说明，可按原持久引用重试。不要额外 Recall/Read 造账；不要直接修改数据库。usageRecorded=false 没有本次稳定引用，后来重新 Read 仅证明新的实际读取，不能补报先前历史。
6. 不自动推断使用、更新知识正式性或修改计数。知识故障不阻断独立主工作；正常知识调用不可回退旧接口。
